import { GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";
import { getUserRelations, listFeedPosts } from "@/app/lib/socialStore";

const client = () => getDynamoDocumentClient();
const table = () => getDynamoTableName();

function clean(item) {
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

function contentKey(kind, id) {
  return kind === "post"
    ? { PK: `POST#${id}`, SK: "META" }
    : { PK: `CLIP#${id}`, SK: "META" };
}

function normalizeIds(values = []) {
  return new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean));
}

export async function setContentAudience(kind, contentId, ownerId, closeOnesOnly) {
  if (!["post", "clip"].includes(kind) || !contentId || !ownerId) return null;
  const key = contentKey(kind, contentId);
  const now = new Date().toISOString();
  const next = Boolean(closeOnesOnly);
  const result = await client().send(new UpdateCommand({
    TableName: table(),
    Key: key,
    UpdateExpression: "SET closeOnesOnly = :close, updatedAt = :now",
    ExpressionAttributeValues: {
      ":close": next,
      ":now": now,
      ":owner": String(ownerId),
    },
    ConditionExpression: "attribute_exists(PK) AND userId = :owner",
    ReturnValues: "ALL_NEW",
  }));
  return clean(result.Attributes);
}

export async function canViewContent(content, viewerId, ownerUser = null, relations = null) {
  if (!content || !viewerId) return false;
  if (String(content.userId) === String(viewerId)) return true;
  const rel = relations || await getUserRelations(viewerId);
  const blocked = new Set([
    ...normalizeIds(rel.blockedUsers),
    ...normalizeIds(rel.blockedByUsers),
  ]);
  const ownerId = String(content.userId);
  if (blocked.has(ownerId)) return false;

  const close = normalizeIds(rel.closeOnes);
  if (content.closeOnesOnly && !close.has(ownerId)) return false;

  if (ownerUser?.accountStatus && ownerUser.accountStatus !== "active") return false;
  if (ownerUser?.ishidden && !normalizeIds(rel.supporting).has(ownerId)) return false;
  return true;
}

export async function listVisiblePosts(viewerId, limit = 80) {
  if (!viewerId) return [];
  const [posts, relations] = await Promise.all([
    listFeedPosts(viewerId, limit),
    getUserRelations(viewerId),
  ]);
  const close = normalizeIds(relations.closeOnes);
  const blocked = new Set([
    ...normalizeIds(relations.blockedUsers),
    ...normalizeIds(relations.blockedByUsers),
  ]);
  const supporting = normalizeIds(relations.supporting);
  return posts.filter((post) => {
    const ownerId = String(post.userId || post.user?._id || "");
    if (!ownerId) return false;
    if (ownerId === String(viewerId)) return true;
    if (blocked.has(ownerId)) return false;
    if (post.closeOnesOnly && !close.has(ownerId)) return false;
    if (post.user?.accountStatus && post.user.accountStatus !== "active") return false;
    if (post.user?.ishidden && !supporting.has(ownerId)) return false;
    return true;
  });
}

export function filterVisibleClips(clips, viewerId, relations) {
  if (!viewerId) return [];
  const close = normalizeIds(relations?.closeOnes);
  const blocked = new Set([
    ...normalizeIds(relations?.blockedUsers),
    ...normalizeIds(relations?.blockedByUsers),
  ]);
  const supporting = normalizeIds(relations?.supporting);
  return (Array.isArray(clips) ? clips : []).filter((clip) => {
    const ownerId = String(clip.userId || clip.user?._id || "");
    if (!ownerId) return false;
    if (ownerId === String(viewerId)) return true;
    if (blocked.has(ownerId)) return false;
    if (clip.closeOnesOnly && !close.has(ownerId)) return false;
    if (clip.user?.accountStatus && clip.user.accountStatus !== "active") return false;
    if (clip.user?.ishidden && !supporting.has(ownerId)) return false;
    return true;
  });
}
