import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { getUserById } from "@/app/lib/socialStore";
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
    const userId = await getBearerMobileUserId(request);
    if (!userId) return null;

    // Re-check account status so a disabled/deleted account cannot keep using
    // an access token issued before the account state changed.
    const user = await getUserById(userId);
    return user?.accountStatus === "active" ? userId : null;
  }

  const session = await getServerSession(authOptions);
  return session?.user?.id ? String(session.user.id) : null;
}
