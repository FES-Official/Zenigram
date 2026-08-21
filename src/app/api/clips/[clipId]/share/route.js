import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  createConversation,
  createMessage,
  getClip,
  getUserById,
  getUserRelations,
  updateClip,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { clipId } = await params;
    const { recipientId } = await req.json();
    if (!recipientId || recipientId === session.user.id) return jsonError("Choose a valid recipient", 400);

    const [clip, sender, recipient] = await Promise.all([
      getClip(clipId),
      getUserById(session.user.id),
      getUserById(recipientId),
    ]);
    if (!clip) return jsonError("Clip not found", 404);
    if (!sender || !recipient || recipient.accountStatus !== "active") return jsonError("Recipient not found", 404);

    const [senderRelations, recipientRelations, creator, creatorRelations] = await Promise.all([
      getUserRelations(sender._id),
      getUserRelations(recipient._id),
      getUserById(clip.userId),
      getUserRelations(clip.userId),
    ]);
    const blocked =
      senderRelations.blockedUsers.includes(recipientId) ||
      recipientRelations.blockedUsers.includes(sender._id) ||
      creatorRelations.blockedUsers.includes(recipientId) ||
      recipientRelations.blockedUsers.includes(clip.userId);
    const privateWithoutAccess =
      creator?.ishidden &&
      creator._id !== recipientId &&
      !recipientRelations.supporting.includes(creator._id);
    if (blocked || privateWithoutAccess || creator?.accountStatus !== "active") {
      return jsonError("This clip cannot be shared with that user", 403);
    }

    const conversation = await createConversation(sender._id, recipient._id);
    const sharedClip = {
      ...clip,
      user: {
        _id: creator._id,
        username: creator.username,
        profilePic: creator.profilePic,
        profilePicKey: creator.profilePicKey,
      },
    };
    const message = await createMessage({
      conversationId: conversation._id,
      senderId: sender._id,
      sharedClip,
    });
    const updatedClip = await updateClip(clipId, sender._id, "share");
    emitToUsers(conversation.participantIds, "message:new", {
      conversationId: conversation._id,
      message,
    });
    return Response.json({
      success: true,
      shares: Number(updatedClip?.shares || 0),
      conversationId: conversation._id,
    });
  } catch (error) {
    console.error("Share clip error:", error);
    return jsonError("Failed to share clip", 500);
  }
}
