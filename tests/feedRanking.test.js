import test from "node:test";
import assert from "node:assert/strict";
import {
  applyFeedFeedback,
  normalizeFeedPreferences,
  normalizeTopicId,
  rankFeedPosts,
} from "../src/app/lib/feedRanking.js";

test("normalizes topic aliases and rejects unknown topics", () => {
  assert.equal(normalizeTopicId("#Tech"), "technology");
  assert.equal(normalizeTopicId("current affairs"), "news");
  assert.equal(normalizeTopicId("not-a-topic"), null);
});

test("feed preference normalization clamps weights and bounds creator entries", () => {
  const preferences = normalizeFeedPreferences({
    mode: "invalid-mode",
    topicWeights: { technology: 150, gaming: -20 },
    sourceWeights: { freshness: 200 },
    creatorWeights: { "creator-1": 500 },
    mutedTopics: ["TECH", "unknown"],
  });

  assert.equal(preferences.mode, "balanced");
  assert.equal(preferences.topicWeights.technology, 100);
  assert.equal(preferences.topicWeights.gaming, 0);
  assert.equal(preferences.sourceWeights.freshness, 100);
  assert.equal(preferences.creatorWeights["creator-1"], 100);
  assert.deepEqual(preferences.mutedTopics, ["technology"]);
});

test("feed feedback is immutable and mutes/unmutes topics", () => {
  const input = normalizeFeedPreferences();
  const muted = applyFeedFeedback(input, { action: "muteTopic", topic: "gaming" });
  const unmuted = applyFeedFeedback(muted, { action: "unmuteTopic", topic: "gaming" });

  assert.deepEqual(input.mutedTopics, []);
  assert.deepEqual(muted.mutedTopics, ["gaming"]);
  assert.deepEqual(unmuted.mutedTopics, []);
});

test("latest mode orders by creation time and filters muted creators/topics", () => {
  const posts = [
    { _id: "old", userId: "creator-a", createdAt: "2026-10-01T00:00:00.000Z", caption: "coding tutorial" },
    { _id: "new", userId: "creator-b", createdAt: "2026-10-02T00:00:00.000Z", caption: "travel photo" },
    { _id: "muted", userId: "creator-c", createdAt: "2026-10-03T00:00:00.000Z", caption: "gaming" },
  ];
  const preferences = normalizeFeedPreferences({
    mode: "latest",
    mutedTopics: ["gaming"],
    mutedCreators: ["creator-b"],
  });
  const result = rankFeedPosts(posts, preferences, {}, Date.parse("2026-10-03T00:00:00.000Z"));

  assert.deepEqual(result.map((post) => post._id), ["old"]);
});
