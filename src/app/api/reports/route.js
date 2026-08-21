import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isValidObjectId, jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { createReport } from "@/app/lib/storyStore";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const body = await req.json();
    const reason = normalizeString(body.reason);
    const category = normalizeString(body.category) || "other";
    if (!reason || reason.length > 300) return jsonError("Enter a report reason up to 300 characters", 400);
    const targets = [body.targetUserId, body.postId, body.messageId].filter(Boolean);
    if (!targets.length || targets.some((value) => !isValidObjectId(value))) return jsonError("Invalid report target", 400);
    const reportId = await createReport({
      reporter: session.user.id,
      targetUser: body.targetUserId || null,
      post: body.postId || null,
      message: body.messageId || null,
      category,
      reason,
    });
    return jsonOk({ reportId }, 201);
  } catch (error) {
    console.error("Report create error:", error);
    return jsonError("Failed to submit report", 500);
  }
}
