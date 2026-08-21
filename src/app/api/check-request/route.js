import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/lib/auth";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { hasPendingSupportRequest } from "@/app/lib/socialStore";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { targetUserId } = await req.json();
    if (!isValidObjectId(targetUserId)) return jsonError("Invalid user", 400);
    return jsonOk({ requested: await hasPendingSupportRequest(session.user.id, targetUserId) });
  } catch (error) {
    console.error("Check request error:", error);
    return jsonError("Failed to check request", 500);
  }
}
