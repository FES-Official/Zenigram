import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { createNotification, getPost, getUserById, getUserRelations } from "@/app/lib/socialStore";
import { canViewContent } from "@/app/lib/audienceStore";
import { togglePostLikeAtomic } from "@/app/lib/postEngagement";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { postId } = await req.json();
    if (!postId || typeof postId !== "string") return jsonError("Invalid post", 400);

    const [user, post, relations] = await Promise.all([
      getUserById(session.user.id),
      getPost(postId),
      getUserRelations(session.user.id),
    ]);
    if (!user) return jsonError("User not found", 404);
    if (!post) return jsonError("Post not found", 404);
    const owner = await getUserById(post.userId);
    if (!owner || owner.accountStatus !== "active") return jsonError("Post not found", 404);
    if (!(await canViewContent(post, user._id, owner, relations))) return jsonError("Post not found", 404);

    const result = await togglePostLikeAtomic(postId, user._id);
    if (!result?.post) return jsonError("Post not found", 404);
    if (result.liked && result.post.userId !== user._id) {
      await createNotification({ recipient: result.post.userId, sender: user._id, type: "like", post: postId });
      emitToUsers([result.post.userId], "notification:new", { type: "like" });
    }
    return jsonOk({ liked: result.liked, likesCount: result.likesCount, username: user.username });
  } catch (error) {
    console.error("Like error:", error);
    return jsonError("Failed to update like", 500);
  }
}
