import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { jsonError } from "@/app/lib/api";
import { NextResponse } from "next/server";
import {
  listNotifications,
  markNotificationsRead,
} from "@/app/lib/socialStore";

export async function GET(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);

    const notifications = await listNotifications(userId, 100);

    return NextResponse.json(
      notifications.map((notification) => ({
        _id: notification._id,
        type: notification.type,
        username: notification.senderUser?.username || "Deleted user",
        profilePic: notification.senderUser?.profilePic || "",
        status: notification.status,
        read: notification.read,
        event: notification.event,
        createdAt: notification.createdAt,
      })),
    );
  } catch (error) {
    console.error("Notifications error:", error);
    return jsonError("Failed to load notifications", 500);
  }
}

export async function PATCH(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);

    await markNotificationsRead(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications read error:", error);
    return jsonError("Failed to mark notifications as read", 500);
  }
}
