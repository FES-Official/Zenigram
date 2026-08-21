import { randomBytes } from "crypto";
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  getDynamoDocumentClient,
  getDynamoTableName,
} from "@/app/lib/dynamodb";
import {
  deleteS3Objects,
  deleteS3Prefix,
  getS3KeyFromUrl,
  getReadableMediaUrl,
  hydrateMediaItem,
  hydratePostMedia,
  hydrateUserMedia,
  isOwnedMediaKey,
} from "@/app/lib/s3Storage";

const INDEX_NAME = process.env.DYNAMODB_GSI_NAME || "GSI1";
const USER_POSTS_INDEX_NAME = process.env.DYNAMODB_USER_POSTS_GSI_NAME || "GSI2";

function client() {
  return getDynamoDocumentClient();
}

function table() {
  return getDynamoTableName();
}

function now() {
  return new Date().toISOString();
}

function newId() {
  return randomBytes(12).toString("hex");
}

function userPk(userId) {
  return `USER#${userId}`;
}

function postPk(postId) {
  return `POST#${postId}`;
}

function clipPk(clipId) {
  return `CLIP#${clipId}`;
}

function cleanItem(item) {
  if (!item) return null;
  const value = { ...item };
  delete value.PK;
  delete value.SK;
  delete value.GSI1PK;
  delete value.GSI1SK;
  delete value.GSI2PK;
  delete value.GSI2SK;
  return value;
}

async function batchGet(keys) {
  if (!keys.length) return [];
  const output = [];
  for (let index = 0; index < keys.length; index += 100) {
    let request = keys.slice(index, index + 100);
    do {
      const result = await client().send(
        new BatchGetCommand({ RequestItems: { [table()]: { Keys: request } } }),
      );
      output.push(...(result.Responses?.[table()] || []));
      request = result.UnprocessedKeys?.[table()]?.Keys || [];
    } while (request.length);
  }
  return output;
}

async function batchPut(items) {
  for (let index = 0; index < items.length; index += 25) {
    let requests = items.slice(index, index + 25).map((Item) => ({
      PutRequest: { Item },
    }));
    do {
      const result = await client().send(
        new BatchWriteCommand({ RequestItems: { [table()]: requests } }),
      );
      requests = result.UnprocessedItems?.[table()] || [];
    } while (requests.length);
  }
}

async function batchDelete(keys) {
  for (let index = 0; index < keys.length; index += 25) {
    let requests = keys.slice(index, index + 25).map((Key) => ({
      DeleteRequest: { Key },
    }));
    do {
      const result = await client().send(
        new BatchWriteCommand({ RequestItems: { [table()]: requests } }),
      );
      requests = result.UnprocessedItems?.[table()] || [];
    } while (requests.length);
  }
}

async function scanAllItems() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const result = await client().send(
      new ScanCommand({
        TableName: table(),
        ExclusiveStartKey,
        ConsistentRead: true,
      }),
    );
    items.push(...(result.Items || []));
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

function mediaValues(item) {
  if (!item) return [];
  return [
    item.profilePicKey,
    item.profilePic,
    item.mediaKey,
    item.mediaPublicId,
    item.mediaUrl,
    ...(item.mediaItems || []).flatMap((media) => [
      media?.key,
      media?.publicId,
      media?.url,
    ]),
    ...(item.media || []).flatMap((media) => [
      media?.key,
      media?.publicId,
      media?.url,
    ]),
  ].filter(Boolean);
}

async function getRawUserById(userId) {
  if (!userId) return null;
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: { PK: userPk(userId), SK: "PROFILE" },
      ConsistentRead: true,
    }),
  );
  return cleanItem(result.Item);
}

export async function getUserById(userId) {
  return hydrateUserMedia(await getRawUserById(userId));
}

export async function getUsersByIds(userIds = []) {
  const ids = [...new Set(userIds.map(String).filter(Boolean))];
  if (!ids.length) return [];
  const users = await batchGet(
    ids.map((id) => ({ PK: userPk(id), SK: "PROFILE" })),
  );
  const hydrated = await Promise.all(
    users.map((item) => hydrateUserMedia(cleanItem(item))),
  );
  const map = new Map(hydrated.map((user) => [String(user._id), user]));
  return ids.map((id) => map.get(id)).filter(Boolean);
}

async function getLookup(kind, value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: { PK: `LOOKUP#${kind}#${normalized}`, SK: "USER" },
      ConsistentRead: true,
    }),
  );
  return result.Item?.userId ? getUserById(result.Item.userId) : null;
}

export function getUserByEmail(email) {
  return getLookup("EMAIL", email);
}

export function getUserByUsername(username) {
  return getLookup("USERNAME", username);
}

export async function getUserByIdentifier(identifier) {
  return String(identifier || "").includes("@")
    ? getUserByEmail(identifier)
    : getUserByUsername(identifier);
}

export async function createUser(input) {
  const id = input._id || newId();
  const createdAt = input.createdAt || now();
  const user = {
    _id: id,
    entityType: "user",
    fullname: input.fullname || "",
    username: String(input.username || "").toLowerCase(),
    email: String(input.email || "").toLowerCase(),
    password: input.password || "",
    authProvider: input.authProvider || "credentials",
    bio: input.bio || "",
    website: input.website || "",
    DOB: input.DOB || "",
    gender: input.gender || "",
    mobile: input.mobile || "",
    profilePic: input.profilePic || "",
    ishidden: Boolean(input.ishidden),
    accountStatus: input.accountStatus || "active",
    progression: input.progression || {},
    postCount: Number(input.postCount || 0),
    supportersCount: Number(input.supportersCount || 0),
    supportingCount: Number(input.supportingCount || 0),
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    lastLogin: input.lastLogin || null,
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table(),
            Item: { PK: userPk(id), SK: "PROFILE", ...user },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: table(),
            Item: {
              PK: `LOOKUP#EMAIL#${user.email}`,
              SK: "USER",
              userId: id,
            },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
        {
          Put: {
            TableName: table(),
            Item: {
              PK: `LOOKUP#USERNAME#${user.username}`,
              SK: "USER",
              userId: id,
            },
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
      ],
    }),
  );
  return user;
}

