import { GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";

const client = () => getDynamoDocumentClient();
const table = () => getDynamoTableName();
const clipKey = (clipId) => ({ PK: `CLIP#${clipId}`, SK: "META" });
const likeKey = (clipId, userId) => ({ PK: `CLIP#${clipId}`, SK: `LIKE#${userId}` });
const viewKey = (clipId, userId) => ({ PK: `CLIP#${clipId}`, SK: `VIEW#${userId}` });

async function getClip(clipId) {
  const result = await client().send(new GetCommand({ TableName: table(), Key: clipKey(clipId), ConsistentRead: true }));
  return result.Item || null;
}

export async function getClipViewerEngagement(clipId, userId) {
  if (!userId || userId === "guest") return { liked: false, viewed: false };
  const [like, view] = await Promise.all([
    client().send(new GetCommand({ TableName: table(), Key: likeKey(clipId, userId), ConsistentRead: true })),
    client().send(new GetCommand({ TableName: table(), Key: viewKey(clipId, userId), ConsistentRead: true })),
  ]);
  return { liked: Boolean(like.Item), viewed: Boolean(view.Item) };
}

export async function toggleClipLikeAtomic(clipId, userId) {
  if (!userId || userId === "guest") throw new Error("Authentication required");
  const existing = await client().send(new GetCommand({ TableName: table(), Key: likeKey(clipId, userId), ConsistentRead: true }));
  const liked = !existing.Item;
  const key = likeKey(clipId, userId);
  const now = new Date().toISOString();

  await client().send(new TransactWriteCommand({
    TransactItems: liked
      ? [
          {
            Put: {
              TableName: table(),
              Item: { ...key, entityType: "clipLike", clipId, userId, createdAt: now },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          },
          {
            Update: {
              TableName: table(),
              Key: clipKey(clipId),
              UpdateExpression: "ADD likesCount :one SET updatedAt = :now",
              ExpressionAttributeValues: { ":one": 1, ":now": now },
              ConditionExpression: "attribute_exists(PK)",
            },
          },
        ]
      : [
          {
            Delete: {
              TableName: table(),
              Key: key,
              ConditionExpression: "attribute_exists(PK)",
            },
          },
          {
            Update: {
              TableName: table(),
              Key: clipKey(clipId),
              UpdateExpression: "ADD likesCount :minusOne SET updatedAt = :now",
              ExpressionAttributeValues: { ":minusOne": -1, ":now": now },
              ConditionExpression: "attribute_exists(PK) AND likesCount >= :one",
              ExpressionAttributeValues: { ":one": 1, ":minusOne": -1, ":now": now },
            },
          },
        ],
  }));

  const clip = await getClip(clipId);
  return { liked, likesCount: Math.max(0, Number(clip?.likesCount || 0)) };
}

export async function recordClipViewAtomic(clipId, userId) {
  if (!userId || userId === "guest") return { recorded: false };
  const key = viewKey(clipId, userId);
  const existing = await client().send(new GetCommand({ TableName: table(), Key: key, ConsistentRead: true }));
  if (existing.Item) return { recorded: false, viewed: true, viewsCount: Number((await getClip(clipId))?.viewsCount || 0) };
  const now = new Date().toISOString();
  await client().send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: table(),
          Item: { ...key, entityType: "clipView", clipId, userId, createdAt: now },
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Update: {
          TableName: table(),
          Key: clipKey(clipId),
          UpdateExpression: "ADD viewsCount :one SET updatedAt = :now",
          ExpressionAttributeValues: { ":one": 1, ":now": now },
          ConditionExpression: "attribute_exists(PK)",
        },
      },
    ],
  }));
  const clip = await getClip(clipId);
  return { recorded: true, viewed: true, viewsCount: Number(clip?.viewsCount || 0) };
}

export async function incrementClipShareAtomic(clipId) {
  const now = new Date().toISOString();
  const result = await client().send(new UpdateCommand({
    TableName: table(),
    Key: clipKey(clipId),
    UpdateExpression: "ADD shares :one SET updatedAt = :now",
    ExpressionAttributeValues: { ":one": 1, ":now": now },
    ConditionExpression: "attribute_exists(PK)",
    ReturnValues: "ALL_NEW",
  }));
  return { shares: Number(result.Attributes?.shares || 0) };
}
