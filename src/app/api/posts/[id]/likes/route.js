import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import {
  getPost,
  getUserById,
  getUserRelations,
  listPostLikes,
} from "@/app/lib/socialStore";

export async function GET(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { id } = await params;
    const post = await getPost(id);
    if (!post) return jsonError("Post not found", 404);
    const [owner, viewerRelations] = await Promise.all([
      getUserById(post.userId),
      getUserRelations(session.user.id),
    ]);
    if (!owner) return jsonError("Post not found", 404);
    const isOwner = String(post.userId) === String(session.user.id);
    if (owner.ishidden && !isOwner) {
      return jsonError("Likes are private for this hidden account", 403);
    }
    if (
      viewerRelations.blockedUsers.includes(post.userId) ||
      viewerRelations.blockedByUsers.includes(post.userId)
    ) {
      return jsonError("Post not found", 404);
    }
    const users = await listPostLikes(id);
    return jsonOk({
      users: users.map((user) => ({
        _id: user._id,
        username: user.username,
        fullname: user.fullname,
        profilePic: user.profilePic,
        ishidden: Boolean(user.ishidden),
      })),
    });
  } catch (error) {
    console.error("Post likes error:", error);
    return jsonError("Unable to load likes", 500);
  }
}