export async function updateUser(userId, updates) {
  const current = await getRawUserById(userId);
  if (!current) return null;
  const next = {
    ...current,
    ...updates,
    _id: userId,
    entityType: "user",
    updatedAt: now(),
  };
  const transactions = [];
  if (next.username !== current.username) {
    transactions.push(
      {
        Delete: {
          TableName: table(),
          Key: { PK: `LOOKUP#USERNAME#${current.username}`, SK: "USER" },
        },
      },
      {
        Put: {
          TableName: table(),
          Item: {
            PK: `LOOKUP#USERNAME#${next.username}`,
            SK: "USER",
            userId,
          },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    );
  }
  transactions.push({
    Put: {
      TableName: table(),
      Item: { PK: userPk(userId), SK: "PROFILE", ...next },
    },
  });
  await client().send(new TransactWriteCommand({ TransactItems: transactions }));
  return next;
}

export async function deleteAccountPermanently(userId) {
  const user = await getRawUserById(userId);
  if (!user) return null;
  const allItems = await scanAllItems();
  const ownedPostIds = new Set(
    allItems
      .filter((item) => item.entityType === "post" && item.userId === userId)
      .map((item) => item._id),
  );
  const ownedStoryIds = new Set(
    allItems
      .filter((item) => item.entityType === "story" && item.userId === userId)
      .map((item) => item._id),
  );
  const ownedClipIds = new Set(
    allItems
      .filter((item) => item.entityType === "clip" && item.userId === userId)
      .map((item) => item._id),
  );
  const ownedConversationIds = new Set(
    allItems
      .filter(
        (item) =>
          item.entityType === "conversation" &&
          (item.participantIds || []).includes(userId),
      )
      .map((item) => item._id),
  );

  const ownedMediaItems = allItems.filter(
    (item) =>
      (item.entityType === "post" && item.userId === userId) ||
      (item.entityType === "clip" && item.userId === userId) ||
      (item.entityType === "story" && item.userId === userId) ||
      (item.entityType === "message" && item.sender === userId) ||
      (item.PK === userPk(userId) && item.SK === "PROFILE"),
  );
  const legacyMedia = ownedMediaItems
    .flatMap(mediaValues)
    .map((value) => getS3KeyFromUrl(value, true))
    .filter(
      (key) =>
        key &&
        !isOwnedMediaKey(key, userId) &&
        (key.includes(`/${userId}/`) ||
          key.startsWith(`messages/${userId}/`)),
    );
  const prefixMediaCount = await deleteS3Prefix(`media/${userId}/`);
  await deleteS3Objects(legacyMedia);

  const shouldDelete = (item) =>
    item.PK === userPk(userId) ||
    (item.PK === `LOOKUP#EMAIL#${user.email}` && item.SK === "USER") ||
    (item.PK === `LOOKUP#USERNAME#${user.username}` && item.SK === "USER") ||
    ownedPostIds.has(item.PK?.replace(/^POST#/, "")) ||
    ownedStoryIds.has(item.PK?.replace(/^STORY#/, "")) ||
    ownedClipIds.has(item.PK?.replace(/^CLIP#/, "")) ||
    ownedConversationIds.has(item.PK?.replace(/^CONVERSATION#/, "")) ||
    ownedConversationIds.has(item.conversationId) ||
    ownedPostIds.has(item.postId) ||
    ownedPostIds.has(item.post) ||
    item.userId === userId ||
    item.sender === userId ||
    item.senderId === userId ||
    item.recipient === userId ||
    item.recipientId === userId ||
    item.blockerId === userId ||
    item.blockedUserId === userId ||
    item.requesterId === userId ||
    item.reporter === userId ||
    item.targetUser === userId ||
    (item.participantIds || []).includes(userId);

  const deleteItems = allItems.filter(shouldDelete);
  const deleteKeySet = new Set(
    deleteItems.map((item) => `${item.PK}|${item.SK}`),
  );
  const remaining = allItems.filter(
    (item) => !deleteKeySet.has(`${item.PK}|${item.SK}`),
  );
  await batchDelete(
    deleteItems.map((item) => ({ PK: item.PK, SK: item.SK })),
  );

  const repairWrites = [];
  for (const item of remaining) {
    if (
      item.entityType === "collection" &&
      (item.postIds || []).some((postId) => ownedPostIds.has(postId))
    ) {
      repairWrites.push(
        client().send(
          new UpdateCommand({
            TableName: table(),
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: "SET postIds = :postIds",
            ExpressionAttributeValues: {
              ":postIds": (item.postIds || []).filter(
                (postId) => !ownedPostIds.has(postId),
              ),
            },
          }),
        ),
      );
    }
    if (
      item.entityType === "message" &&
      ownedPostIds.has(item.sharedPost?._id)
    ) {
      repairWrites.push(
        client().send(
          new UpdateCommand({
            TableName: table(),
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: "SET sharedPost = :empty, updatedAt = :now",
            ExpressionAttributeValues: { ":empty": null, ":now": now() },
          }),
        ),
      );
    }
    if (
      item.entityType === "message" &&
      ownedClipIds.has(item.sharedClip?._id)
    ) {
      repairWrites.push(
        client().send(
          new UpdateCommand({
            TableName: table(),
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: "SET sharedClip = :empty, updatedAt = :now",
            ExpressionAttributeValues: { ":empty": null, ":now": now() },
          }),
        ),
      );
    }
    if (ownedClipIds.has(item.lastMessage?.sharedClip?._id)) {
      repairWrites.push(
        client().send(
          new UpdateCommand({
            TableName: table(),
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression: "SET lastMessage.sharedClip = :empty, updatedAt = :now",
            ExpressionAttributeValues: { ":empty": null, ":now": now() },
          }),
        ),
      );
    }
    if (
      item.entityType === "storyEvent" &&
      ((item.contributorIds || []).includes(userId) || item.createdBy === userId)
    ) {
      const contributorIds = (item.contributorIds || []).filter(
        (id) => id !== userId,
      );
      repairWrites.push(
        client().send(
          new UpdateCommand({
            TableName: table(),
            Key: { PK: item.PK, SK: item.SK },
            UpdateExpression:
              "SET contributorIds = :contributors, createdBy = :creator, storyCount = :storyCount, updatedAt = :now",
            ExpressionAttributeValues: {
              ":contributors": contributorIds,
              ":creator": item.createdBy === userId ? contributorIds[0] || null : item.createdBy,
              ":storyCount": Math.max(
                0,
                Number(item.storyCount || 0) -
                  [...ownedStoryIds].filter(
                    (storyId) =>
                      allItems.find((candidate) => candidate._id === storyId)
                        ?.eventId === item._id,
                  ).length,
              ),
              ":now": now(),
            },
          }),
        ),
      );
    }
  }

  const remainingProfiles = remaining.filter(
    (item) => item.entityType === "user" && item._id !== userId,
  );
  for (const profile of remainingProfiles) {
    const pk = userPk(profile._id);
    const supportersCount = remaining.filter(
      (item) => item.PK === pk && item.SK?.startsWith("SUPPORTER#"),
    ).length;
    const supportingCount = remaining.filter(
      (item) => item.PK === pk && item.SK?.startsWith("SUPPORTING#"),
    ).length;
    if (
      supportersCount !== Number(profile.supportersCount || 0) ||
      supportingCount !== Number(profile.supportingCount || 0)
    ) {
      repairWrites.push(
        client().send(
          new UpdateCommand({
            TableName: table(),
            Key: { PK: pk, SK: "PROFILE" },
            UpdateExpression:
              "SET supportersCount = :supporters, supportingCount = :supporting, updatedAt = :now",
            ExpressionAttributeValues: {
              ":supporters": supportersCount,
              ":supporting": supportingCount,
              ":now": now(),
            },
          }),
        ),
      );
    }
  }
  await Promise.all(repairWrites);
  return {
    deletedItems: deleteItems.length,
    deletedMedia: prefixMediaCount + legacyMedia.length,
  };
}

export async function searchUsers(query, limit = 8) {
  const result = await client().send(
    new ScanCommand({
      TableName: table(),
      FilterExpression:
        "entityType = :user AND begins_with(username, :query) AND accountStatus = :active",
      ExpressionAttributeValues: {
        ":user": "user",
        ":query": String(query || "").toLowerCase(),
        ":active": "active",
      },
      Limit: Math.max(20, limit * 5),
    }),
  );
  return Promise.all(
    (result.Items || [])
      .slice(0, limit)
      .map((item) => hydrateUserMedia(cleanItem(item))),
  );
}

export async function getUserRelations(userId) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": userPk(userId) },
      ConsistentRead: true,
    }),
  );
  const items = result.Items || [];
  return {
    supporters: items
      .filter((item) => item.SK.startsWith("SUPPORTER#"))
      .map((item) => item.userId),
    supporting: items
      .filter((item) => item.SK.startsWith("SUPPORTING#"))
      .map((item) => item.userId),
    blockedUsers: items
      .filter((item) => item.SK.startsWith("BLOCK#"))
      .map((item) => item.userId),
    blockedByUsers: items
      .filter((item) => item.SK.startsWith("BLOCKED_BY#"))
      .map((item) => item.blockerId),
    unblockRequests: items
      .filter((item) => item.SK.startsWith("UNBLOCK_REQUEST#"))
      .map(cleanItem),
    sentUnblockRequests: items
      .filter((item) => item.SK.startsWith("UNBLOCK_REQUEST_SENT#"))
      .map(cleanItem),
    savedPosts: items
      .filter((item) => item.SK.startsWith("SAVED#"))
      .map((item) => item.postId),
    savedClips: items
      .filter((item) => item.SK.startsWith("SAVED_CLIP#"))
      .map((item) => item.clipId),
  };
}

export async function listSupportSuggestions(userId, limit = 5) {
  const relations = await getUserRelations(userId);
  const excluded = new Set([
    String(userId),
    ...(relations.supporting || []).map(String),
    ...(relations.blockedUsers || []).map(String),
    ...(relations.blockedByUsers || []).map(String),
  ]);
  const result = await client().send(
    new ScanCommand({
      TableName: table(),
      FilterExpression: "entityType = :user AND accountStatus = :active",
      ExpressionAttributeValues: { ":user": "user", ":active": "active" },
      Limit: Math.max(40, limit * 10),
    }),
  );
  const candidates = (result.Items || [])
    .map(cleanItem)
    .filter((candidate) => !excluded.has(String(candidate._id)));
  const scored = await Promise.all(
    candidates.map(async (candidate) => {
      const candidateRelations = await getUserRelations(candidate._id);
      const mutualIds = (candidateRelations.supporters || []).filter((id) =>
        relations.supporting.includes(id),
      );
      return {
        candidate: await hydrateUserMedia(candidate),
        mutualIds,
        score:
          mutualIds.length * 100 +
          Number(candidate.supportersCount || 0) * 2 +
          Number(candidate.postCount || 0),
      };
    }),
  );
  scored.sort((left, right) => right.score - left.score);
  const selected = scored.slice(0, limit);
  const mutualUsers = await getUsersByIds(
    selected.flatMap((item) => item.mutualIds.slice(0, 2)),
  );
  const mutualMap = new Map(mutualUsers.map((user) => [user._id, user]));
  return selected.map(({ candidate, mutualIds }) => ({
    _id: candidate._id,
    username: candidate.username,
    fullname: candidate.fullname,
    profilePic: candidate.profilePic,
    ishidden: Boolean(candidate.ishidden),
    supportersCount: Number(candidate.supportersCount || 0),
    mutualSupporters: mutualIds
      .slice(0, 2)
      .map((id) => mutualMap.get(id))
      .filter(Boolean)
      .map((user) => ({
        _id: user._id,
        username: user.username,
        profilePic: user.profilePic,
      })),
    mutualCount: mutualIds.length,
  }));
}

export async function createPost({
  userId,
  caption,
  mediaItems,
  presentation = "single",
  carouselStyle = "classic",
  gridLayout = "",
  aspectRatio = "square",
}) {
  const id = newId();
  const createdAt = now();
  const first = mediaItems[0];
  const post = {
    _id: id,
    entityType: "post",
    userId,
    caption,
    mediaItems,
    presentation,
    carouselStyle,
    gridLayout,
    aspectRatio,
    mediaUrl: first.url,
    mediaType: first.type,
    mediaPublicId: first.key,
    mediaProvider: "s3",
    likesCount: 0,
    commentsCount: 0,
    shareCount: 0,
    hideCount: false,
    createdAt,
    updatedAt: createdAt,
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table(),
            Item: {
              PK: postPk(id),
              SK: "META",
              GSI1PK: "FEED#POSTS",
              GSI1SK: `${createdAt}#${id}`,
              GSI2PK: `USERPOSTS#${userId}`,
              GSI2SK: `${createdAt}#${id}`,
              ...post,
            },
          },
        },
        {
          Update: {
            TableName: table(),
            Key: { PK: userPk(userId), SK: "PROFILE" },
            UpdateExpression: "ADD postCount :one SET updatedAt = :now",
            ExpressionAttributeValues: { ":one": 1, ":now": createdAt },
          },
        },
      ],
    }),
  );
  return hydratePostMedia(post);
}

export async function getPost(postId) {
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: { PK: postPk(postId), SK: "META" },
    }),
  );
  return cleanItem(result.Item);
}

export async function getPostForViewer(postId, viewerId) {
  const post = await getPost(postId);
  if (!post || !viewerId) return null;

  const [hydratedPost, relations] = await Promise.all([
    hydratePosts([post], viewerId).then(([item]) => item || null),
    getUserRelations(viewerId),
  ]);
  if (!hydratedPost?.user || hydratedPost.user.accountStatus !== "active") {
    return null;
  }

  const blocked = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ]);
  if (blocked.has(hydratedPost.userId)) return null;

  const canViewHiddenAccount =
    !hydratedPost.user.ishidden ||
    hydratedPost.userId === viewerId ||
    relations.supporting?.includes(hydratedPost.userId);

  return canViewHiddenAccount ? hydratedPost : null;
}

