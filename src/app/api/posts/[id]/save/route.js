import { getUserById, toggleSavedPost } from "@/app/lib/socialStore";
import { getSafePostForViewer } from "@/app/lib/safePostView";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";

function jsonOk(data = {}, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

function isValidObjectId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

export async function POST(request, { params }) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) return jsonError("Unauthorized", 401);

    const { id } = await params;
    if (!isValidObjectId(id)) return jsonError("Invalid post", 400);
    const [post, user] = await Promise.all([
      getSafePostForViewer(id, userId),
      getUserById(userId),
    ]);

    if (!post) return jsonError("Post not found", 404);
    if (!user || user.accountStatus !== "active") return jsonError("User not found", 404);

    const saved = await toggleSavedPost(user._id, post._id);
    return jsonOk({ saved });
  } catch (error) {
    console.error("Save post error:", error);
    return jsonError("Failed to update saved post", 500);
  }
}
