import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { cancelPendingSupportRequest, getUserById } from "@/app/lib/socialStore";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { targetUserId } = await req.json();
    if (!isValidObjectId(targetUserId)) return jsonError("Invalid user", 400);
    if (!(await getUserById(session.user.id))) return jsonError("Current user not found", 404);
    await cancelPendingSupportRequest(session.user.id, targetUserId);
    return jsonOk({ requested: false });
  } catch (error) {
    console.error("Cancel request error:", error);
    return jsonError("Failed to cancel request", 500);
  }
}