async function hydratePosts(posts, viewerId) {
  const userIds = [...new Set(posts.map((post) => post.userId))];
  const users = await batchGet(
    userIds.map((id) => ({ PK: userPk(id), SK: "PROFILE" })),
  );
  const hydratedUsers = await Promise.all(users.map((item) => hydrateUserMedia(cleanItem(item))));
  const usersById = new Map(hydratedUsers.map((item) => [item._id, item]));
  const viewerKeys = viewerId
    ? posts.flatMap((post) => [
        { PK: postPk(post._id), SK: `LIKE#${viewerId}` },
        { PK: userPk(viewerId), SK: `SAVED#${post._id}` },
      ])
    : [];
  const viewerItems = await batchGet(viewerKeys);
  const viewerSet = new Set(viewerItems.map((item) => `${item.PK}|${item.SK}`));
  return Promise.all(posts.map(async (post) => ({
    ...(await hydratePostMedia(post)),
    user: usersById.get(post.userId) || null,
    likes: viewerSet.has(`${postPk(post._id)}|LIKE#${viewerId}`)
      ? [viewerId]
      : [],
    comments: Array.from({ length: post.commentsCount || 0 }),
    viewerSaved: viewerSet.has(`${userPk(viewerId)}|SAVED#${post._id}`),
  })));
}

export async function listFeedPosts(viewerId, limit = 80) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      IndexName: INDEX_NAME,
      KeyConditionExpression: "GSI1PK = :feed",
      ExpressionAttributeValues: { ":feed": "FEED#POSTS" },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  const posts = (result.Items || []).map(cleanItem);
  const [hydrated, relations] = await Promise.all([
    hydratePosts(posts, viewerId),
    viewerId ? getUserRelations(viewerId) : Promise.resolve({ blockedUsers: [] }),
  ]);
  const blocked = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ]);
  return hydrated.filter(
    (post) =>
      post.user &&
      post.user.accountStatus === "active" &&
      !blocked.has(post.userId) &&
      (!post.user.ishidden ||
        post.userId === viewerId ||
        relations.supporting?.includes(post.userId)),
  );
}

export async function listUserPosts(userId, viewerId) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      IndexName: USER_POSTS_INDEX_NAME,
      KeyConditionExpression: "GSI2PK = :userPosts",
      ExpressionAttributeValues: { ":userPosts": `USERPOSTS#${userId}` },
      ScanIndexForward: false,
    }),
  );
  return hydratePosts((result.Items || []).map(cleanItem), viewerId);
}

export async function deletePost(postId, userId) {
  const post = await getPost(postId);
  if (!post || post.userId !== userId) return false;
  await deleteS3Objects(mediaValues(post));

  const allItems = await scanAllItems();
  const deleteKeys = allItems
    .filter(
      (item) =>
        item.PK === postPk(postId) ||
        item.postId === postId ||
        item.post === postId,
    )
    .map((item) => ({ PK: item.PK, SK: item.SK }));
  const collections = allItems.filter(
    (item) =>
      item.entityType === "collection" &&
      (item.postIds || []).includes(postId),
  );
  const sharedMessages = allItems.filter(
    (item) => item.entityType === "message" && item.sharedPost?._id === postId,
  );

  await batchDelete(deleteKeys);
  await Promise.all([
    ...collections.map((item) =>
      client().send(
        new UpdateCommand({
          TableName: table(),
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: "SET postIds = :postIds",
          ExpressionAttributeValues: {
            ":postIds": item.postIds.filter((id) => id !== postId),
          },
        }),
      ),
    ),
    ...sharedMessages.map((item) =>
      client().send(
        new UpdateCommand({
          TableName: table(),
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: "SET sharedPost = :empty, updatedAt = :now",
          ExpressionAttributeValues: { ":empty": null, ":now": now() },
        }),
      ),
    ),
  ]);
  await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: { PK: userPk(userId), SK: "PROFILE" },
      UpdateExpression: "ADD postCount :minusOne",
      ExpressionAttributeValues: { ":minusOne": -1 },
    }),
  );
  return true;
}

export async function setPostHideCount(postId, userId) {
  const post = await getPost(postId);
  if (!post || post.userId !== userId) return null;
  const hideCount = !post.hideCount;
  await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: { PK: postPk(postId), SK: "META" },
      UpdateExpression: "SET hideCount = :hide, updatedAt = :now",
      ExpressionAttributeValues: { ":hide": hideCount, ":now": now() },
    }),
  );
  return hideCount;
}

export async function incrementPostShare(postId) {
  const result = await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: { PK: postPk(postId), SK: "META" },
      UpdateExpression: "ADD shareCount :one SET updatedAt = :now",
      ExpressionAttributeValues: { ":one": 1, ":now": now() },
      ConditionExpression: "attribute_exists(PK)",
      ReturnValues: "ALL_NEW",
    }),
  );
  return cleanItem(result.Attributes);
}

export async function toggleLike(postId, userId) {
  const key = { PK: postPk(postId), SK: `LIKE#${userId}` };
  const existing = await client().send(
    new GetCommand({ TableName: table(), Key: key }),
  );
  const liked = !existing.Item;
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        liked
          ? {
              Put: {
                TableName: table(),
                Item: { ...key, entityType: "like", userId, createdAt: now() },
              },
            }
          : { Delete: { TableName: table(), Key: key } },
        {
          Update: {
            TableName: table(),
            Key: { PK: postPk(postId), SK: "META" },
            UpdateExpression: "ADD likesCount :delta SET updatedAt = :now",
            ExpressionAttributeValues: {
              ":delta": liked ? 1 : -1,
              ":now": now(),
            },
            ConditionExpression: "attribute_exists(PK)",
          },
        },
      ],
    }),
  );
  const post = await getPost(postId);
  return { liked, likesCount: Math.max(0, post?.likesCount || 0), post };
}

export async function listPostLikes(postId) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": postPk(postId),
        ":prefix": "LIKE#",
      },
      ScanIndexForward: false,
    }),
  );
  return getUsersByIds((result.Items || []).map((item) => item.userId));
}

export async function addComment(postId, userId, text, parentId = null) {
  const post = await getPost(postId);
  if (!post) return null;
  const id = newId();
  const createdAt = now();
  const comment = {
    _id: id,
    entityType: "comment",
    postId,
    userId,
    text,
    parentId: parentId || null,
    likes: [],
    createdAt,
    updatedAt: createdAt,
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table(),
            Item: {
              PK: postPk(postId),
              SK: `COMMENT#${createdAt}#${id}`,
              ...comment,
            },
          },
        },
        {
          Update: {
            TableName: table(),
            Key: { PK: postPk(postId), SK: "META" },
            UpdateExpression: "ADD commentsCount :one SET updatedAt = :now",
            ExpressionAttributeValues: { ":one": 1, ":now": createdAt },
          },
        },
      ],
    }),
  );
  return { comment, post };
}

export async function listComments(postId, viewerId = "", limit = 200) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": postPk(postId),
        ":prefix": "COMMENT#",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  const comments = (result.Items || []).map(cleanItem);
  const users = await batchGet(
    [...new Set(comments.map((item) => item.userId))].map((id) => ({
      PK: userPk(id),
      SK: "PROFILE",
    })),
  );
  const hydratedUsers = await Promise.all(users.map((item) => hydrateUserMedia(cleanItem(item))));
  const map = new Map(hydratedUsers.map((item) => [item._id, item]));
  return comments.map((comment) => ({
    ...comment,
    user: map.get(comment.userId) || null,
    viewerLiked: Boolean(viewerId && (comment.likes || []).includes(viewerId)),
  }));
}

async function findCommentRecord(pk, commentId) {
  const result = await client().send(new QueryCommand({ TableName: table(), KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)", ExpressionAttributeValues: { ":pk": pk, ":prefix": "COMMENT#" }, Limit: 500 }));
  return (result.Items || []).find((item) => String(item._id) === String(commentId)) || null;
}

export async function togglePostCommentLike(postId, commentId, userId) {
  const item = await findCommentRecord(postPk(postId), commentId);
  if (!item) return null;
  const likes = (item.likes || []).includes(userId) ? item.likes.filter((id) => id !== userId) : [...(item.likes || []), userId];
  await client().send(new UpdateCommand({ TableName: table(), Key: { PK: item.PK, SK: item.SK }, UpdateExpression: "SET likes = :likes, updatedAt = :now", ExpressionAttributeValues: { ":likes": likes, ":now": now() } }));
  return { ...cleanItem(item), likes, viewerLiked: likes.includes(userId) };
}

export async function createNotification(input) {
  const id = input._id || newId();
  const createdAt = input.createdAt || now();
  const item = {
    PK: userPk(input.recipient),
    SK: `NOTIFICATION#${createdAt}#${id}`,
    _id: id,
    entityType: "notification",
    recipient: input.recipient,
    sender: input.sender,
    type: input.type,
    status: input.status || "pending",
    post: input.post || null,
    story: input.story || null,
    clip: input.clip || null,
    event: input.event || null,
    read: Boolean(input.read),
    createdAt,
  };
  await client().send(new PutCommand({ TableName: table(), Item: item }));
  return cleanItem(item);
}

export async function listNotifications(userId, limit = 100) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": "NOTIFICATION#",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  const notifications = (result.Items || []).map(cleanItem);
  const senders = await batchGet(
    [...new Set(notifications.map((item) => item.sender).filter(Boolean))].map(
      (id) => ({ PK: userPk(id), SK: "PROFILE" }),
    ),
  );
  const hydratedSenders = await Promise.all(senders.map((item) => hydrateUserMedia(cleanItem(item))));
  const map = new Map(hydratedSenders.map((item) => [item._id, item]));
  return notifications.map((notification) => ({
    ...notification,
    senderUser: map.get(notification.sender) || null,
  }));
}

export async function markNotificationsRead(userId) {
  const notifications = await listNotifications(userId, 250);
  const unread = notifications.filter((item) => !item.read);
  await batchPut(
    unread.map((item) => {
      const stored = { ...item };
      delete stored.senderUser;
      return {
        PK: userPk(userId),
        SK: `NOTIFICATION#${item.createdAt}#${item._id}`,
        ...stored,
        read: true,
      };
    }),
  );
  return unread.length;
}

export async function unreadNotificationCount(userId) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      FilterExpression: "#read = :false",
      ExpressionAttributeNames: { "#read": "read" },
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": "NOTIFICATION#",
        ":false": false,
      },
      Select: "COUNT",
    }),
  );
  return result.Count || 0;
}

