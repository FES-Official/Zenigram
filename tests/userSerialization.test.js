import test from "node:test";
import assert from "node:assert/strict";
import { sanitizePublicUserRecord, sanitizeUserRecord } from "../src/app/lib/userSerialization.js";

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

test("public user objects omit contact details and account internals", () => {
  const input = {
    _id: "user-2",
    username: "public-user",
    fullname: "Public User",
    profilePic: "https://cdn.example.test/avatar.jpg",
    email: "private@example.test",
    mobile: "+91 9999999999",
    DOB: "2000-01-01",
    gender: "private",
    authProvider: "credentials",
    lastLogin: "2026-10-27T00:00:00.000Z",
    feedPreferences: { mode: "latest" },
    password: "$2b$private-hash",
  };

  const output = sanitizePublicUserRecord(input);
  assert.deepEqual(output, {
    _id: "user-2",
    username: "public-user",
    fullname: "Public User",
    profilePic: "https://cdn.example.test/avatar.jpg",
  });
  assert.equal(input.email, "private@example.test", "the source record should not be mutated");
});
