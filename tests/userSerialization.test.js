import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeUserRecord } from "../src/app/lib/userSerialization.js";

test("removes password hashes from returned user records", () => {
  const input = { _id: "user-1", username: "zen", password: "$2b$hash", email: "zen@example.test" };
  const output = sanitizeUserRecord(input);

  assert.deepEqual(output, { _id: "user-1", username: "zen", email: "zen@example.test" });
  assert.equal("password" in output, false);
  assert.equal(input.password, "$2b$hash", "the original record should not be mutated");
});

test("returns null for missing or invalid user values", () => {
  assert.equal(sanitizeUserRecord(null), null);
  assert.equal(sanitizeUserRecord(undefined), null);
  assert.equal(sanitizeUserRecord([]), null);
});

test("preserves safe fields without coercing values", () => {
  const input = { username: "Zenigram", ishidden: true, progression: { level: 2 }, password: "secret" };
  const output = sanitizeUserRecord(input);

  assert.equal(output.username, "Zenigram");
  assert.equal(output.ishidden, true);
  assert.deepEqual(output.progression, { level: 2 });
});
