import { getUserRelations } from "@/app/lib/socialStore";
import { listStories } from "@/app/lib/storyStore";

const MAX_SOURCE_STORIES = 500;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function clampLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(parsed)));
}

function decodeCursor(value) {
  if (!value) return 0;
  try {
    const decoded = Number(Buffer.from(String(value), "base64url").toString("utf8"));
    return Number.isInteger(decoded) && decoded >= 0 && decoded <= MAX_SOURCE_STORIES ? decoded : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function engagementScore(story) {
  const views = Math.max(0, Number(story.viewsCount || 0));
  const likes = Math.max(0, Number(story.likesCount || 0));
  const comments = Math.max(0, Number(story.commentsCount || 0));
  const ageHours = Math.max(0, (Date.now() - new Date(story.createdAt).getTime()) / 3600000);
  const engagement = views * 0.35 + likes * 0.3 + comments * 0.2;
  return engagement / Math.pow(ageHours + 2, 1.25);
}

export async function listStoryGlobeFeed({ viewerId = null, tab = "all", limit = DEFAULT_LIMIT, cursor = null } = {}) {
  const safeLimit = clampLimit(limit);
  const offset = decodeCursor(cursor);
  const stories = await listStories(viewerId);
  const relations = viewerId
    ? await getUserRelations(viewerId)
    : { supporting: [], closeOnes: [], blockedUsers: [], blockedByUsers: [] };
  const viewer = String(viewerId || "");
  const supporting = new Set((relations.supporting || []).map(String));
  const closeOnes = new Set((relations.closeOnes || []).map(String));
  const blocked = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ].map(String));

  const eligible = stories.filter((story) => {
    const ownerId = String(story.userId?._id || "");
    if (!ownerId || blocked.has(ownerId)) return false;
    if (ownerId === viewer) return true;
    if (story.userId?.accountStatus && story.userId.accountStatus !== "active") return false;
    if (story.userId?.ishidden && !supporting.has(ownerId)) return false;
    return true;
  });

  let filtered = eligible;
  if (tab === "close") filtered = eligible.filter((story) => closeOnes.has(String(story.userId?._id)));
  if (tab === "supporting") filtered = eligible.filter((story) => supporting.has(String(story.userId?._id)));
  if (tab === "trending") filtered = [...eligible].sort((a, b) => engagementScore(b) - engagementScore(a));
  if (tab !== "trending") filtered = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const items = filtered.slice(offset, offset + safeLimit);
  const nextOffset = offset + items.length;
  return {
    stories: items,
    nextCursor: nextOffset < filtered.length ? encodeCursor(nextOffset) : null,
    tab: ["all", "trending", "close", "supporting"].includes(tab) ? tab : "all",
    hasMore: nextOffset < filtered.length,
  };
}
