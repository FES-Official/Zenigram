/**
 * Remove credential material before a user record crosses an API boundary.
 * Keep the original record untouched because persistence/auth flows may reuse it.
 */
export function sanitizeUserRecord(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  const safeUser = { ...user };
  delete safeUser.password;
  return safeUser;
}

const PUBLIC_USER_FIELDS = new Set([
  "_id",
  "id",
  "entityType",
  "fullname",
  "name",
  "username",
  "bio",
  "website",
  "profilePic",
  "ishidden",
  "accountStatus",
  "progression",
  "postCount",
  "supportersCount",
  "supportingCount",
  "createdAt",
  "updatedAt",
  "isVerified",
  "verified",
  "badges",
  "userType",
]);

/**
 * Build a deliberately small user representation for posts, clips, comments,
 * notifications, and conversations. Private account fields are excluded by
 * default rather than depending on every API caller to remember a blacklist.
 */
export function sanitizePublicUserRecord(user) {
  if (!user || typeof user !== "object" || Array.isArray(user)) return null;
  return Object.fromEntries(
    Object.entries(user).filter(([key]) => PUBLIC_USER_FIELDS.has(key)),
  );
}