export async function updateNotification(userId, notificationId, updates) {
  const notifications = await listNotifications(userId, 250);
  const current = notifications.find((item) => item._id === notificationId);
  if (!current) return null;
  const next = { ...current, ...updates };
  delete next.senderUser;
  await client().send(
    new PutCommand({
      TableName: table(),
      Item: {
        PK: userPk(userId),
        SK: `NOTIFICATION#${current.createdAt}#${current._id}`,
        ...next,
      },
    }),
  );
  return next;
}

export async function updateUnblockRequestNotifications(
  blockerId,
  requesterId,
  status,
) {
  const notifications = await listNotifications(blockerId, 250);
  const matching = notifications.filter(
    (item) =>
      item.sender === requesterId &&
      item.type === "unblock_request" &&
      item.status === "pending",
  );
  await Promise.all(
    matching.map((item) =>
      updateNotification(blockerId, item._id, { status, read: true }),
    ),
  );
  return matching.length;
}

export async function updateEventInvitationNotifications(userId, eventId, status) {
  const notifications = await listNotifications(userId, 250);
  const matching = notifications.filter(
    (item) =>
      item.event === eventId &&
      item.type === "event_invitation" &&
      item.status === "pending",
  );
  await Promise.all(
    matching.map((item) =>
      updateNotification(userId, item._id, {
        status: status === "accepted" ? "approved" : "rejected",
        read: true,
      }),
    ),
  );
  return matching.length;
}

export async function hasPendingSupportRequest(senderId, recipientId) {
  const notifications = await listNotifications(recipientId, 250);
  return notifications.some(
    (item) =>
      item.sender === senderId &&
      item.type === "support_request" &&
      item.status === "pending",
  );
}

export async function cancelPendingSupportRequest(senderId, recipientId) {
  const notifications = await listNotifications(recipientId, 250);
  const request = notifications.find(
    (item) =>
      item.sender === senderId &&
      item.type === "support_request" &&
      item.status === "pending",
  );
  if (!request) return false;
  await client().send(
    new DeleteCommand({
      TableName: table(),
      Key: {
        PK: userPk(recipientId),
        SK: `NOTIFICATION#${request.createdAt}#${request._id}`,
      },
    }),
  );
  return true;
}

export async function toggleSavedPost(userId, postId) {
  const key = { PK: userPk(userId), SK: `SAVED#${postId}` };
  const existing = await client().send(
    new GetCommand({ TableName: table(), Key: key }),
  );
  if (existing.Item) {
    await client().send(new DeleteCommand({ TableName: table(), Key: key }));
    return false;
  }
  await client().send(
    new PutCommand({
      TableName: table(),
      Item: { ...key, entityType: "savedPost", postId, createdAt: now() },
    }),
  );
  return true;
}

export async function listSavedPosts(userId) {
  const relations = await getUserRelations(userId);
  const posts = await batchGet(
    relations.savedPosts.map((id) => ({ PK: postPk(id), SK: "META" })),
  );
  return hydratePosts(posts.map(cleanItem), userId);
}

export async function toggleSavedClip(userId, clipId) {
  const key = { PK: userPk(userId), SK: `SAVED_CLIP#${clipId}` };
  const existing = await client().send(
    new GetCommand({ TableName: table(), Key: key }),
  );
  if (existing.Item) {
    await client().send(new DeleteCommand({ TableName: table(), Key: key }));
    return false;
  }
  await client().send(
    new PutCommand({
      TableName: table(),
      Item: { ...key, entityType: "savedClip", clipId, createdAt: now() },
    }),
  );
  return true;
}

export async function listCollections(userId) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": "COLLECTION#",
      },
    }),
  );
  const collections = (result.Items || []).map(cleanItem);
  const postIds = [...new Set(collections.flatMap((item) => item.postIds || []))];
  const posts = await batchGet(
    postIds.map((id) => ({ PK: postPk(id), SK: "META" })),
  );
  const hydrated = await hydratePosts(posts.map(cleanItem), userId);
  const map = new Map(hydrated.map((post) => [post._id, post]));
  return collections.map((collection) => ({
    ...collection,
    posts: (collection.postIds || []).map((id) => map.get(id)).filter(Boolean),
  }));
}

export async function createCollection(userId, name) {
  const id = newId();
  const createdAt = now();
  await client().send(
    new PutCommand({
      TableName: table(),
      Item: {
        PK: userPk(userId),
        SK: `COLLECTION#${id}`,
        _id: id,
        entityType: "collection",
        name,
        postIds: [],
        createdAt,
      },
    }),
  );
  return listCollections(userId);
}

export async function updateCollectionPost(userId, collectionId, postId, action) {
  const key = { PK: userPk(userId), SK: `COLLECTION#${collectionId}` };
  const result = await client().send(
    new GetCommand({ TableName: table(), Key: key }),
  );
  if (!result.Item) return null;
  const postIds = new Set(result.Item.postIds || []);
  if (action === "remove") postIds.delete(postId);
  else postIds.add(postId);
  await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: key,
      UpdateExpression: "SET postIds = :postIds",
      ExpressionAttributeValues: { ":postIds": [...postIds] },
    }),
  );
  return listCollections(userId);
}

export async function toggleSupport(sourceId, targetId) {
  const sourceKey = { PK: userPk(sourceId), SK: `SUPPORTING#${targetId}` };
  const existing = await client().send(
    new GetCommand({ TableName: table(), Key: sourceKey }),
  );
  const supported = !existing.Item;
  const targetKey = { PK: userPk(targetId), SK: `SUPPORTER#${sourceId}` };
  const relation = { entityType: "support", createdAt: now() };
  await client().send(
    new TransactWriteCommand({
      TransactItems: supported
        ? [
            {
              Put: {
                TableName: table(),
                Item: { ...sourceKey, ...relation, userId: targetId },
              },
            },
            {
              Put: {
                TableName: table(),
                Item: { ...targetKey, ...relation, userId: sourceId },
              },
            },
            {
              Update: {
                TableName: table(),
                Key: { PK: userPk(sourceId), SK: "PROFILE" },
                UpdateExpression: "ADD supportingCount :one",
                ExpressionAttributeValues: { ":one": 1 },
              },
            },
            {
              Update: {
                TableName: table(),
                Key: { PK: userPk(targetId), SK: "PROFILE" },
                UpdateExpression: "ADD supportersCount :one",
                ExpressionAttributeValues: { ":one": 1 },
              },
            },
          ]
        : [
            { Delete: { TableName: table(), Key: sourceKey } },
            { Delete: { TableName: table(), Key: targetKey } },
            {
              Update: {
                TableName: table(),
                Key: { PK: userPk(sourceId), SK: "PROFILE" },
                UpdateExpression: "ADD supportingCount :minusOne",
                ExpressionAttributeValues: { ":minusOne": -1 },
              },
            },
            {
              Update: {
                TableName: table(),
                Key: { PK: userPk(targetId), SK: "PROFILE" },
                UpdateExpression: "ADD supportersCount :minusOne",
                ExpressionAttributeValues: { ":minusOne": -1 },
              },
            },
          ],
    }),
  );
  const target = await getUserById(targetId);
  return { supported, supportersCount: Math.max(0, target?.supportersCount || 0) };
}

export async function setBlockStatus(blockerId, blockedUserId, blocked) {
  const outgoingKey = {
    PK: userPk(blockerId),
    SK: `BLOCK#${blockedUserId}`,
  };
  const reverseKey = {
    PK: userPk(blockedUserId),
    SK: `BLOCKED_BY#${blockerId}`,
  };
  const requestKey = {
    PK: userPk(blockerId),
    SK: `UNBLOCK_REQUEST#${blockedUserId}`,
  };
  const sentRequestKey = {
    PK: userPk(blockedUserId),
    SK: `UNBLOCK_REQUEST_SENT#${blockerId}`,
  };

  await client().send(
    new TransactWriteCommand({
      TransactItems: blocked
        ? [
            {
              Put: {
                TableName: table(),
                Item: {
                  ...outgoingKey,
                  entityType: "block",
                  userId: blockedUserId,
                  createdAt: now(),
                },
              },
            },
            {
              Put: {
                TableName: table(),
                Item: {
                  ...reverseKey,
                  entityType: "blockReverse",
                  blockerId,
                  createdAt: now(),
                },
              },
            },
          ]
        : [
            { Delete: { TableName: table(), Key: outgoingKey } },
            { Delete: { TableName: table(), Key: reverseKey } },
            { Delete: { TableName: table(), Key: requestKey } },
            { Delete: { TableName: table(), Key: sentRequestKey } },
          ],
    }),
  );
  return blocked;
}

export async function toggleBlock(userId, targetId) {
  const key = { PK: userPk(userId), SK: `BLOCK#${targetId}` };
  const existing = await client().send(
    new GetCommand({ TableName: table(), Key: key, ConsistentRead: true }),
  );
  return setBlockStatus(userId, targetId, !existing.Item);
}

export async function getBlockRelationship(firstUserId, secondUserId) {
  const [firstBlock, secondBlock] = await Promise.all(
    [
      { PK: userPk(firstUserId), SK: `BLOCK#${secondUserId}` },
      { PK: userPk(secondUserId), SK: `BLOCK#${firstUserId}` },
    ].map((Key) =>
      client().send(
        new GetCommand({ TableName: table(), Key, ConsistentRead: true }),
      ),
    ),
  );
  const firstBlocks = Boolean(firstBlock.Item);
  const secondBlocks = Boolean(secondBlock.Item);
  if (!firstBlocks && !secondBlocks) return { blocked: false };

  const blockerId = firstBlocks ? firstUserId : secondUserId;
  const blockedUserId = firstBlocks ? secondUserId : firstUserId;
  const requestResult = await client().send(
    new GetCommand({
      TableName: table(),
      Key: {
        PK: userPk(blockerId),
        SK: `UNBLOCK_REQUEST#${blockedUserId}`,
      },
      ConsistentRead: true,
    }),
  );
  const request = cleanItem(requestResult.Item);
  const requestActive =
    request?.status === "pending" &&
    new Date(request.expiresAt).getTime() > Date.now();
  return {
    blocked: true,
    blockerId,
    blockedUserId,
    request: requestActive ? request : null,
  };
}

