import { GetCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getPost } from "@/app/lib/socialStore";

const client = () => getDynamoDocumentClient();
const table = () => getDynamoTableName();
const postKey = (postId) => ({ PK: `POST#${postId}`, SK: "META" });
const likeKey = (postId, userId) => ({ PK: `POST#${postId}`, SK: `LIKE#${userId}` });

async function applyToggle(postId, userId, shouldLike) {
  const key = likeKey(postId, userId);
  const delta = shouldLike ? 1 : -1;
  const now = new Date().toISOString();

  await client().send(new TransactWriteCommand({
    TransactItems: [
      shouldLike
        ? {
            Put: {
              TableName: table(),
              Item: { ...key, entityType: "like", userId, createdAt: now },
              ConditionExpression: "attribute_not_exists(PK)",
            },
          }
        : {
            Delete: {
              TableName: table(),
              Key: key,
              ConditionExpression: "attribute_exists(PK)",
            },
          },
      {
        Update: {
          TableName: table(),
          Key: postKey(postId),
          UpdateExpression: "SET likesCount = if_not_exists(likesCount, :zero) + :delta, updatedAt = :now",
          ExpressionAttributeValues: { ":zero": 0, ":delta": delta, ":now": now },
          ConditionExpression: "attribute_exists(PK)",
        },
      },
    ],
  }));
}

export async function togglePostLikeAtomic(postId, userId) {
  const post = await getPost(postId);
  if (!post) return null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await client().send(new GetCommand({
      TableName: table(),
      Key: likeKey(postId, userId),
      ConsistentRead: true,
    }));
    const shouldLike = !existing.Item;

    try {
      await applyToggle(postId, userId, shouldLike);
      const updated = await getPost(postId);
      return {
        liked: shouldLike,
        likesCount: Math.max(0, Number(updated?.likesCount || 0)),
        post: updated,
      };
    } catch (error) {
      if (error?.name !== "TransactionCanceledException" || attempt === 2) throw error;
    }
  }

  throw new Error("Unable to update post like");
}
