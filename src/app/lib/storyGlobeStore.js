import { listStories } from "@/app/lib/storyStore";
import { getUserRelations } from "@/app/lib/socialStore";

const TABS = new Set(["all", "trending", "close", "supporting"]);
const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 100;
const MAX_SOURCE_STORIES = 500;

function scoreStory(story) {
  const createdAt = new Date(story.createdAt).getTime();
  const ageHours = Number.isFinite(createdAt)
    ? Math.max(0.25, (Date.now() - createdAt) / 3600000)
    : 24;
  const views = Math.max(0, Number(story.viewsCount || 0));
  const likes = Math.max(0, Number(story.likesCount || 0));
  const comments = Math.max(0, Number(story.commentsCount || 0));
  const shares = Math.max(0, Number(story.sharesCount || story.shares || 0));
  const engagement = views + likes * 3 + comments * 4 + shares * 5;
  return engagement / Math.pow(ageHours + 2, 1.25) + Math.max(0, Number(story.realityScore || 0)) * 0.02;
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  try {
    const parsed = Number.parseInt(Buffer.from(String(cursor), "base64url").toString("utf8"), 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_SOURCE_STORIES ? parsed : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

export async function listStoryGlobe(viewerId, tab = "all", limit = DEFAULT_LIMIT, cursor = "") {
  const selectedTab = TABS.has(tab) ? tab : "all";
  const numericLimit = Number(limit);
  const safeLimit = Number.isFinite(numericLimit)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(numericLimit)))
    : DEFAULT_LIMIT;

  const relations = viewerId
    ? await getUserRelations(viewerId)
    : { supporting: [], closeOnes: [], blockedUsers: [], blockedByUsers: [] };
  if (!viewerId && (selectedTab === "close" || selectedTab === "supporting")) {
    return { tab: selectedTab, stories: [], nextCursor: null, hasMore: false, totalLoaded: 0 };
  }

  const source = await listStories(viewerId);
  const supporting = new Set((relations.supporting || []).map(String));
  const closeOnes = new Set((relations.closeOnes || []).map(String));

  let stories = source.filter((story) => Boolean(story.userId?._id));
  if (selectedTab === "close") {
    stories = stories.filter((story) => closeOnes.has(String(story.userId._id)));
  } else if (selectedTab === "supporting") {
    stories = stories.filter((story) => supporting.has(String(story.userId._id)));
  } else if (selectedTab === "trending") {
    stories = [...stories]
      .map((story) => ({ ...story, trendingScore: scoreStory(story) }))
      .sort((a, b) => b.trendingScore - a.trendingScore || new Date(b.createdAt) - new Date(a.createdAt));
  } else {
    stories = [...stories].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const offset = decodeCursor(cursor);
  const page = stories.slice(offset, offset + safeLimit);
  const nextOffset = offset + page.length;
  return {
    tab: selectedTab,
    stories: page,
    nextCursor: nextOffset < stories.length ? encodeCursor(nextOffset) : null,
    hasMore: nextOffset < stories.length,
    totalLoaded: stories.length,
  };
}