export async function createUnblockRequest(
  requesterId,
  blockerId,
  conversationId,
) {
  const relationship = await getBlockRelationship(requesterId, blockerId);
  if (
    !relationship.blocked ||
    relationship.blockerId !== blockerId ||
    relationship.blockedUserId !== requesterId
  ) {
    return null;
  }
  if (relationship.request) return relationship.request;

  const createdAt = now();
  const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const request = {
    _id: newId(),
    entityType: "unblockRequest",
    requesterId,
    blockerId,
    conversationId: conversationId || null,
    status: "pending",
    createdAt,
    expiresAt,
    expiresAtEpoch: Math.floor(new Date(expiresAt).getTime() / 1000),
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table(),
            Item: {
              PK: userPk(blockerId),
              SK: `UNBLOCK_REQUEST#${requesterId}`,
              ...request,
            },
          },
        },
        {
          Put: {
            TableName: table(),
            Item: {
              PK: userPk(requesterId),
              SK: `UNBLOCK_REQUEST_SENT#${blockerId}`,
              ...request,
            },
          },
        },
      ],
    }),
  );
  return request;
}

export async function acceptUnblockRequest(blockerId, requesterId) {
  const relationship = await getBlockRelationship(blockerId, requesterId);
  if (
    !relationship.blocked ||
    relationship.blockerId !== blockerId ||
    relationship.blockedUserId !== requesterId ||
    !relationship.request
  ) {
    return null;
  }
  await setBlockStatus(blockerId, requesterId, false);
  return relationship.request;
}

export async function declineUnblockRequest(blockerId, requesterId) {
  const relationship = await getBlockRelationship(blockerId, requesterId);
  if (
    !relationship.blocked ||
    relationship.blockerId !== blockerId ||
    relationship.blockedUserId !== requesterId ||
    !relationship.request
  ) {
    return null;
  }
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: table(),
            Key: {
              PK: userPk(blockerId),
              SK: `UNBLOCK_REQUEST#${requesterId}`,
            },
          },
        },
        {
          Delete: {
            TableName: table(),
            Key: {
              PK: userPk(requesterId),
              SK: `UNBLOCK_REQUEST_SENT#${blockerId}`,
            },
          },
        },
      ],
    }),
  );
  return relationship.request;
}

export async function getProfessionalDashboard(userId, requestedDays = 7) {
  const [user, relations, posts, allItems] = await Promise.all([
    getUserById(userId),
    getUserRelations(userId),
    listUserPosts(userId, userId),
    scanAllItems(),
  ]);
  if (!user) return null;
  const clips = allItems
    .filter((item) => item.entityType === "clip" && item.userId === userId)
    .map(cleanItem);
  const stories = allItems
    .filter((item) => item.entityType === "story" && item.userId === userId)
    .map(cleanItem);
  const dayKey = (value) => new Date(value || Date.now()).toISOString().slice(0, 10);
  const days = Math.min(30, Math.max(1, Math.floor(Number(requestedDays) || 7)));
  const periodDays = Array.from({ length: days }, (_, index) => dayKey(Date.now() - (days - 1 - index) * 86400000));
  const profileVisits = allItems.filter((item) => item.entityType === "profileVisit" && item.profileUserId === userId);
  const clipSignals = allItems.filter((item) => item.entityType === "clipSignal" && item.creatorId === userId && Number(item.viewedCount || 0) > 0);
  const storyViewEvents = allItems.filter((item) => item.entityType === "storyView" && stories.some((story) => story._id === String(item.PK || "").replace("STORY#", "")));
  const supportsSet = new Set(relations.supporters || []);
  const viewerIds = new Set([
    ...clips.flatMap((clip) => clip.views || []),
    ...storyViewEvents.map((item) => item.userId),
    ...clipSignals.map((item) => item.userId),
  ].filter(Boolean));
  const supportersViewed = [...viewerIds].filter((id) => supportsSet.has(id)).length;
  const nonSupportersViewed = Math.max(0, viewerIds.size - supportersViewed);
  const viewsByDay = periodDays.map((day) => ({
    day,
    views: clipSignals.filter((item) => dayKey(item.updatedAt) === day).reduce((sum, item) => sum + Number(item.viewedCount || 0), 0) + storyViewEvents.filter((item) => dayKey(item.createdAt) === day).length,
  }));
  const profileVisitsByDay = periodDays.map((day) => ({ day, visits: profileVisits.filter((item) => dayKey(item.createdAt) === day).length }));
  const postLikes = posts.reduce(
    (sum, post) => sum + Number(post.likesCount || post.likes?.length || 0),
    0,
  );
  const postComments = posts.reduce(
    (sum, post) => sum + Number(post.commentsCount || post.comments?.length || 0),
    0,
  );
  const postShares = posts.reduce(
    (sum, post) => sum + Number(post.shareCount || 0),
    0,
  );
  const clipViews = clips.reduce(
    (sum, clip) => sum + Number(clip.views?.length || 0),
    0,
  );
  const storyViews = stories.reduce(
    (sum, story) => sum + Number(story.viewsCount || 0),
    0,
  );
  const totalViews = clipViews + storyViews;
  const totalInteractions =
    postLikes +
    postComments +
    postShares +
    clips.reduce(
      (sum, clip) =>
        sum + Number(clip.likes?.length || 0) + Number(clip.shares || 0),
      0,
    ) +
    stories.reduce(
      (sum, story) => sum + Number(story.likesCount || 0),
      0,
    );
  const content = [
    ...posts.map((post) => ({
      id: post._id,
      type: "post",
      caption: post.caption,
      createdAt: post.createdAt,
      views: 0,
      interactions:
        Number(post.likesCount || post.likes?.length || 0) +
        Number(post.commentsCount || post.comments?.length || 0) +
        Number(post.shareCount || 0),
    })),
    ...clips.map((clip) => ({
      id: clip._id,
      type: "clip",
      caption: clip.caption,
      createdAt: clip.createdAt,
      views: Number(clip.views?.length || 0),
      interactions:
        Number(clip.likes?.length || 0) + Number(clip.shares || 0),
    })),
    ...stories.map((story) => ({
      id: story._id,
      type: "story",
      caption: story.caption,
      createdAt: story.createdAt,
      views: Number(story.viewsCount || 0),
      interactions: Number(story.likesCount || 0),
    })),
  ];
  const topContent = [...content]
    .sort(
      (left, right) =>
        right.views + right.interactions * 3 -
        (left.views + left.interactions * 3),
    )
    .slice(0, 5);
  const recommendations = [];
  const supporters = relations.supporters.length;
  if (content.length < 3) {
    recommendations.push({
      title: "Post consistently",
      detail: "Publish at least three pieces this week to give your audience more chances to discover you.",
    });
  }
  if (clips.length === 0 || clipViews < supporters) {
    recommendations.push({
      title: "Create more motion",
      detail: "Short clips are your clearest opportunity to increase views beyond your existing supporters.",
    });
  }
  if (supporters && totalInteractions / supporters < 0.25) {
    recommendations.push({
      title: "Invite conversation",
      detail: "Use a question or clear call to action in captions to turn supporters into active participants.",
    });
  }
  if (postShares < Math.max(1, Math.floor(posts.length / 3))) {
    recommendations.push({
      title: "Make posts shareable",
      detail: "Try useful carousels, before-and-after stories, or concise tips people will want to send to friends.",
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      title: "Double down on your top format",
      detail: "Your engagement is healthy. Reuse the structure and opening style of your best-performing content.",
    });
  }
  return {
    profile: {
      username: user.username,
      profilePic: user.profilePic,
      supporters,
      supporting: relations.supporting.length,
    },
    totals: {
      content: content.length,
      posts: posts.length,
      clips: clips.length,
      stories: stories.length,
      views: totalViews,
      interactions: totalInteractions,
      likes: postLikes,
      comments: postComments,
      shares: postShares + clips.reduce((sum, clip) => sum + Number(clip.shares || 0), 0),
    },
    engagementRate: supporters
      ? Math.round((totalInteractions / supporters) * 1000) / 10
      : 0,
    topContent,
    recommendations,
    insights: {
      periodDays: days,
      supporters,
      viewedByAudience: { supporters: supportersViewed, nonSupporters: nonSupportersViewed, total: viewerIds.size },
      viewsByDay,
      profileVisits: { total: profileVisitsByDay.reduce((sum, item) => sum + item.visits, 0), byDay: profileVisitsByDay },
    },
  };
}

export async function recordProfileVisit(profileUserId, viewerId) {
  if (!profileUserId || !viewerId || String(profileUserId) === String(viewerId)) return;
  const createdAt = now();
  const day = createdAt.slice(0, 10);
  await client().send(new PutCommand({
    TableName: table(),
    Item: {
      PK: userPk(profileUserId),
      SK: `PROFILE_VISIT#${day}#${viewerId}`,
      entityType: "profileVisit",
      profileUserId,
      viewerId,
      createdAt,
    },
  }));
}

export async function listConversations(userId) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": "CONVERSATION#",
      },
    }),
  );
  const conversations = (result.Items || [])
    .map(cleanItem)
    .filter((conversation) => !conversation.hiddenAt);
  const relations = await getUserRelations(userId);
  const participantIds = [
    ...new Set(conversations.flatMap((item) => item.participantIds || [])),
  ];
  const otherParticipantIds = participantIds.filter((id) => id !== userId);
  const [users, legacyIncomingBlocks] = await Promise.all([
    batchGet(
      participantIds.map((id) => ({ PK: userPk(id), SK: "PROFILE" })),
    ),
    batchGet(
      otherParticipantIds.map((id) => ({
        PK: userPk(id),
        SK: `BLOCK#${userId}`,
      })),
    ),
  ]);
  const blockedByUserIds = new Set([
    ...(relations.blockedByUsers || []),
    ...legacyIncomingBlocks.map((item) => item.PK.replace(/^USER#/, "")),
  ]);
  const hydratedUsers = await Promise.all(users.map((item) => hydrateUserMedia(cleanItem(item))));
  const map = new Map(hydratedUsers.map((item) => [item._id, item]));
  const hydrated = await Promise.all(
    conversations.map(async (conversation) => {
      const otherUserId = conversation.participantIds.find(
        (participantId) => participantId !== userId,
      );
      const viewerIsBlocker = relations.blockedUsers.includes(otherUserId);
      const viewerIsBlocked = blockedByUserIds.has(otherUserId);
      const request = viewerIsBlocker
        ? relations.unblockRequests.find(
            (item) =>
              item.requesterId === otherUserId &&
              item.status === "pending" &&
              new Date(item.expiresAt).getTime() > Date.now(),
          )
        : relations.sentUnblockRequests.find(
            (item) =>
              item.blockerId === otherUserId &&
              item.status === "pending" &&
              new Date(item.expiresAt).getTime() > Date.now(),
          );
      return {
        ...conversation,
        lastMessage: await hydrateMessageMedia(conversation.lastMessage),
        participants: conversation.participantIds
          .map((id) => map.get(id))
          .filter(Boolean),
        blockState:
          viewerIsBlocker || viewerIsBlocked
            ? {
                blocked: true,
                blockerId: viewerIsBlocker ? userId : otherUserId,
                blockedUserId: viewerIsBlocker ? otherUserId : userId,
                request: request || null,
              }
            : { blocked: false },
      };
    }),
  );
  return hydrated.sort(
      (left, right) =>
        new Date(right.lastMessageAt || right.createdAt) -
        new Date(left.lastMessageAt || left.createdAt),
    );
}

export async function getConversation(conversationId, userId) {
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: { PK: `CONVERSATION#${conversationId}`, SK: "META" },
    }),
  );
  const conversation = cleanItem(result.Item);
  return conversation?.participantIds?.includes(userId) ? conversation : null;
}

