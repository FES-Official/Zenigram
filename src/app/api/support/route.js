import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import {
  createNotification,
  getUserById,
  toggleSupport,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { targetUserId } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") return jsonError("Invalid user", 400);
    if (targetUserId === session.user.id) {
      return jsonError("You cannot support yourself", 400);
    }

    const [currentUser, targetUser] = await Promise.all([
      getUserById(session.user.id),
      getUserById(targetUserId),
    ]);
    if (!currentUser || !targetUser) return jsonError("User not found", 404);

    if (targetUser.ishidden) {
      await createNotification({
        sender: currentUser._id,
        recipient: targetUser._id,
        type: "support_request",
        status: "pending",
      });
      emitToUsers([targetUser._id], "notification:new", {
        type: "support_request",
      });
      return jsonOk({ requested: true });
    }

    const result = await toggleSupport(currentUser._id, targetUser._id);
    if (result.supported) {
      await createNotification({
        recipient: targetUser._id,
        sender: currentUser._id,
        type: "support",
      });
      emitToUsers([targetUser._id], "notification:new", { type: "support" });
    }
    return jsonOk(result);
  } catch (error) {
    console.error("Support error:", error);
    return jsonError("Failed to update support", 500);
  }
}
