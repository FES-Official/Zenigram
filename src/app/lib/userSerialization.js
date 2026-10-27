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