export async function createConversation(userId, recipientId, event = null) {
  const records = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": "CONVERSATION#",
      },
      ConsistentRead: true,
    }),
  );
  const existingRecord = (records.Items || []).map(cleanItem).find(
    (item) =>
      item.participantIds?.length === 2 &&
      item.participantIds.includes(recipientId) &&
      String(item.event?._id || item.event || "") === String(event?._id || event || ""),
  );
  if (existingRecord) {
    if (existingRecord.hiddenAt) {
      await client().send(
        new UpdateCommand({
          TableName: table(),
          Key: {
            PK: userPk(userId),
            SK: `CONVERSATION#${existingRecord._id}`,
          },
          UpdateExpression: "SET hiddenAt = :visible, updatedAt = :now",
          ExpressionAttributeValues: { ":visible": null, ":now": now() },
        }),
      );
    }
    return (await listConversations(userId)).find(
      (item) => item._id === existingRecord._id,
    );
  }

  const id = newId();
  const createdAt = now();
  const conversation = {
    _id: id,
    entityType: "conversation",
    participantIds: [userId, recipientId],
    event,
    lastMessageAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table(),
            Item: {
              PK: `CONVERSATION#${id}`,
              SK: "META",
              ...conversation,
            },
          },
        },
        ...[userId, recipientId].map((participantId) => ({
          Put: {
            TableName: table(),
            Item: {
              PK: userPk(participantId),
              SK: `CONVERSATION#${id}`,
              ...conversation,
            },
          },
        })),
      ],
    }),
  );
  const users = await batchGet(
    [userId, recipientId].map((participantId) => ({
      PK: userPk(participantId),
      SK: "PROFILE",
    })),
  );
  return {
    ...conversation,
    participants: await Promise.all(users.map((item) => hydrateUserMedia(cleanItem(item)))),
  };
}

export async function createMessage(input) {
  const conversation = await getConversation(input.conversationId, input.senderId);
  if (!conversation) return null;
  const id = newId();
  const createdAt = now();
  const message = {
    _id: id,
    entityType: "message",
    conversation: input.conversationId,
    sender: input.senderId,
    text: input.text || "",
    media: input.media || [],
    replyTo: input.replyTo || null,
    reactions: [],
    likedBy: [],
    deletedFor: [],
    deletedForEveryone: false,
    forwardedFrom: input.forwardedFrom || null,
    sharedPost: input.sharedPost || null,
    sharedClip: input.sharedClip || null,
    systemType: input.systemType || null,
    systemData: input.systemData || null,
    warningCount: 0,
    readBy: [input.senderId],
    createdAt,
    updatedAt: createdAt,
  };
  const messageItem = {
    PK: `CONVERSATION#${input.conversationId}`,
    SK: `MESSAGE#${createdAt}#${id}`,
    ...message,
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: table(), Item: messageItem } },
        {
          Put: {
            TableName: table(),
            Item: {
              PK: `MESSAGE#${id}`,
              SK: "LOOKUP",
              conversationId: input.conversationId,
              messageSk: messageItem.SK,
            },
          },
        },
      ],
    }),
  );
  const preview = {
    _id: id,
    text: message.text,
    media: message.media,
    sharedPost: message.sharedPost,
    sharedClip: message.sharedClip,
    sender: input.senderId,
    readBy: message.readBy,
    systemType: message.systemType,
    systemData: message.systemData,
    createdAt,
  };
  await Promise.all([
    client().send(
      new UpdateCommand({
        TableName: table(),
        Key: { PK: `CONVERSATION#${input.conversationId}`, SK: "META" },
        UpdateExpression:
          "SET lastMessageAt = :time, updatedAt = :time, lastMessage = :message",
        ExpressionAttributeValues: { ":time": createdAt, ":message": preview },
      }),
    ),
    ...conversation.participantIds.map((participantId) =>
      client().send(
        new UpdateCommand({
          TableName: table(),
          Key: {
            PK: userPk(participantId),
            SK: `CONVERSATION#${input.conversationId}`,
          },
          UpdateExpression:
            "SET lastMessageAt = :time, updatedAt = :time, lastMessage = :message, hiddenAt = :visible",
          ExpressionAttributeValues: {
            ":time": createdAt,
            ":message": preview,
            ":visible": null,
          },
        }),
      ),
    ),
  ]);
  const sender = await getUserById(input.senderId);
  return hydrateMessageMedia({ ...message, sender });
}

async function hydrateMessageMedia(message) {
  if (!message) return message;
  const media = await Promise.all(
    (message.media || []).map((item) => hydrateMediaItem(item)),
  );
  const sharedPost = message.sharedPost
    ? await hydratePostMedia(message.sharedPost)
    : null;
  if (sharedPost?.user) {
    sharedPost.user = await hydrateUserMedia(sharedPost.user);
  }
  const sharedClip = message.sharedClip
    ? await hydrateClipMedia(message.sharedClip)
    : null;
  return { ...message, media, sharedPost, sharedClip };
}

async function persistMessageReadState(conversation, userId, messages) {
  if (!messages.length) return [];

  const messageIds = messages.map((message) => message._id);
  const messageIdSet = new Set(messageIds.map(String));
  await batchPut(
    messages.map((message) => ({
      ...message,
      readBy: [...new Set([...(message.readBy || []), userId])],
    })),
  );

  const conversationRecords = await batchGet([
    { PK: `CONVERSATION#${conversation._id}`, SK: "META" },
    ...conversation.participantIds.map((participantId) => ({
      PK: userPk(participantId),
      SK: `CONVERSATION#${conversation._id}`,
    })),
  ]);
  const updatedRecords = conversationRecords
    .filter((record) => messageIdSet.has(String(record.lastMessage?._id || "")))
    .map((record) => ({
      ...record,
      lastMessage: {
        ...record.lastMessage,
        readBy: [...new Set([...(record.lastMessage.readBy || []), userId])],
      },
    }));
  await batchPut(updatedRecords);
  return messageIds;
}

export async function getMessage(messageId, userId) {
  const lookup = await client().send(
    new GetCommand({
      TableName: table(),
      Key: { PK: `MESSAGE#${messageId}`, SK: "LOOKUP" },
    }),
  );
  if (!lookup.Item) return null;
  const conversation = await getConversation(lookup.Item.conversationId, userId);
  if (!conversation) return null;
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: {
        PK: `CONVERSATION#${lookup.Item.conversationId}`,
        SK: lookup.Item.messageSk,
      },
    }),
  );
  return result.Item
    ? { raw: result.Item, message: cleanItem(result.Item), conversation }
    : null;
}

export async function listMessages(conversationId, userId, limit = 300) {
  const conversation = await getConversation(conversationId, userId);
  if (!conversation) return null;
  const stateResult = await client().send(
    new GetCommand({
      TableName: table(),
      Key: {
        PK: userPk(userId),
        SK: `CONVERSATION#${conversationId}`,
      },
      ConsistentRead: true,
    }),
  );
  const clearedAt = stateResult.Item?.clearedAt
    ? new Date(stateResult.Item.clearedAt).getTime()
    : 0;
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `CONVERSATION#${conversationId}`,
        ":prefix": "MESSAGE#",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  const raw = (result.Items || []).reverse();
  const visible = raw.filter(
    (item) =>
      !(item.deletedFor || []).includes(userId) &&
      new Date(item.createdAt).getTime() > clearedAt,
  );
  const unread = visible.filter(
    (item) => item.sender !== userId && !(item.readBy || []).includes(userId),
  );
  if (unread.length) {
    await persistMessageReadState(conversation, userId, unread);
  }
  const senderIds = [...new Set(visible.map((item) => item.sender))];
  const users = await batchGet(
    senderIds.map((id) => ({ PK: userPk(id), SK: "PROFILE" })),
  );
  const hydratedUsers = await Promise.all(users.map((item) => hydrateUserMedia(cleanItem(item))));
  const userMap = new Map(hydratedUsers.map((item) => [item._id, item]));
  const messageMap = new Map(visible.map((item) => [item._id, cleanItem(item)]));
  const hydratedMessages = await Promise.all(visible.map((item) => hydrateMessageMedia(cleanItem(item))));
  return {
    conversation,
    unreadIds: unread.map((item) => item._id),
    messages: hydratedMessages.map((message, index) => {
      const item = visible[index];
      return {
      ...message,
      readBy: unread.some((unreadItem) => unreadItem._id === item._id)
        ? [...new Set([...(item.readBy || []), userId])]
        : item.readBy || [],
      sender: userMap.get(item.sender) || item.sender,
      replyTo: item.replyTo ? messageMap.get(item.replyTo) || null : null,
    }}),
  };
}

