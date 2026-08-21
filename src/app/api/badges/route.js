import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  unreadMessageCount,
  unreadNotificationCount,
} from "@/app/lib/socialStore";

function jsonOk(data = {}, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const [notificationsCount, messagesCount] = await Promise.all([
      unreadNotificationCount(session.user.id),
      unreadMessageCount(session.user.id),
    ]);

    return jsonOk({ notificationsCount, messagesCount });
  } catch (error) {
    console.error("Badge count error:", error);
    return jsonError("Failed to load badges", 500);
  }
}
