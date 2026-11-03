import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { getBearerMobileUserId } from "@/app/lib/mobileAuth";

/**
 * Authenticate API requests from either the existing web app (NextAuth cookie)
 * or the native app (short-lived Authorization: Bearer token).
 *
 * An explicitly supplied but invalid Authorization header must never fall
 * back to a browser cookie, otherwise callers could accidentally mix identities.
 */
export async function getAuthenticatedUserId(request) {
  const authorization = request?.headers?.get("authorization");
  if (authorization) {
    return getBearerMobileUserId(request);
  }

  const session = await getServerSession(authOptions);
  return session?.user?.id ? String(session.user.id) : null;
}