export async function markMessagesRead(conversationId, userId, messageIds) {
  const conversation = await getConversation(conversationId, userId);
  if (!conversation) return null;

  const requestedIds = new Set((messageIds || []).map(String));
  if (!requestedIds.size) return { conversation, messageIds: [] };

  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `CONVERSATION#${conversationId}`,
        ":prefix": "MESSAGE#",
      },
      ConsistentRead: true,
    }),
  );
  const unread = (result.Items || []).filter(
    (message) =>
      requestedIds.has(String(message._id)) &&
      message.sender !== userId &&
      !(message.readBy || []).includes(userId) &&
      !(message.deletedFor || []).includes(userId),
  );
  return {
    conversation,
    messageIds: await persistMessageReadState(conversation, userId, unread),
  };
}

export async function deleteConversationForUser(conversationId, userId) {
  const conversation = await getConversation(conversationId, userId);
  if (!conversation) return null;

  const deletedAt = now();
  const participantKeys = conversation.participantIds.map((participantId) => ({
    PK: userPk(participantId),
    SK: `CONVERSATION#${conversationId}`,
  }));
  const participantRecords = await batchGet(participantKeys);
  const participantRecordMap = new Map(
    participantRecords.map((record) => [record.PK, record]),
  );

  await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: { PK: userPk(userId), SK: `CONVERSATION#${conversationId}` },
      UpdateExpression:
        "SET hiddenAt = :time, clearedAt = :time, lastMessage = :empty, updatedAt = :time REMOVE unreadCount",
      ExpressionAttributeValues: {
        ":time": deletedAt,
        ":empty": null,
      },
    }),
  );

  const allParticipantsDeleted = conversation.participantIds.every(
    (participantId) =>
      participantId === userId ||
      !participantRecordMap.get(userPk(participantId)) ||
      Boolean(participantRecordMap.get(userPk(participantId)).hiddenAt),
  );
  if (!allParticipantsDeleted) {
    return { conversation, purged: false };
  }

  const partition = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `CONVERSATION#${conversationId}` },
      ConsistentRead: true,
    }),
  );
  const conversationItems = partition.Items || [];
  const messages = conversationItems.filter(
    (item) => item.entityType === "message" || item.SK?.startsWith("MESSAGE#"),
  );
  const messageIds = new Set(messages.map((message) => String(message._id)));
  const candidateMediaKeys = new Set(
    messages
      .flatMap(mediaValues)
      .map((value) => getS3KeyFromUrl(value, true))
      .filter(Boolean),
  );

  if (candidateMediaKeys.size) {
    const allItems = await scanAllItems();
    const referencedElsewhere = new Set();
    for (const item of allItems) {
      const belongsToDeletedConversation =
        item.PK === `CONVERSATION#${conversationId}` ||
        item.SK === `CONVERSATION#${conversationId}` ||
        (item.SK === "LOOKUP" && messageIds.has(String(item.PK).slice(8)));
      if (belongsToDeletedConversation) continue;
      for (const value of mediaValues(item)) {
        const key = getS3KeyFromUrl(value, true);
        if (candidateMediaKeys.has(key)) referencedElsewhere.add(key);
      }
    }
    await deleteS3Objects(
      [...candidateMediaKeys].filter((key) => !referencedElsewhere.has(key)),
    );
  }

  await batchDelete([
    ...conversationItems.map((item) => ({ PK: item.PK, SK: item.SK })),
    ...messages.map((message) => ({
      PK: `MESSAGE#${message._id}`,
      SK: "LOOKUP",
    })),
    ...participantKeys,
  ]);
  return { conversation, purged: true };
}

export async function updateMessage(messageId, userId, updater) {
  const owned = await getMessage(messageId, userId);
  if (!owned) return null;
  const updated = {
    ...owned.raw,
    ...updater(cleanItem(owned.raw)),
    updatedAt: now(),
  };
  await client().send(new PutCommand({ TableName: table(), Item: updated }));
  const sender = await getUserById(updated.sender);
  return {
    conversation: owned.conversation,
    message: await hydrateMessageMedia({ ...cleanItem(updated), sender }),
  };
}

export async function deleteMessageForEveryone(messageId, userId) {
  const owned = await getMessage(messageId, userId);
  if (!owned || owned.raw.sender !== userId) return null;

  const ownedMedia = mediaValues(owned.raw)
    .map((value) => getS3KeyFromUrl(value, true))
    .filter(
      (key) =>
        isOwnedMediaKey(key, userId) || key.startsWith(`messages/${userId}/`),
    );
  await deleteS3Objects(ownedMedia);
  await batchDelete([
    { PK: owned.raw.PK, SK: owned.raw.SK },
    { PK: `MESSAGE#${messageId}`, SK: "LOOKUP" },
  ]);

  const messages = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": `CONVERSATION#${owned.conversation._id}`,
        ":prefix": "MESSAGE#",
      },
      ConsistentRead: true,
      ScanIndexForward: false,
    }),
  );
  const remaining = messages.Items || [];
  const references = remaining.filter(
    (item) => item.replyTo === messageId || item.forwardedFrom === messageId,
  );
  await Promise.all(
    references.map((item) => {
      const updates = [];
      const values = {};
      if (item.replyTo === messageId) {
        updates.push("replyTo = :empty");
        values[":empty"] = null;
      }
      if (item.forwardedFrom === messageId) {
        updates.push("forwardedFrom = :empty");
        values[":empty"] = null;
      }
      values[":now"] = now();
      updates.push("updatedAt = :now");
      return client().send(
        new UpdateCommand({
          TableName: table(),
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: `SET ${updates.join(", ")}`,
          ExpressionAttributeValues: values,
        }),
      );
    }),
  );

  const latest = remaining[0] ? cleanItem(remaining[0]) : null;
  const preview = latest
    ? {
        _id: latest._id,
        text: latest.text,
        media: latest.media,
        sharedPost: latest.sharedPost,
        sharedClip: latest.sharedClip,
        sender: latest.sender,
        readBy: latest.readBy || [],
        systemType: latest.systemType || null,
        systemData: latest.systemData || null,
        createdAt: latest.createdAt,
      }
    : null;
  await Promise.all(
    [
      { PK: `CONVERSATION#${owned.conversation._id}`, SK: "META" },
      ...owned.conversation.participantIds.map((participantId) => ({
        PK: userPk(participantId),
        SK: `CONVERSATION#${owned.conversation._id}`,
      })),
    ].map((Key) =>
      client().send(
        new UpdateCommand({
          TableName: table(),
          Key,
          UpdateExpression:
            "SET lastMessage = :message, lastMessageAt = :time, updatedAt = :now",
          ExpressionAttributeValues: {
            ":message": preview,
            ":time": latest?.createdAt || owned.conversation.createdAt,
            ":now": now(),
          },
        }),
      ),
    ),
  );
  return { conversation: owned.conversation, messageId };
}

export async function unreadMessageCount(userId) {
  const conversations = await listConversations(userId);
  const counts = await Promise.all(
    conversations.map(async (conversation) => {
      const result = await client().send(
        new QueryCommand({
          TableName: table(),
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
          FilterExpression:
            "sender <> :user AND NOT contains(readBy, :user) AND deletedForEveryone = :false",
          ExpressionAttributeValues: {
            ":pk": `CONVERSATION#${conversation._id}`,
            ":prefix": "MESSAGE#",
            ":user": userId,
            ":false": false,
          },
          Select: "COUNT",
        }),
      );
      return result.Count || 0;
    }),
  );
  return counts.reduce((sum, count) => sum + count, 0);
}

export async function createClip({
  userId,
  caption,
  media,
  mediaItems = [],
  timeline = [],
  textLayers = [],
  duration = 0,
  transition = "fade",
  aspectRatio = "9:16",
}) {
  const id = newId();
  const createdAt = now();
  const normalizedMediaItems = mediaItems.length ? mediaItems : [media];
  const firstMedia = normalizedMediaItems[0];
  const clip = {
    _id: id,
    entityType: "clip",
    userId,
    caption,
    mediaUrl: firstMedia.url,
    mediaType: firstMedia.type,
    mediaPublicId: firstMedia.key,
    mediaItems: normalizedMediaItems,
    timeline,
    textLayers,
    duration: Number(duration || timeline.reduce((sum, item) => sum + Number(item.duration || 0), 0)),
    transition,
    aspectRatio,
    likes: [],
    views: [],
    shares: 0,
    commentsCount: 0,
    feedScore: Date.now(),
    createdAt,
    updatedAt: createdAt,
  };
  await client().send(
    new PutCommand({
      TableName: table(),
      Item: {
        PK: `CLIP#${id}`,
        SK: "META",
        GSI1PK: "FEED#CLIPS",
        GSI1SK: `${createdAt}#${id}`,
        ...clip,
      },
    }),
  );
  return {
    ...(await hydrateClipMedia(clip)),
    user: await getUserById(userId),
  };
}

async function hydrateClipMedia(clip) {
  if (!clip) return clip;
  const mediaItems = await Promise.all(
    (clip.mediaItems?.length
      ? clip.mediaItems
      : [{ key: clip.mediaPublicId, url: clip.mediaUrl, type: clip.mediaType }]
    ).map(hydrateMediaItem),
  );
  const user = clip.user ? await hydrateUserMedia(clip.user) : clip.user;
  return {
    ...clip,
    mediaItems,
    mediaUrl:
      mediaItems[0]?.url ||
      (await getReadableMediaUrl(clip.mediaUrl, clip.mediaPublicId)),
    user,
  };
}

export async function getClip(clipId) {
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: { PK: clipPk(clipId), SK: "META" },
    }),
  );
  return cleanItem(result.Item);
}

function clipTopics(clip) {
  const words = String(clip?.caption || "")
    .toLowerCase()
    .match(/[a-z0-9#]{3,}/g) || [];
  return [...new Set([clip?.mediaType || "clip", ...words])].slice(0, 14);
}

async function listClipSignals(userId) {
  if (!userId || userId === "guest") return [];
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": userPk(userId),
        ":prefix": "CLIP_SIGNAL#",
      },
      Limit: 500,
    }),
  );
  return (result.Items || []).map(cleanItem);
}

