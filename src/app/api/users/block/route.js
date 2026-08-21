import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  createMessage,
  createNotification,
  getBlockRelationship,
  getConversation,
  getUserById,
  setBlockStatus,
  updateUnblockRequestNotifications,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

function jsonOk(data = {}, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const { targetUserId, conversationId, action = "block" } = await req.json();
    if (!targetUserId || typeof targetUserId !== "string") return jsonError("Invalid user", 400);
    if (targetUserId === session.user.id) return jsonError("You cannot block yourself", 400);
    if (!["block", "unblock"].includes(action)) {
      return jsonError("Invalid block action", 400);
    }

    const [user, target] = await Promise.all([
      getUserById(session.user.id),
      getUserById(targetUserId),
    ]);
    if (!user || !target) return jsonError("User not found", 404);
    const relationship = await getBlockRelationship(user._id, target._id);

    if (action === "block") {
      if (relationship.blocked) {
        return jsonError(
          relationship.blockerId === user._id
            ? "This user is already blocked"
            : "You have been blocked by this user",
          409,
        );
      }
      await setBlockStatus(user._id, target._id, true);
      await createNotification({
        recipient: target._id,
        sender: user._id,
        type: "user_blocked",
        status: "active",
        event: { conversationId: conversationId || null },
      });
    } else {
      if (!relationship.blocked || relationship.blockerId !== user._id) {
        return jsonError("You are not blocking this user", 409);
      }
      await setBlockStatus(user._id, target._id, false);
      await Promise.all([
        updateUnblockRequestNotifications(user._id, target._id, "approved"),
        createNotification({
          recipient: target._id,
          sender: user._id,
          type: "user_unblocked",
          status: "approved",
          event: { conversationId: conversationId || null },
        }),
      ]);
    }

    let systemMessage = null;
    const conversation = conversationId
      ? await getConversation(conversationId, user._id)
      : null;
    if (conversation?.participantIds.includes(target._id)) {
      systemMessage = await createMessage({
        conversationId,
        senderId: user._id,
        systemType: action === "block" ? "user_blocked" : "user_unblocked",
        systemData: {
          blockerId: user._id,
          blockedUserId: target._id,
          blockerUsername: user.username,
          blockedUsername: target.username,
        },
      });
      emitToUsers(conversation.participantIds, "message:new", {
        conversationId,
        message: systemMessage,
      });
    }
    const blockState =
      action === "block"
        ? {
            blocked: true,
            blockerId: user._id,
            blockedUserId: target._id,
            request: null,
          }
        : { blocked: false };
    emitToUsers([user._id, target._id], "block:update", {
      conversationId: conversationId || null,
      blockState,
    });
    emitToUsers([target._id], "notification:new", {
      type: action === "block" ? "user_blocked" : "user_unblocked",
    });
    return jsonOk({ blocked: action === "block", blockState, systemMessage });
  } catch (error) {
    console.error("Block user error:", error);
    return jsonError("Failed to update block", 500);
  }
}
