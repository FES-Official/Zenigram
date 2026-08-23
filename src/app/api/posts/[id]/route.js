import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { deletePost } from "@/app/lib/socialStore";
import { getSafePostForViewer } from "@/app/lib/safePostView";

export async function GET(_req, { params }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    if (!id) return jsonError("Invalid post", 400);

    const post = await getSafePostForViewer(id, session.user.id);
    if (!post) return jsonError("Post not found", 404);

    return jsonOk({ post });
  } catch (error) {
    console.error("Post fetch error:", error);
    return jsonError("Failed to load post", 500);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    if (!id) return jsonError("Invalid post", 400);
    const deleted = await deletePost(id, session.user.id);
    if (!deleted) return jsonError("Post not found or forbidden", 404);

    return jsonOk({ message: "Post deleted" });
  } catch (error) {
    console.error("Delete post error:", error);
    return jsonError("Failed to delete post", 500);
  }
}
