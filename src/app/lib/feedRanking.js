const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

export const FEED_TOPICS = [
  { id: "technology", label: "Technology", keywords: ["technology", "tech", "coding", "code", "javascript", "react", "next.js", "python", "programming", "software", "developer", "aws", "computer", "artificial intelligence", "machine learning", "web development", "app development", "api", "html", "css"] },
  { id: "education", label: "Education", keywords: ["education", "study", "studying", "learn", "learning", "tutorial", "course", "lesson", "college", "school", "exam", "knowledge", "book"] },
  { id: "gaming", label: "Gaming", keywords: ["gaming", "gamer", "gameplay", "minecraft", "pubg", "bgmi", "valorant", "roblox", "playstation", "xbox", "steam game", "video game"] },
  { id: "travel", label: "Travel", keywords: ["travel", "travelling", "trip", "vacation", "holiday", "destination", "tourism", "mountain", "beach", "hiking", "backpacking"] },
  { id: "sports", label: "Sports", keywords: ["sports", "football", "cricket", "basketball", "soccer", "tennis", "badminton", "formula 1", "f1", "athlete", "match", "championship"] },
  { id: "art", label: "Art & Design", keywords: ["art", "drawing", "painting", "photography", "sketch", "illustration", "graphic design", "design", "creative", "digital art"] },
  { id: "food", label: "Food", keywords: ["food", "recipe", "cooking", "restaurant", "cuisine", "coffee", "bakery", "dinner", "lunch", "breakfast", "dessert"] },
  { id: "fashion", label: "Fashion & Beauty", keywords: ["fashion", "outfit", "style", "makeup", "beauty", "skincare", "clothes", "clothing", "streetwear"] },
  { id: "news", label: "News & Current Affairs", keywords: ["news", "politics", "current affairs", "breaking news", "election", "government", "world news", "journalism"] },
  { id: "entertainment", label: "Entertainment", keywords: ["entertainment", "movie", "film", "music", "song", "celebrity", "meme", "comedy", "funny", "dance", "drama", "anime", "tv show", "television"] },
  { id: "fitness", label: "Fitness & Wellness", keywords: ["fitness", "workout", "gym", "running", "yoga", "exercise", "training", "marathon", "meditation"] },
];

export const FEED_MODES = [
  { id: "balanced", label: "Balanced", description: "A mix of your settings, freshness, and discovery." },
  { id: "circle", label: "Your circle", description: "Prioritize people you support and mutual connections." },
  { id: "latest", label: "Latest", description: "Show visible posts newest first." },
  { id: "interests", label: "My interests", description: "Give your selected topics the strongest influence." },
  { id: "discover", label: "Discover", description: "Give newer-to-you creators more room in the feed." },
];

export const FEED_SOURCE_CONTROLS = [
  { id: "circle", label: "People in my circle", description: "Creators you support or share a mutual connection with." },
  { id: "interests", label: "My selected topics", description: "How strongly chosen interests influence ranking." },
  { id: "discovery", label: "New creators", description: "Content from people outside your circle." },
  { id: "freshness", label: "Fresh posts", description: "Give newer posts a stronger advantage." },
  { id: "trending", label: "Popular posts", description: "Use likes, comments, and shares as a secondary signal." },
];

export const DEFAULT_FEED_PREFERENCES = {
  version: 1,
  mode: "balanced",
  topicWeights: Object.fromEntries(FEED_TOPICS.map((topic) => [topic.id, 50])),
  sourceWeights: { circle: 60, interests: 70, discovery: 40, freshness: 65, trending: 30 },
  mutedTopics: [],
  mutedCreators: [],
  creatorWeights: {},
};

const TOPIC_IDS = new Set(FEED_TOPICS.map((topic) => topic.id));
const MODE_IDS = new Set(FEED_MODES.map((mode) => mode.id));
const TOPIC_ALIASES = {
  tech: "technology", programming: "technology", coding: "technology", developer: "technology",
  learning: "education", study: "education", games: "gaming", design: "art", photography: "art",
  beauty: "fashion", movies: "entertainment", music: "entertainment",
  current_affairs: "news", wellness: "fitness",
};

export function normalizeTopicId(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^#/, "").replace(/[\s&/-]+/g, "_");
  const compact = normalized.replace(/_/g, "");
  const candidate = TOPIC_ALIASES[normalized] || TOPIC_ALIASES[compact] || normalized;
  if (TOPIC_IDS.has(candidate)) return candidate;
  if (TOPIC_IDS.has(compact)) return compact;
  return null;
}

