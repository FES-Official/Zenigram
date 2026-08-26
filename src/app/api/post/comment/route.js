import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  jsonError,
  jsonOk,
  normalizeString,
} from "@/app/lib/api";
import {
  addComment,
  createNotification,
  getPostForViewer,
  getUserById,
  listComments,
  togglePostCommentLike,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const body = await req.json();
    const postId = normalizeString(body.post);
    const text = normalizeString(body.text);
    if (!postId) return jsonError("Invalid post", 400);
    if (!text || text.length > 500) {
      return jsonError("Enter a comment up to 500 characters", 400);
    }

    const user = await getUserById(session.user.id);
    if (!user || user.accountStatus !== "active") return jsonError("User not found", 404);

    const post = await getPostForViewer(postId, user._id);
    if (!post) return jsonError("Post is unavailable", 404);

    const parentId = normalizeString(body.parentId) || null;
    if (parentId) {
      const comments = await listComments(postId, user._id);
      const parentExists = comments.some((comment) => String(comment._id) === parentId);
      if (!parentExists) return jsonError("Parent comment not found", 404);
    }

    const result = await addComment(postId, user._id, text, parentId);
    if (!result) return jsonError("Post not found", 404);
    if (result.post.userId !== user._id) {
      await createNotification({
        recipient: result.post.userId,
        sender: user._id,
        type: "comment",
        post: postId,
      });
      emitToUsers([result.post.userId], "notification:new", { type: "comment" });
    }
    return jsonOk(
      { message: "Comment added", comment: { ...result.comment, user } },
      201,
    );
  } catch (error) {
    console.error("Comment error:", error);
    return jsonError("Failed to add comment", 500);
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const postId = normalizeString(searchParams.get("post"));
    if (!postId) {
      return jsonError("Invalid post", 400, { comments: [] });
    }

    const session = await getServerSession(authOptions);
    const viewerId = session?.user?.id || "";
    if (viewerId && !(await getPostForViewer(postId, viewerId))) {
      return jsonError("Post is unavailable", 404, { comments: [] });
    }

    const comments = await listComments(postId, viewerId);
    return jsonOk({ comments });
  } catch (error) {
    console.error("Fetch comments error:", error);
    return jsonError("Failed to fetch comments", 500, { comments: [] });
  }
}

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const body = await req.json();
    const postId = normalizeString(body.post);
    const commentId = normalizeString(body.commentId);
    if (!postId || !commentId || body.action !== "like") return jsonError("Invalid comment action", 400);

    if (!(await getPostForViewer(postId, session.user.id))) {
      return jsonError("Post is unavailable", 404);
    }

    const comment = await togglePostCommentLike(postId, commentId, session.user.id);
    if (!comment) return jsonError("Comment not found", 404);
    return jsonOk({ comment });
  } catch (error) {
    console.error("Comment like error:", error);
    return jsonError("Unable to update comment", 500);
  }
}
