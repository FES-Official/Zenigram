import test from "node:test";
import assert from "node:assert/strict";
import {
  achievementIdsForViews,
  isPreviousDay,
  toDayKey,
} from "../src/app/lib/progression.js";

test("achievement thresholds are cumulative and exact", () => {
  assert.deepEqual(achievementIdsForViews(49), []);
  assert.deepEqual(achievementIdsForViews(50), ["explorer"]);
  assert.deepEqual(achievementIdsForViews(100), ["explorer", "world-explorer"]);
  assert.equal(achievementIdsForViews(2500).length, 5);
});

test("day keys use the requested timezone", () => {
  const timestamp = "2026-11-01T20:00:00.000Z";
  assert.equal(toDayKey(timestamp, "Asia/Kolkata"), "2026-11-02");
  assert.equal(toDayKey(timestamp, "UTC"), "2026-11-01");
});

test("previous-day checks handle consecutive days and reject other gaps", () => {
  assert.equal(isPreviousDay("2026-11-01", "2026-11-02"), true);
  assert.equal(isPreviousDay("2026-10-31", "2026-11-02"), false);
  assert.equal(isPreviousDay("2026-11-02", "2026-11-01"), false);
  assert.equal(isPreviousDay("invalid", "2026-11-02"), false);
});
