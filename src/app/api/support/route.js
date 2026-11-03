import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { jsonError, jsonOk } from "@/app/lib/api";
import {
  createNotification,
  getUserById,
  getUserRelations,
  hasPendingSupportRequest,
  toggleSupport,
  getBlockRelationship,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const { targetUserId } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") return jsonError("Invalid user", 400);
    if (targetUserId === userId) {
      return jsonError("You cannot support yourself", 400);
    }

    const [currentUser, targetUser] = await Promise.all([
      getUserById(userId),
      getUserById(targetUserId),
    ]);
    if (!currentUser || !targetUser) return jsonError("User not found", 404);

    const blockRelationship = await getBlockRelationship(currentUser._id, targetUser._id);
    if (blockRelationship.blocked) return jsonError("This relationship is not available", 404);

    const currentRelations = await getUserRelations(currentUser._id);
    const alreadySupporting = (currentRelations.supporting || []).includes(String(targetUser._id));

    if (targetUser.ishidden && !alreadySupporting) {
      const alreadyRequested = await hasPendingSupportRequest(currentUser._id, targetUser._id);
      if (alreadyRequested) return jsonOk({ requested: true, alreadyPending: true });

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
