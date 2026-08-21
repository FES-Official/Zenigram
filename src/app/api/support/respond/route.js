import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import {
  createNotification,
  getUserById,
  toggleSupport,
  updateNotification,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const body = await req.json();
    const notificationId = body?.notificationId;
    const action = body?.action === "approved" ? "accept" : body?.action;
    if (!notificationId || typeof notificationId !== "string") {
      return jsonError("Invalid notification", 400);
    }
    if (!["accept", "reject"].includes(action)) {
      return jsonError("Action must be accept or reject", 400);
    }

    const status = action === "accept" ? "approved" : "rejected";
    const notification = await updateNotification(
      session.user.id,
      notificationId,
      { status, read: true },
    );
    if (!notification || notification.type !== "support_request") {
      return jsonError("Request not found or already processed", 409);
    }

    const [currentUser, senderUser] = await Promise.all([
      getUserById(session.user.id),
      getUserById(notification.sender),
    ]);
    if (!currentUser || !senderUser) {
      return jsonError("Request user no longer exists", 404);
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
