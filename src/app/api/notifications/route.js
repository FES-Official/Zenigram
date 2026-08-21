import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError } from "@/app/lib/api";
import { NextResponse } from "next/server";
import {
  listNotifications,
  markNotificationsRead,
} from "@/app/lib/socialStore";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const notifications = await listNotifications(session.user.id, 100);

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

export async function PATCH() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    await markNotificationsRead(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Notifications read error:", error);
    return jsonError("Failed to mark notifications as read", 500);
  }
}
