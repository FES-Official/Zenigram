import { randomBytes } from "crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import {
  createNotification,
  getUserById,
  getUserByUsername,
  getUserRelations,
  updateEventInvitationNotifications,
  updateUser,
} from "@/app/lib/socialStore";
import { getReadableMediaUrl, hydrateUserMedia } from "@/app/lib/s3Storage";
import {
  achievementIdsForViews,
  EXPLORATION_ACHIEVEMENTS,
  LAST_HOURS_GOAL,
  isPreviousDay,
  toDayKey,
} from "@/app/lib/progression";

const INDEX_NAME = process.env.DYNAMODB_GSI_NAME || "GSI1";
const DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_MISSIONS = [
  { title: "Right Now", prompt: "Show what is happening around you without staging it.", icon: "pulse" },
  { title: "Local Detail", prompt: "Capture one thing that makes your location unmistakable.", icon: "pin" },
  { title: "Shared Sky", prompt: "Show the sky above your part of the world today.", icon: "sky" },
];

function db() {
  return getDynamoDocumentClient();
}

function table() {
  return getDynamoTableName();
}

function newId() {
  return randomBytes(12).toString("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function clean(item) {
  if (!item) return null;
  const result = { ...item };
  delete result.PK;
  delete result.SK;
  delete result.GSI1PK;
  delete result.GSI1SK;
  return result;
}

function distanceInMeters(a, b) {
  const radius = 6371000;
  const radians = (value) => (value * Math.PI) / 180;
  const latDelta = radians(b.lat - a.lat);
  const lngDelta = radians(b.lng - a.lng);
  const startLat = radians(a.lat);
  const endLat = radians(b.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

async function listByFeed(feed, limit = 250) {
  const result = await db().send(
    new QueryCommand({
      TableName: table(),
      IndexName: INDEX_NAME,
      KeyConditionExpression: "GSI1PK = :feed",
      ExpressionAttributeValues: { ":feed": feed },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (result.Items || []).map(clean);
}

async function getEvent(eventId) {
  if (!eventId) return null;
  const result = await db().send(
    new GetCommand({ TableName: table(), Key: { PK: `EVENT#${eventId}`, SK: "META" } }),
  );
  return clean(result.Item);
}

async function getMission(missionId) {
  if (!missionId) return null;
  const result = await db().send(
    new GetCommand({ TableName: table(), Key: { PK: `MISSION#${missionId}`, SK: "META" } }),
  );
  return clean(result.Item);
}

async function hydrateStory(story, viewerId) {
  if (!story) return null;
  const [user, event, mission, like] = await Promise.all([
    getUserById(story.userId),
    getEvent(story.eventId),
    getMission(story.missionId),
    viewerId
      ? db().send(new GetCommand({
          TableName: table(),
          Key: { PK: `STORY#${story._id}`, SK: `LIKE#${viewerId}` },
        }))
      : Promise.resolve({}),
  ]);
  return {
    ...story,
    userId: user,
    event,
    mission,
    mediaUrl: await getReadableMediaUrl(story.mediaUrl, story.mediaKey),
    viewerLiked: Boolean(like.Item),
  };
}

export async function listActiveMissions() {
  const current = Date.now();
  let missions = (await listByFeed("FEED#MISSIONS", 100)).filter(
    (mission) =>
      mission.active !== false &&
      new Date(mission.startsAt).getTime() <= current &&
      new Date(mission.endsAt).getTime() > current,
  );
  if (missions.length) return missions;

  const createdAt = nowIso();
  missions = DEFAULT_MISSIONS.map((mission) => ({
    _id: newId(),
    entityType: "mission",
    ...mission,
    active: true,
    startsAt: createdAt,
    endsAt: new Date(Date.now() + 365 * DAY_MS).toISOString(),
    submissionCount: 0,
    createdAt,
    updatedAt: createdAt,
  }));
  await Promise.all(
    missions.map((mission) =>
      db().send(new PutCommand({
        TableName: table(),
        Item: {
          PK: `MISSION#${mission._id}`,
          SK: "META",
          GSI1PK: "FEED#MISSIONS",
          GSI1SK: `${mission.createdAt}#${mission._id}`,
          ...mission,
        },
      })),
    ),
  );
  return missions;
}

async function findOrCreateEvent(location, userId) {
  const active = (await listByFeed("FEED#EVENTS", 200)).filter(
    (event) => new Date(event.expiresAt).getTime() > Date.now(),
  );
  const existing = active.find(
    (event) => distanceInMeters(location, event.location) <= Number(event.radiusMeters || 700),
  );
  if (existing) return existing;

  const id = newId();
  const createdAt = nowIso();
  const event = {
    _id: id,
    entityType: "storyEvent",
    title: `Live near ${location.lat.toFixed(2)}, ${location.lng.toFixed(2)}`,
    createdBy: userId,
    contributorIds: [userId],
    location: { lat: location.lat, lng: location.lng },
    radiusMeters: 700,
    storyCount: 0,
    expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
    createdAt,
    updatedAt: createdAt,
  };
  await db().send(new PutCommand({
    TableName: table(),
    Item: {
      PK: `EVENT#${id}`,
      SK: "META",
      GSI1PK: "FEED#EVENTS",
      GSI1SK: `${createdAt}#${id}`,
      ...event,
    },
  }));
  return event;
}

export async function createStory(input) {
  const user = await getUserById(input.userId);
  if (!user) return null;
  const relations = await getUserRelations(input.userId);
  const unavailableMentions = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ]);
  const mentionCandidates = [...new Set(input.mentionedUserIds || [])]
    .filter(
      (userId) =>
        userId &&
        userId !== input.userId &&
        !unavailableMentions.has(userId),
    )
    .slice(0, 10);
  const mentionedUsers = (await Promise.all(mentionCandidates.map(getUserById))).filter(Boolean);
  const mentionedUserIds = mentionedUsers.map((mentionedUser) => mentionedUser._id);
  const createdAt = nowIso();
  const event = await findOrCreateEvent(input.location, input.userId);
  const mission = input.missionId ? await getMission(input.missionId) : null;
  const validMission = mission && mission.active !== false && new Date(mission.endsAt) > new Date();
  const id = newId();
  const story = {
    _id: id,
    entityType: "story",
    userId: input.userId,
    mediaKey: input.media.key,
    mediaUrl: input.media.url,
    mediaType: input.mediaType || "image",
    latitude: input.location.lat,
    longitude: input.location.lng,
    locationSource: "manual",
    realityScore: input.realityScore,
    realityLabel: input.realityLabel,
    eventId: event._id,
    missionId: validMission ? mission._id : null,
    duration: input.duration,
    caption: input.caption || "",
    mentionedUserIds,
    likesCount: 0,
    viewsCount: 0,
    commentsCount: 0,
    expiresAt: new Date(Date.now() + DAY_MS).toISOString(),
    createdAt,
    updatedAt: createdAt,
  };

  const timeZone = input.timeZone || user.progression?.timeZone || "UTC";
  const day = toDayKey(new Date(), timeZone);
  const previousDay = user.progression?.lastStoryDay || "";
  const oldPower = Number(user.progression?.currentPower || 0);
  const firstToday = previousDay !== day;
  const currentPower = firstToday ? (isPreviousDay(previousDay, day) ? oldPower + 1 : 1) : oldPower;
  const progression = {
    ...(user.progression || {}),
    currentPower,
    bestPower: Math.max(Number(user.progression?.bestPower || 0), currentPower),
    totalPower: Number(user.progression?.totalPower || 0) + (firstToday ? currentPower : 0),
    lastStoryDay: day,
    timeZone,
  };

  const writes = [
    { Put: { TableName: table(), Item: {
      PK: `STORY#${id}`, SK: "META", GSI1PK: "FEED#STORIES",
      GSI1SK: `${createdAt}#${id}`, ...story,
    } } },
    { Update: {
      TableName: table(),
      Key: { PK: `EVENT#${event._id}`, SK: "META" },
      UpdateExpression: (event.contributorIds || []).includes(input.userId)
        ? "ADD storyCount :one SET updatedAt = :now"
        : "ADD storyCount :one SET contributorIds = list_append(if_not_exists(contributorIds, :empty), :contributors), updatedAt = :now",
      ExpressionAttributeValues: (event.contributorIds || []).includes(input.userId)
        ? { ":one": 1, ":now": createdAt }
        : { ":one": 1, ":empty": [], ":contributors": [input.userId], ":now": createdAt },
    } },
  ];
  if (validMission) writes.push({ Update: { TableName: table(), Key: { PK: `MISSION#${mission._id}`, SK: "META" },
    UpdateExpression: "ADD submissionCount :one SET updatedAt = :now",
    ExpressionAttributeValues: { ":one": 1, ":now": createdAt },
  } });
  await db().send(new TransactWriteCommand({ TransactItems: writes }));
  if (firstToday) await updateUser(input.userId, { progression });
  await Promise.allSettled(mentionedUserIds.map((recipient) => createNotification({
    recipient,
    sender: input.userId,
    type: "story_mention",
    story: id,
    status: "approved",
  })));
  return { story: await hydrateStory(story, input.userId), power: { ...progression, increased: firstToday } };
}

export async function getStory(storyId) {
  const result = await db().send(new GetCommand({
    TableName: table(), Key: { PK: `STORY#${storyId}`, SK: "META" },
  }));
  return clean(result.Item);
}

export async function listStories(viewerId) {
  const current = Date.now();
  const stories = (await listByFeed("FEED#STORIES", 500)).filter(
    (story) => new Date(story.expiresAt || new Date(story.createdAt).getTime() + DAY_MS).getTime() > current,
  );
  const relations = viewerId ? await getUserRelations(viewerId) : { supporting: [], blockedUsers: [] };
  const blocked = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ]);
  const hydrated = await Promise.all(stories.map((story) => hydrateStory(story, viewerId)));
  return hydrated
    .filter((story) => story.userId && story.userId.accountStatus === "active")
    .filter((story) => !blocked.has(story.userId._id))
    .filter((story) => !story.userId.ishidden || story.userId._id === viewerId || relations.supporting?.includes(story.userId._id))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function engageStory(storyId, userId, action) {
  const story = await getStory(storyId);
  if (!story || new Date(story.expiresAt).getTime() <= Date.now()) return null;
  if (action === "like") {
    const key = { PK: `STORY#${storyId}`, SK: `LIKE#${userId}` };
    const existing = await db().send(new GetCommand({ TableName: table(), Key: key }));
    const liked = !existing.Item;
    await db().send(new TransactWriteCommand({ TransactItems: [
      liked
        ? { Put: { TableName: table(), Item: { ...key, entityType: "storyLike", userId, createdAt: nowIso() } } }
        : { Delete: { TableName: table(), Key: key } },
      { Update: { TableName: table(), Key: { PK: `STORY#${storyId}`, SK: "META" },
        UpdateExpression: "ADD likesCount :delta SET updatedAt = :now",
        ExpressionAttributeValues: { ":delta": liked ? 1 : -1, ":now": nowIso() },
      } },
    ] }));
    const updated = await getStory(storyId);
    return { likesCount: Math.max(0, updated.likesCount || 0), viewsCount: updated.viewsCount || 0, viewerLiked: liked };
  }

  const viewKey = { PK: `STORY#${storyId}`, SK: `VIEW#${userId}` };
  const existing = await db().send(new GetCommand({ TableName: table(), Key: viewKey }));
  const own = story.userId === userId;
  let newlyAwardedAchievements = [];
  let lastHoursReward = null;
  if (!existing.Item) {
    await db().send(new TransactWriteCommand({ TransactItems: [
      { Put: { TableName: table(), Item: { ...viewKey, entityType: "storyView", userId, lastHoursPoints: 0, createdAt: nowIso(), expiresAt: story.expiresAt } } },
      { Update: { TableName: table(), Key: { PK: `STORY#${storyId}`, SK: "META" }, UpdateExpression: "ADD viewsCount :one", ExpressionAttributeValues: { ":one": 1 } } },
    ] }));
    if (!own) {
      const user = await getUserById(userId);
      const viewed = Number(user?.progression?.storiesViewed || 0) + 1;
      const currentIds = user?.progression?.achievementIds || [];
      const earned = achievementIdsForViews(viewed);
      newlyAwardedAchievements = EXPLORATION_ACHIEVEMENTS.filter((item) => earned.includes(item.id) && !currentIds.includes(item.id));
      const remainingHours = (new Date(story.expiresAt).getTime() - Date.now()) / 3600000;
      let points = 0;
      if (remainingHours > 0 && remainingHours <= 4) points = Math.max(1, Math.min(4, Math.ceil(remainingHours)));
      const progression = {
        ...(user?.progression || {}),
        storiesViewed: viewed,
        achievementIds: [...new Set([...currentIds, ...earned])],
        lastHoursPoints: Number(user?.progression?.lastHoursPoints || 0) + points,
      };
      await updateUser(userId, { progression });
      if (points) {
        await db().send(new UpdateCommand({ TableName: table(), Key: viewKey, UpdateExpression: "SET lastHoursPoints = :points, lastHoursClaimedAt = :now", ExpressionAttributeValues: { ":points": points, ":now": nowIso() } }));
        lastHoursReward = { points, totalPoints: progression.lastHoursPoints, goal: LAST_HOURS_GOAL };
      }
    }
  }
  const updated = await getStory(storyId);
  const viewer = await getUserById(userId);
  return {
    likesCount: updated.likesCount || 0,
    viewsCount: updated.viewsCount || 0,
    viewerLiked: Boolean((await db().send(new GetCommand({ TableName: table(), Key: { PK: `STORY#${storyId}`, SK: `LIKE#${userId}` } }))).Item),
    progression: {
      storiesViewed: Number(viewer?.progression?.storiesViewed || 0),
      achievementIds: viewer?.progression?.achievementIds || [],
      lastHoursPoints: Number(viewer?.progression?.lastHoursPoints || 0),
      lastHoursGoal: LAST_HOURS_GOAL,
    },
    newlyAwardedAchievements,
    lastHoursReward,
  };
}

export async function listStoryComments(storyId, viewerId = "", limit = 100) {
  const result = await db().send(new QueryCommand({
    TableName: table(),
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": `STORY#${storyId}`, ":prefix": "COMMENT#" },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return Promise.all((result.Items || []).map(async (item) => ({ ...clean(item), user: await getUserById(item.userId), viewerLiked: Boolean(viewerId && (item.likes || []).includes(viewerId)) })));
}

export async function addStoryComment(storyId, userId, text, parentId = null) {
  const story = await getStory(storyId);
  const user = await getUserById(userId);
  if (!story || !user) return null;
  const id = newId();
  const createdAt = nowIso();
  const comment = { _id: id, entityType: "storyComment", storyId, userId, text, parentId: parentId || null, likes: [], createdAt, updatedAt: createdAt };
  await db().send(new TransactWriteCommand({ TransactItems: [
    { Put: { TableName: table(), Item: { PK: `STORY#${storyId}`, SK: `COMMENT#${createdAt}#${id}`, ...comment } } },
    { Update: { TableName: table(), Key: { PK: `STORY#${storyId}`, SK: "META" }, UpdateExpression: "ADD commentsCount :one", ExpressionAttributeValues: { ":one": 1 } } },
  ] }));
  if (story.userId !== userId) await createNotification({ recipient: story.userId, sender: userId, type: "story_comment", status: "approved" });
  return { ...comment, user };
}

export async function toggleStoryCommentLike(storyId, commentId, userId) {
  const result = await db().send(new QueryCommand({ TableName: table(), KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)", ExpressionAttributeValues: { ":pk": `STORY#${storyId}`, ":prefix": "COMMENT#" }, Limit: 500 }));
  const item = (result.Items || []).find((entry) => String(entry._id) === String(commentId));
  if (!item) return null;
  const likes = (item.likes || []).includes(userId) ? item.likes.filter((id) => id !== userId) : [...(item.likes || []), userId];
  await db().send(new UpdateCommand({ TableName: table(), Key: { PK: item.PK, SK: item.SK }, UpdateExpression: "SET likes = :likes, updatedAt = :now", ExpressionAttributeValues: { ":likes": likes, ":now": nowIso() } }));
  return { ...clean(item), likes, viewerLiked: likes.includes(userId) };
}

export async function createReport(input) {
  const id = newId();
  const createdAt = nowIso();
  await db().send(new PutCommand({ TableName: table(), Item: {
    PK: `REPORT#${id}`, SK: "META", _id: id, entityType: "report", status: "open", ...input, createdAt, updatedAt: createdAt,
  } }));
  return id;
}

export async function listInvitations(userId) {
  const result = await db().send(new QueryCommand({
    TableName: table(), KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
    ExpressionAttributeValues: { ":pk": `USER#${userId}`, ":prefix": "INVITATION#" }, ScanIndexForward: false,
  }));
  return Promise.all((result.Items || []).map(async (item) => ({
    ...clean(item), event: await getEvent(item.eventId), sender: await getUserById(item.senderId),
  })));
}

export async function createInvitation(eventId, senderId, recipientId) {
  const [event, recipient] = await Promise.all([getEvent(eventId), getUserById(recipientId)]);
  if (!event || !recipient || new Date(event.expiresAt) <= new Date()) return null;
  if (event.createdBy !== senderId && !(event.contributorIds || []).includes(senderId)) return { forbidden: true };
  const id = `${eventId}#${senderId}`;
  const createdAt = nowIso();
  const invitation = { _id: id, entityType: "eventInvitation", eventId, senderId, recipientId, status: "pending", createdAt, updatedAt: createdAt };
  await db().send(new PutCommand({ TableName: table(), Item: { PK: `USER#${recipientId}`, SK: `INVITATION#${id}`, ...invitation } }));
  await createNotification({ recipient: recipientId, sender: senderId, type: "event_invitation", event: eventId, status: "pending" });
  return invitation;
}

export async function respondToInvitation(userId, invitationId, action) {
  const key = { PK: `USER#${userId}`, SK: `INVITATION#${invitationId}` };
  const result = await db().send(new GetCommand({ TableName: table(), Key: key }));
  const invitation = clean(result.Item);
  if (!invitation || invitation.status !== "pending") return null;
  const event = await getEvent(invitation.eventId);
  if (!event || new Date(event.expiresAt) <= new Date()) return { expired: true };
  const status = action === "accept" ? "accepted" : "declined";
  await db().send(new UpdateCommand({ TableName: table(), Key: key, UpdateExpression: "SET #status = :status, updatedAt = :now", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":status": status, ":now": nowIso() } }));
  if (action === "accept" && !(event.contributorIds || []).includes(userId)) {
    await db().send(new UpdateCommand({
      TableName: table(),
      Key: { PK: `EVENT#${event._id}`, SK: "META" },
      UpdateExpression: "SET contributorIds = list_append(if_not_exists(contributorIds, :empty), :user)",
      ExpressionAttributeValues: { ":empty": [], ":user": [userId] },
    }));
  }
  await updateEventInvitationNotifications(userId, event._id, status);
  return { ...invitation, event, status };
}

export async function getUserTrail(identifier, viewerId) {
  const user = /^[a-f\d]{24}$/i.test(identifier) ? await getUserById(identifier) : await getUserByUsername(identifier);
  if (!user) return null;
  const relations = viewerId
    ? await getUserRelations(viewerId)
    : { supporting: [], blockedUsers: [], blockedByUsers: [] };
  if (
    viewerId !== user._id &&
    [...(relations.blockedUsers || []), ...(relations.blockedByUsers || [])].includes(user._id)
  ) {
    return null;
  }
  if (user.ishidden && viewerId !== user._id && !relations.supporting?.includes(user._id)) return { hidden: true };
  const stories = (await listStories(viewerId)).filter((story) => story.userId?._id === user._id);
  return {
    user: await hydrateUserMedia(user),
    coordinates: stories.map((story) => [Number(story.longitude), Number(story.latitude)]),
    stories,
  };
}