export function normalizeFeedPreferences(raw = {}) {
  const value = raw && typeof raw === "object" ? raw : {};
  const sourceWeights = value.sourceWeights && typeof value.sourceWeights === "object" ? value.sourceWeights : {};
  const topicWeights = value.topicWeights && typeof value.topicWeights === "object" ? value.topicWeights : {};
  const creatorWeights = value.creatorWeights && typeof value.creatorWeights === "object" ? value.creatorWeights : {};
  const nextCreatorWeights = {};

  Object.entries(creatorWeights).slice(0, 300).forEach(([creatorId, weight]) => {
    const id = String(creatorId || "").trim();
    if (id && id.length <= 128) nextCreatorWeights[id] = clamp(weight, -100, 100);
  });

  return {
    version: 1,
    mode: MODE_IDS.has(value.mode) ? value.mode : DEFAULT_FEED_PREFERENCES.mode,
    topicWeights: Object.fromEntries(FEED_TOPICS.map((topic) => [
      topic.id,
      clamp(topicWeights[topic.id] ?? DEFAULT_FEED_PREFERENCES.topicWeights[topic.id]),
    ])),
    sourceWeights: Object.fromEntries(FEED_SOURCE_CONTROLS.map((source) => [
      source.id,
      clamp(sourceWeights[source.id] ?? DEFAULT_FEED_PREFERENCES.sourceWeights[source.id]),
    ])),
    mutedTopics: [...new Set((Array.isArray(value.mutedTopics) ? value.mutedTopics : []).map(normalizeTopicId).filter(Boolean))].slice(0, FEED_TOPICS.length),
    mutedCreators: [...new Set((Array.isArray(value.mutedCreators) ? value.mutedCreators : []).map((id) => String(id || "").trim()).filter((id) => id && id.length <= 128))].slice(0, 200),
    creatorWeights: nextCreatorWeights,
  };
}