function personalizeClips(clips, signals, relations, viewerId) {
  if (!signals.length) {
    return [...clips].sort(
      (a, b) =>
        Number(b.feedScore || 0) - Number(a.feedScore || 0) ||
        new Date(b.createdAt) - new Date(a.createdAt),
    );
  }
  const signalMap = new Map(signals.map((signal) => [String(signal.clipId), signal]));
  const topicAffinity = new Map();
  const creatorAffinity = new Map();
  for (const signal of signals) {
    const strength =
      Number(signal.viewedCount || 0) * 1.5 +
      (signal.liked ? 8 : 0) +
      Number(signal.sharedCount || 0) * 6 +
      (signal.preference === "interested" ? 12 : 0) -
      (signal.preference === "not_interested" ? 14 : 0);
    creatorAffinity.set(signal.creatorId, Number(creatorAffinity.get(signal.creatorId) || 0) + strength);
    for (const topic of signal.topics || []) {
      topicAffinity.set(topic, Number(topicAffinity.get(topic) || 0) + strength);
    }
  }
  const supporting = new Set(relations.supporting || []);
  const scored = clips
    .filter((clip) => signalMap.get(String(clip._id))?.preference !== "not_interested")
    .map((clip) => {
      const ageHours = Math.max(0, (Date.now() - new Date(clip.createdAt).getTime()) / 3600000);
      const popularity = Math.log2(2 + Number(clip.feedScore || 0)) * 2;
      const topicScore = clipTopics(clip).reduce(
        (sum, topic) => sum + Math.max(-8, Math.min(12, Number(topicAffinity.get(topic) || 0) * 0.35)),
        0,
      );
      const exact = signalMap.get(String(clip._id));
      const score =
        popularity +
        Math.max(0, 12 - ageHours / 12) +
        topicScore +
        Math.max(-10, Math.min(22, Number(creatorAffinity.get(clip.userId) || 0) * 0.55)) +
        (supporting.has(clip.userId) ? 5 : 0) +
        (String(clip.userId) === String(viewerId) ? -2 : 0) +
        (exact?.preference === "interested" ? 24 : 0);
      return { clip, score };
    })
    .sort((a, b) => b.score - a.score);

  // Keep recommendations varied instead of showing one creator repeatedly.
  const ordered = [];
  const remaining = [...scored];
  while (remaining.length) {
    const previousCreator = ordered.at(-1)?.userId;
    const index = remaining.findIndex(({ clip }) => clip.userId !== previousCreator);
    ordered.push(remaining.splice(index < 0 ? 0 : index, 1)[0].clip);
  }
  return ordered;
}

export async function listClips(viewerId, limit = 80) {
  const requestedLimit = Math.min(100, Math.max(1, Number(limit) || 80));
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      IndexName: INDEX_NAME,
      KeyConditionExpression: "GSI1PK = :feed",
      ExpressionAttributeValues: { ":feed": "FEED#CLIPS" },
      ScanIndexForward: false,
      Limit: Math.min(200, Math.max(80, requestedLimit * 4)),
    }),
  );
  const clips = (result.Items || []).map(cleanItem);
  const [relations, signals] = await Promise.all([
    viewerId && viewerId !== "guest"
      ? await getUserRelations(viewerId)
      : { blockedUsers: [], blockedByUsers: [], supporting: [], savedClips: [] },
    listClipSignals(viewerId),
  ]);
  const excludedUsers = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ]);
  const users = await batchGet(
    [...new Set(clips.map((clip) => clip.userId))].map((id) => ({
      PK: userPk(id),
      SK: "PROFILE",
    })),
  );
  const hydratedUsers = await Promise.all(users.map((item) => hydrateUserMedia(cleanItem(item))));
  const map = new Map(hydratedUsers.map((item) => [item._id, item]));
  const eligibleClips = clips.filter((clip) => {
    const owner = map.get(clip.userId);
    return (
      owner?.accountStatus === "active" &&
      !excludedUsers.has(clip.userId) &&
      (!owner.ishidden ||
        String(clip.userId) === String(viewerId) ||
        (relations.supporting || []).includes(clip.userId))
    );
  });
  const ranked = personalizeClips(eligibleClips, signals, relations, viewerId).slice(0, requestedLimit);
  const signalMap = new Map(signals.map((signal) => [String(signal.clipId), signal]));
  return Promise.all(
    ranked.map(async (clip) => {
        const hydrated = await hydrateClipMedia(clip);
        return {
          ...hydrated,
          user: map.get(clip.userId) || null,
          viewerLiked: (clip.likes || []).includes(viewerId),
          viewerViewed: (clip.views || []).includes(viewerId),
          viewerPreference: signalMap.get(String(clip._id))?.preference || null,
          viewerSaved: (relations.savedClips || []).includes(clip._id),
        };
      }),
  );
}

export async function updateClip(clipId, userId, action) {
  const key = { PK: clipPk(clipId), SK: "META" };
  const result = await client().send(
    new GetCommand({ TableName: table(), Key: key }),
  );
  if (!result.Item) return null;
  const clip = cleanItem(result.Item);
  if (action === "like") {
    clip.likes = (clip.likes || []).includes(userId)
      ? clip.likes.filter((id) => id !== userId)
      : [...(clip.likes || []), userId];
  } else if (action === "view" && !(clip.views || []).includes(userId)) {
    clip.views = [...(clip.views || []), userId];
  } else if (action === "share") {
    clip.shares = Number(clip.shares || 0) + 1;
  }
  clip.feedScore =
    (clip.likes?.length || 0) * 3 +
    (clip.views?.length || 0) +
    Number(clip.shares || 0) * 5;
  clip.updatedAt = now();
  await client().send(
    new PutCommand({
      TableName: table(),
      Item: {
        PK: key.PK,
        SK: key.SK,
        GSI1PK: "FEED#CLIPS",
        GSI1SK: `${clip.createdAt}#${clip._id}`,
        ...clip,
      },
    }),
  );
  if (userId && userId !== "guest") {
    const signalKey = { PK: userPk(userId), SK: `CLIP_SIGNAL#${clipId}` };
    const existing = await client().send(
      new GetCommand({ TableName: table(), Key: signalKey }),
    );
    const signal = cleanItem(existing.Item) || {
      clipId,
      creatorId: clip.userId,
      topics: clipTopics(clip),
      viewedCount: 0,
      sharedCount: 0,
      liked: false,
      createdAt: now(),
    };
    if (action === "view") signal.viewedCount = Number(signal.viewedCount || 0) + 1;
    if (action === "like") signal.liked = (clip.likes || []).includes(userId);
    if (action === "share") signal.sharedCount = Number(signal.sharedCount || 0) + 1;
    if (action === "interested" || action === "not_interested") signal.preference = action;
    signal.updatedAt = now();
    await client().send(
      new PutCommand({
        TableName: table(),
        Item: { ...signalKey, entityType: "clipSignal", ...signal },
      }),
    );
  }
  return clip;
}

export async function listClipComments(clipId, viewerId = "", limit = 200) {
  const result = await client().send(
    new QueryCommand({
      TableName: table(),
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
      ExpressionAttributeValues: {
        ":pk": clipPk(clipId),
        ":prefix": "COMMENT#",
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  const comments = (result.Items || []).map(cleanItem);
  const users = await getUsersByIds(comments.map((comment) => comment.userId));
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  return comments.map((comment) => ({
    ...comment,
    user: userMap.get(String(comment.userId)) || null,
    viewerLiked: Boolean(viewerId && (comment.likes || []).includes(viewerId)),
  }));
}

export async function addClipComment(clipId, userId, text, parentId = null) {
  const [clip, user] = await Promise.all([getClip(clipId), getUserById(userId)]);
  if (!clip || !user) return null;
  const id = newId();
  const createdAt = now();
  const comment = {
    _id: id,
    entityType: "clipComment",
    clipId,
    userId,
    text,
    parentId: parentId || null,
    likes: [],
    createdAt,
    updatedAt: createdAt,
  };
  await client().send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: table(),
            Item: {
              PK: clipPk(clipId),
              SK: `COMMENT#${createdAt}#${id}`,
              ...comment,
            },
          },
        },
        {
          Update: {
            TableName: table(),
            Key: { PK: clipPk(clipId), SK: "META" },
            UpdateExpression: "ADD commentsCount :one SET updatedAt = :now",
            ExpressionAttributeValues: { ":one": 1, ":now": createdAt },
          },
        },
      ],
    }),
  );
  if (clip.userId !== userId) {
    await createNotification({
      recipient: clip.userId,
      sender: userId,
      type: "clip_comment",
      status: "approved",
      clip: clipId,
    });
  }
  return { ...comment, user };
}

export async function toggleClipCommentLike(clipId, commentId, userId) {
  const item = await findCommentRecord(clipPk(clipId), commentId);
  if (!item) return null;
  const likes = (item.likes || []).includes(userId) ? item.likes.filter((id) => id !== userId) : [...(item.likes || []), userId];
  await client().send(new UpdateCommand({ TableName: table(), Key: { PK: item.PK, SK: item.SK }, UpdateExpression: "SET likes = :likes, updatedAt = :now", ExpressionAttributeValues: { ":likes": likes, ":now": now() } }));
  return { ...cleanItem(item), likes, viewerLiked: likes.includes(userId) };
}

export async function deleteClip(clipId, userId) {
  const clip = await getClip(clipId);
  if (!clip || String(clip.userId) !== String(userId)) return false;

  await deleteS3Objects(mediaValues(clip));
  const allItems = await scanAllItems();
  const deleteKeys = allItems
    .filter(
      (item) =>
        item.PK === clipPk(clipId) ||
        item.clipId === clipId ||
        item.clip === clipId,
    )
    .map((item) => ({ PK: item.PK, SK: item.SK }));
  const sharedMessages = allItems.filter(
    (item) => item.entityType === "message" && item.sharedClip?._id === clipId,
  );
  const sharedPreviews = allItems.filter(
    (item) => item.lastMessage?.sharedClip?._id === clipId,
  );

  await batchDelete(deleteKeys);
  await Promise.all([
    ...sharedMessages.map((item) =>
      client().send(
        new UpdateCommand({
          TableName: table(),
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: "SET sharedClip = :empty, updatedAt = :now",
          ExpressionAttributeValues: { ":empty": null, ":now": now() },
        }),
      ),
    ),
    ...sharedPreviews.map((item) =>
      client().send(
        new UpdateCommand({
          TableName: table(),
          Key: { PK: item.PK, SK: item.SK },
          UpdateExpression: "SET lastMessage.sharedClip = :empty, updatedAt = :now",
          ExpressionAttributeValues: { ":empty": null, ":now": now() },
        }),
      ),
    ),
  ]);
  return true;
}
