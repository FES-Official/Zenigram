import { GetCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";

const client = () => getDynamoDocumentClient();
const table = () => getDynamoTableName();
const clipKey = (clipId) => ({ PK: `CLIP#${clipId}`, SK: "META" });
const likeKey = (clipId, userId) => ({ PK: `CLIP#${clipId}`, SK: `LIKE#${userId}` });
const viewKey = (clipId, userId) => ({ PK: `CLIP#${clipId}`, SK: `VIEW#${userId}` });

function isConditionalFailure(error) {
  return error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException";
}

async function getClip(clipId) {
  const result = await client().send(new GetCommand({ TableName: table(), Key: clipKey(clipId), ConsistentRead: true }));
  return result.Item || null;
}

async function ensureCounter(clipId, field, legacyValue) {
  await client().send(new UpdateCommand({
    TableName: table(), Key: clipKey(clipId),
    UpdateExpression: `SET ${field} = if_not_exists(${field}, :legacy)`,
    ExpressionAttributeValues: { ":legacy": Math.max(0, Number(legacyValue || 0)) },
    ConditionExpression: "attribute_exists(PK)",
  }));
}

export async function getClipViewerEngagement(clipId, userId) {
  if (!userId || userId === "guest") return { liked: false, viewed: false };
  const [like, view] = await Promise.all([
    client().send(new GetCommand({ TableName: table(), Key: likeKey(clipId, userId), ConsistentRead: true })),
    client().send(new GetCommand({ TableName: table(), Key: viewKey(clipId, userId), ConsistentRead: true })),
  ]);
  return { liked: Boolean(like.Item), viewed: Boolean(view.Item) };
}

async function applyLikeState(clipId, userId, liked) {
  const key = likeKey(clipId, userId);
  const timestamp = new Date().toISOString();
  await client().send(new TransactWriteCommand({
    TransactItems: liked
      ? [
          { Put: { TableName: table(), Item: { ...key, entityType: "clipLike", clipId, userId, createdAt: timestamp }, ConditionExpression: "attribute_not_exists(PK)" } },
          { Update: { TableName: table(), Key: clipKey(clipId), UpdateExpression: "SET likesCount = if_not_exists(likesCount, :zero) + :one, feedScore = if_not_exists(feedScore, :zero) + :score, updatedAt = :now", ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":score": 3, ":now": timestamp }, ConditionExpression: "attribute_exists(PK)" } },
        ]
      : [
          { Delete: { TableName: table(), Key: key, ConditionExpression: "attribute_exists(PK)" } },
          { Update: { TableName: table(), Key: clipKey(clipId), UpdateExpression: "ADD likesCount :minusOne, feedScore :minusScore SET updatedAt = :now", ExpressionAttributeValues: { ":minusOne": -1, ":minusScore": -3, ":one": 1, ":now": timestamp }, ConditionExpression: "attribute_exists(PK) AND likesCount >= :one" } },
        ],
  }));
}

export async function toggleClipLikeAtomic(clipId, userId) {
  if (!userId || userId === "guest") throw new Error("Authentication required");
  const clip = await getClip(clipId);
  if (!clip) throw new Error("Clip not found");
  const current = await getClipViewerEngagement(clipId, userId);
  const desired = !current.liked;
  if (!desired) await ensureCounter(clipId, "likesCount", Array.isArray(clip.likes) ? clip.likes.length : 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await applyLikeState(clipId, userId, desired);
      break;
    } catch (error) {
      if (!isConditionalFailure(error) || attempt === 2) throw error;
      const latest = await getClipViewerEngagement(clipId, userId);
      if (latest.liked === desired) break;
    }
  }

  const [updated, finalState] = await Promise.all([
    getClip(clipId),
    getClipViewerEngagement(clipId, userId),
  ]);
  return {
    liked: finalState.liked,
    likesCount: Math.max(0, Number(updated?.likesCount ?? updated?.likes?.length ?? 0)),
  };
}

export async function recordClipViewAtomic(clipId, userId) {
  if (!userId || userId === "guest") return { recorded: false, viewed: false, viewsCount: 0 };
  const clip = await getClip(clipId);
  if (!clip) throw new Error("Clip not found");
  const legacyCount = Array.isArray(clip.views) ? clip.views.length : 0;
  const key = viewKey(clipId, userId);
  const timestamp = new Date().toISOString();

  try {
    await client().send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: table(), Item: { ...key, entityType: "clipView", clipId, userId, createdAt: timestamp }, ConditionExpression: "attribute_not_exists(PK)" } },
        { Update: { TableName: table(), Key: clipKey(clipId), UpdateExpression: "SET viewsCount = if_not_exists(viewsCount, :legacy) + :one, feedScore = if_not_exists(feedScore, :zero) + :score, updatedAt = :now", ExpressionAttributeValues: { ":legacy": Math.max(0, Number(legacyCount)), ":zero": 0, ":one": 1, ":score": 1, ":now": timestamp }, ConditionExpression: "attribute_exists(PK)" } },
      ],
    }));
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
    const [updated, existing] = await Promise.all([
      getClip(clipId),
      client().send(new GetCommand({ TableName: table(), Key: key, ConsistentRead: true })),
    ]);
    return {
      recorded: false,
      viewed: Boolean(existing.Item),
      viewsCount: Math.max(0, Number(updated?.viewsCount ?? updated?.views?.length ?? 0)),
    };
  }

  const updated = await getClip(clipId);
  return {
    recorded: true,
    viewed: true,
    viewsCount: Math.max(0, Number(updated?.viewsCount ?? updated?.views?.length ?? 0)),
  };
}

export async function incrementClipShareAtomic(clipId) {
  const timestamp = new Date().toISOString();
  const result = await client().send(new UpdateCommand({
    TableName: table(), Key: clipKey(clipId),
    UpdateExpression: "SET shares = if_not_exists(shares, :zero) + :one, feedScore = if_not_exists(feedScore, :zero) + :score, updatedAt = :now",
    ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":score": 5, ":now": timestamp },
    ConditionExpression: "attribute_exists(PK)", ReturnValues: "ALL_NEW",
  }));
  return { shares: Number(result.Attributes?.shares || 0) };
}
