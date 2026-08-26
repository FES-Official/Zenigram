import { listStories } from "@/app/lib/storyStore";
import { getUserRelations } from "@/app/lib/socialStore";

const TABS = new Set(["all", "trending", "close", "supporting"]);

function scoreStory(story) {
  const ageHours = Math.max(0.25, (Date.now() - new Date(story.createdAt).getTime()) / 3600000);
  const views = Number(story.viewsCount || 0);
  const likes = Number(story.likesCount || 0);
  const comments = Number(story.commentsCount || 0);
  const velocity = (views + likes * 3 + comments * 4) / Math.pow(ageHours + 2, 1.25);
  return velocity + Number(story.realityScore || 0) * 0.02;
}

function decodeCursor(cursor) {
  if (!cursor) return 0;
  const parsed = Number.parseInt(Buffer.from(String(cursor), "base64url").toString("utf8"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
function encodeCursor(value) { return Buffer.from(String(value), "utf8").toString("base64url"); }

export async function listStoryGlobe(viewerId, tab = "all", limit = 80, cursor = "") {
  const selectedTab = TABS.has(tab) ? tab : "all";
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 80));
  if (!viewerId && selectedTab !== "all" && selectedTab !== "trending") {
    return { tab: selectedTab, stories: [], nextCursor: null, hasMore: false, totalLoaded: 0 };
  }

  const source = await listStories(viewerId);
  let stories = source;
  if (selectedTab === "close") {
    stories = stories.filter((story) => story.closeOne);
  } else if (selectedTab === "supporting") {
    const relations = await getUserRelations(viewerId);
    const supporting = new Set((relations.supporting || []).map(String));
    stories = stories.filter((story) => supporting.has(String(story.userId?._id)));
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
