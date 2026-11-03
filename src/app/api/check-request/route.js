import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { hasPendingSupportRequest } from "@/app/lib/socialStore";

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const { targetUserId } = await req.json();
    if (!isValidObjectId(targetUserId)) return jsonError("Invalid user", 400);
    return jsonOk({ requested: await hasPendingSupportRequest(userId, targetUserId) });
  } catch (error) {
    console.error("Check request error:", error);
    return jsonError("Failed to check request", 500);
  }
}
