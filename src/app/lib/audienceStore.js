import { GetCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getUserRelations, getUsersByIds } from "@/app/lib/socialStore";

const INDEX_NAME = process.env.DYNAMODB_GSI_NAME || "GSI1";
const client = () => getDynamoDocumentClient();
const table = () => getDynamoTableName();

function clean(item) {
  if (!item) return null;
  const value = { ...item };
  delete value.PK; delete value.SK; delete value.GSI1PK; delete value.GSI1SK; delete value.GSI2PK; delete value.GSI2SK;
  return value;
}

function contentKey(kind, id) {
  return kind === "post" ? { PK: `POST#${id}`, SK: "META" } : { PK: `CLIP#${id}`, SK: "META" };
}

export async function setContentAudience(kind, contentId, ownerId, closeOnesOnly) {
  const key = contentKey(kind, contentId);
  const result = await client().send(new GetCommand({ TableName: table(), Key: key }));
  if (!result.Item || String(result.Item.userId) !== String(ownerId)) return null;
  const next = Boolean(closeOnesOnly);
  await client().send(new UpdateCommand({
    TableName: table(), Key: key,
    UpdateExpression: "SET closeOnesOnly = :close, updatedAt = :now",
    ExpressionAttributeValues: { ":close": next, ":now": new Date().toISOString() },
  }));
  return { ...clean(result.Item), closeOnesOnly: next };
}

export async function canViewContent(content, viewerId, ownerUser = null, relations = null) {
  if (!content || !viewerId) return false;
  if (String(content.userId) === String(viewerId)) return true;
  const rel = relations || await getUserRelations(viewerId);
  const blocked = new Set([...(rel.blockedUsers || []), ...(rel.blockedByUsers || [])].map(String));
  if (blocked.has(String(content.userId))) return false;
  const close = new Set((rel.closeOnes || []).map(String));
  if (content.closeOnesOnly && !close.has(String(content.userId))) return false;
  if (ownerUser?.accountStatus && ownerUser.accountStatus !== "active") return false;
  if (ownerUser?.ishidden && !(rel.supporting || []).map(String).includes(String(content.userId))) return false;
  return true;
}

export async function listVisiblePosts(viewerId, limit = 80) {
  const raw = await client().send(new QueryCommand({
    TableName: table(), IndexName: INDEX_NAME,
    KeyConditionExpression: "GSI1PK = :feed",
    ExpressionAttributeValues: { ":feed": "FEED#POSTS" },
    ScanIndexForward: false, Limit: Math.min(200, Math.max(1, Number(limit) || 80)),
  }));
  const posts = (raw.Items || []).map(clean);
  const relations = await getUserRelations(viewerId);
  const blocked = new Set([...(relations.blockedUsers || []), ...(relations.blockedByUsers || [])].map(String));
  const close = new Set((relations.closeOnes || []).map(String));
  const users = await getUsersByIds(posts.map((post) => post.userId));
  const usersById = new Map(users.map((u) => [String(u._id), u]));
  return posts.filter((post) => {
    const owner = usersById.get(String(post.userId));
    if (!owner || owner.accountStatus !== "active" || blocked.has(String(post.userId))) return false;
    if (post.closeOnesOnly && !close.has(String(post.userId)) && String(post.userId) !== String(viewerId)) return false;
    if (owner.ishidden && String(post.userId) !== String(viewerId) && !(relations.supporting || []).map(String).includes(String(post.userId))) return false;
    return true;
  });
}

export function filterVisibleClips(clips, viewerId, relations) {
  const close = new Set((relations.closeOnes || []).map(String));
  const blocked = new Set([...(relations.blockedUsers || []), ...(relations.blockedByUsers || [])].map(String));
  return clips.filter((clip) => {
    if (String(clip.userId) === String(viewerId)) return true;
    if (blocked.has(String(clip.userId))) return false;
    if (clip.closeOnesOnly && !close.has(String(clip.userId))) return false;
    if (clip.user?.ishidden && !(relations.supporting || []).map(String).includes(String(clip.userId))) return false;
    return true;
  });
}