export function inferPostTopics(post = {}) {
  const topics = new Set();
  const explicit = [
    ...(Array.isArray(post.topics) ? post.topics : post.topics ? [post.topics] : []),
    ...(Array.isArray(post.categories) ? post.categories : post.categories ? [post.categories] : []),
  ];
  explicit.forEach((value) => {
    const topic = normalizeTopicId(value);
    if (topic) topics.add(topic);
  });

  const text = String(post.caption || "").toLowerCase();
  const hashtags = text.match(/#([a-z0-9_]+)/g) || [];
  hashtags.forEach((tag) => {
    const topic = normalizeTopicId(tag);
    if (topic) topics.add(topic);
  });

  const normalizedText = " " + text.replace(/[^a-z0-9]+/g, " ") + " ";
  FEED_TOPICS.forEach((topic) => {
    const matches = topic.keywords.some((keyword) => {
      const normalizedKeyword = " " + keyword.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + " ";
      return normalizedText.includes(normalizedKeyword);
    });
    if (matches) topics.add(topic.id);
  });

  return [...topics];
}

function timestamp(post) {
  const parsed = Date.parse(post?.createdAt || post?.updatedAt || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeCount(value) {
  return Math.max(0, Number(value) || 0);
}

function getCreatorId(post) {
  return String(post?.userId || post?.user?._id || post?.user?.id || "");
}

function getSourceFactors(mode) {
  const factors = { circle: 1, interests: 1, discovery: 1, freshness: 1, trending: 1 };
  if (mode === "circle") {
    factors.circle = 2.8; factors.interests = 0.7; factors.discovery = 0.25; factors.trending = 0.4;
  } else if (mode === "interests") {
    factors.circle = 0.6; factors.interests = 3; factors.discovery = 0.5; factors.trending = 0.5;
  } else if (mode === "discover") {
    factors.circle = 0.25; factors.interests = 0.8; factors.discovery = 3; factors.trending = 0.8;
  }
  return factors;
}

function buildScore(post, preferences, relations, topics, now) {
  const creatorId = getCreatorId(post);
  const circleIds = new Set([
    ...(relations?.supporting || []).map(String),
    ...(relations?.closeOnes || []).map(String),
  ]);
  const isOwnPost = Boolean(creatorId) && creatorId === String(relations?.viewerId || "");
  const isCircle = isOwnPost || circleIds.has(creatorId);
  const topicValues = topics.map((topic) => preferences.topicWeights[topic] ?? 50);
  const interestScore = topicValues.length ? topicValues.reduce((sum, value) => sum + value, 0) / topicValues.length : 50;
  const hoursOld = Math.max(0, (now - timestamp(post)) / (1000 * 60 * 60));
  const freshnessScore = 100 / (1 + hoursOld / 24);
  const engagement = (
    Math.log1p(safeCount(post.likesCount ?? post.likes?.length)) * 8 +
    Math.log1p(safeCount(post.commentsCount ?? post.comments?.length)) * 10 +
    Math.log1p(safeCount(post.shareCount)) * 12
  );
  const trendingScore = clamp(engagement);
  const circleScore = isCircle ? 100 : 15;
  const discoveryScore = isCircle ? 20 : 90;
  const sourceWeights = preferences.sourceWeights;
  const factors = getSourceFactors(preferences.mode);
  const weightedValues = [
    [circleScore, sourceWeights.circle * factors.circle],
    [interestScore, sourceWeights.interests * factors.interests],
    [discoveryScore, sourceWeights.discovery * factors.discovery],
    [freshnessScore, sourceWeights.freshness * factors.freshness],
    [trendingScore, sourceWeights.trending * factors.trending],
  ];
  const totalWeight = weightedValues.reduce((sum, entry) => sum + entry[1], 0);
  const baseScore = totalWeight
    ? weightedValues.reduce((sum, entry) => sum + entry[0] * entry[1], 0) / totalWeight
    : freshnessScore;
  const creatorBias = clamp(preferences.creatorWeights[creatorId] ?? 0, -100, 100) * 0.25;
  return { score: baseScore + creatorBias, isCircle, interestScore, freshnessScore, trendingScore, hoursOld };
}

function buildReasons(preferences, topics, score) {
  const reasons = [];
  const topicLabels = topics
    .filter((topic) => preferences.topicWeights[topic] >= 65)
    .map((topic) => FEED_TOPICS.find((item) => item.id === topic)?.label)
    .filter(Boolean);

  if (preferences.mode === "latest") reasons.push("Your feed is set to newest first");
  else if (preferences.mode === "circle" && score.isCircle) reasons.push("Your circle is prioritized");
  else if (preferences.mode === "discover" && !score.isCircle) reasons.push("Discovery mode gives new creators more room");
  if (topicLabels.length) reasons.push("Matches your interests: " + topicLabels.slice(0, 2).join(", "));
  if (score.isCircle && preferences.mode !== "circle") reasons.push("From a creator in your circle");
  if (score.freshnessScore >= 70 && preferences.mode !== "latest") reasons.push("Recently posted");
  if (score.trendingScore >= 55 && preferences.sourceWeights.trending > 0) reasons.push("Getting strong engagement");
  return reasons.slice(0, 3);
}

export function rankFeedPosts(posts, rawPreferences = {}, relations = {}, now = Date.now()) {
  const preferences = normalizeFeedPreferences(rawPreferences);
  const mutedCreators = new Set(preferences.mutedCreators.map(String));
  const mutedTopics = new Set(preferences.mutedTopics);

  const enriched = (Array.isArray(posts) ? posts : [])
    .map((post, index) => {
      const topics = inferPostTopics(post);
      const score = buildScore(post, preferences, relations, topics, now);
      return {
        ...post,
        feedTopics: topics,
        feedScore: score.score,
        feedReasons: buildReasons(preferences, topics, score),
        _feedIndex: index,
        _feedTimestamp: timestamp(post),
        _feedIsCircle: score.isCircle,
      };
    })
    .filter((post) => {
      if (mutedCreators.has(getCreatorId(post))) return false;
      if (post.feedTopics.some((topic) => mutedTopics.has(topic))) return false;
      return true;
    });

  enriched.sort((left, right) => {
    if (preferences.mode === "latest") return right._feedTimestamp - left._feedTimestamp || left._feedIndex - right._feedIndex;
    if (preferences.mode === "circle" && left._feedIsCircle !== right._feedIsCircle) return left._feedIsCircle ? -1 : 1;
    if (preferences.mode === "discover" && left._feedIsCircle !== right._feedIsCircle) return left._feedIsCircle ? 1 : -1;
    return right.feedScore - left.feedScore || right._feedTimestamp - left._feedTimestamp || left._feedIndex - right._feedIndex;
  });

  return enriched.map(({ _feedIndex, _feedTimestamp, _feedIsCircle, ...post }) => post);
}

export function applyFeedFeedback(rawPreferences = {}, input = {}) {
  const preferences = normalizeFeedPreferences(rawPreferences);
  const action = String(input.action || "");
  const topic = normalizeTopicId(input.topic);
  const creatorId = String(input.creatorId || "").trim();

  if (["moreTopic", "lessTopic", "muteTopic", "unmuteTopic"].includes(action)) {
    if (!topic) throw new Error("Choose a recognized topic for this action.");
    if (action === "moreTopic") {
      preferences.topicWeights[topic] = clamp(preferences.topicWeights[topic] + 20);
      preferences.mutedTopics = preferences.mutedTopics.filter((item) => item !== topic);
    } else if (action === "lessTopic") {
      preferences.topicWeights[topic] = clamp(preferences.topicWeights[topic] - 20);
    } else if (action === "muteTopic") {
      preferences.mutedTopics = [...new Set([...preferences.mutedTopics, topic])];
    } else {
      preferences.mutedTopics = preferences.mutedTopics.filter((item) => item !== topic);
    }
    return normalizeFeedPreferences(preferences);
  }

  if (["moreCreator", "lessCreator", "muteCreator", "unmuteCreator"].includes(action)) {
    if (!creatorId || creatorId.length > 128) throw new Error("A valid creator is required.");
    if (action === "moreCreator" || action === "lessCreator") {
      const change = action === "moreCreator" ? 25 : -25;
      preferences.creatorWeights[creatorId] = clamp((preferences.creatorWeights[creatorId] || 0) + change, -100, 100);
    } else if (action === "muteCreator") {
      preferences.mutedCreators = [...new Set([...preferences.mutedCreators, creatorId])];
    } else {
      preferences.mutedCreators = preferences.mutedCreators.filter((id) => id !== creatorId);
    }
    return normalizeFeedPreferences(preferences);
  }

  if (action === "clearMutedCreators") {
    preferences.mutedCreators = [];
    return normalizeFeedPreferences(preferences);
  }

  throw new Error("Unsupported feed action.");
}
