import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  createConversation,
  createMessage,
  getPost,
  getUserById,
  getUserRelations,
  incrementPostShare,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { id } = await params;
    const { recipientId } = await req.json();
    if (!id || !recipientId || recipientId === session.user.id) {
      return jsonError("Choose a valid recipient", 400);
    }

    const [post, sender, recipient] = await Promise.all([
      getPost(id),
      getUserById(session.user.id),
      getUserById(recipientId),
    ]);
    if (!post) return jsonError("Post not found", 404);
    if (!sender || !recipient || recipient.accountStatus !== "active") {
      return jsonError("Recipient not found", 404);
    }
    const [senderRelations, recipientRelations, creator, creatorRelations] =
      await Promise.all([
        getUserRelations(sender._id),
        getUserRelations(recipient._id),
        getUserById(post.userId),
        getUserRelations(post.userId),
      ]);
    const blocked =
      senderRelations.blockedUsers.includes(recipientId) ||
      recipientRelations.blockedUsers.includes(sender._id) ||
      creatorRelations.blockedUsers.includes(recipientId) ||
      recipientRelations.blockedUsers.includes(post.userId);
    const privateWithoutAccess =
      creator?.ishidden &&
      creator._id !== recipientId &&
      !recipientRelations.supporting.includes(creator._id);
    if (blocked || privateWithoutAccess || creator?.accountStatus !== "active") {
      return jsonError("This post cannot be shared with that user", 403);
    }

    const conversation = await createConversation(sender._id, recipient._id);
    const sharedPost = {
      ...post,
      user: {
        _id: creator._id,
        username: creator.username,
        profilePic: creator.profilePic,
      },
    };
    const message = await createMessage({
      conversationId: conversation._id,
      senderId: sender._id,
      sharedPost,
    });
    const updatedPost = await incrementPostShare(post._id);
    emitToUsers(conversation.participantIds, "message:new", {
      conversationId: conversation._id,
      message,
    });
    return Response.json({
      success: true,
      shareCount: updatedPost.shareCount,
      conversationId: conversation._id,
    });
  } catch (error) {
    console.error("Share post error:", error);
    return jsonError("Failed to share post", 500);
  }
}
