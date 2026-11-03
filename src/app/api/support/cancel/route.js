import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { cancelPendingSupportRequest, getUserById } from "@/app/lib/socialStore";

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const { targetUserId } = await req.json();
    if (!isValidObjectId(targetUserId)) return jsonError("Invalid user", 400);
    if (!(await getUserById(userId))) return jsonError("Current user not found", 404);
    await cancelPendingSupportRequest(userId, targetUserId);
    return jsonOk({ requested: false });
  } catch (error) {
    console.error("Cancel request error:", error);
    return jsonError("Failed to cancel request", 500);
  }
}
