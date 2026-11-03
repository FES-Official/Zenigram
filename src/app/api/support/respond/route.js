import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { jsonError, jsonOk } from "@/app/lib/api";
import {
  createNotification,
  getUserById,
  getBlockRelationship,
  listNotifications,
  toggleSupport,
  updateNotification,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);

    const body = await req.json();
    const notificationId = body?.notificationId;
    const action = body?.action === "approved" ? "accept" : body?.action;
    if (!notificationId || typeof notificationId !== "string") {
      return jsonError("Invalid notification", 400);
    }
    if (!["accept", "reject"].includes(action)) {
      return jsonError("Action must be accept or reject", 400);
    }

    const pendingNotification = (await listNotifications(userId, 250)).find(
      (item) => item._id === notificationId,
    );
    if (
      !pendingNotification ||
      pendingNotification.type !== "support_request" ||
      pendingNotification.status !== "pending"
    ) {
      return jsonError("Request not found or already processed", 409);
    }

    const [currentUser, senderUser] = await Promise.all([
      getUserById(userId),
      getUserById(pendingNotification.sender),
    ]);
    if (!currentUser || !senderUser) {
      return jsonError("Request user no longer exists", 404);
    }

    if (action === "accept") {
      const relationship = await getBlockRelationship(currentUser._id, senderUser._id);
      if (relationship.blocked) return jsonError("This relationship is not available", 404);
    }

    const status = action === "accept" ? "approved" : "rejected";
    const notification = await updateNotification(
      userId,
      notificationId,
      { status, read: true },
    );
    if (!notification || notification.status !== status) {
      return jsonError("Request could not be updated", 409);
    }

    if (action === "accept") {
      await toggleSupport(senderUser._id, currentUser._id);
    }
    await createNotification({
        recipient: senderUser._id,
        sender: currentUser._id,
        type: action === "accept" ? "support_approved" : "support_rejected",
        status,
      });
    emitToUsers([senderUser._id], "notification:new", {
      type: action === "accept" ? "support_approved" : "support_rejected",
    });
    const updated = await getUserById(currentUser._id);
    const supportersCount = updated?.supportersCount || 0;
    return jsonOk({ status, supportersCount });
  } catch (error) {
    console.error("Support response error:", error);
    return jsonError("Failed to process request", 500);
  }
}
