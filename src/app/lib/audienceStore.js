import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getUserRelations, listFeedPosts } from "@/app/lib/socialStore";

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
  await client().send(new UpdateCommand({ TableName: table(), Key: key, UpdateExpression: "SET closeOnesOnly = :close, updatedAt = :now", ExpressionAttributeValues: { ":close": next, ":now": new Date().toISOString() } }));
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
  const [posts, relations] = await Promise.all([listFeedPosts(viewerId, limit), getUserRelations(viewerId)]);
  const close = new Set((relations.closeOnes || []).map(String));
  return posts.filter((post) => String(post.userId) === String(viewerId) || !post.closeOnesOnly || close.has(String(post.userId)));
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
