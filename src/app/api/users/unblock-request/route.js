import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import {
  acceptUnblockRequest,
  declineUnblockRequest,
  createMessage,
  createNotification,
  createUnblockRequest,
  getBlockRelationship,
  getConversation,
  getUserById,
  updateUnblockRequestNotifications,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { blockerId, conversationId } = await req.json();
    if (!blockerId || blockerId === session.user.id) {
      return jsonError("Invalid blocker", 400);
    }

    const relationship = await getBlockRelationship(
      session.user.id,
      blockerId,
    );
    if (
      !relationship.blocked ||
      relationship.blockerId !== blockerId ||
      relationship.blockedUserId !== session.user.id
    ) {
      return jsonError("This user is not blocking you", 409);
    }
    if (relationship.request) {
      return jsonOk({ request: relationship.request, alreadyPending: true });
    }

    const [requester, blocker] = await Promise.all([
      getUserById(session.user.id),
      getUserById(blockerId),
    ]);
    if (!requester || !blocker) return jsonError("User not found", 404);
    const request = await createUnblockRequest(
      requester._id,
      blocker._id,
      conversationId,
    );
    if (!request) return jsonError("Unable to create unblock request", 409);

    await createNotification({
      recipient: blocker._id,
      sender: requester._id,
      type: "unblock_request",
      status: "pending",
      event: {
        conversationId: conversationId || null,
        requesterId: requester._id,
        expiresAt: request.expiresAt,
      },
    });
    const blockState = {
      blocked: true,
      blockerId: blocker._id,
      blockedUserId: requester._id,
      request,
    };
    emitToUsers([blocker._id, requester._id], "block:update", {
      conversationId: conversationId || null,
      blockState,
    });
    emitToUsers([blocker._id], "notification:new", {
      type: "unblock_request",
    });
    return jsonOk({ request });
  } catch (error) {
    console.error("Unblock request error:", error);
    return jsonError("Unable to send unblock request", 500);
  }
}

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { requesterId, conversationId, action = "accept" } = await req.json();
    if (!requesterId || requesterId === session.user.id) {
      return jsonError("Invalid requester", 400);
    }
    if (!['accept', 'decline'].includes(action)) {
      return jsonError("Invalid response", 400);
    }
    if (action === "decline") {
      const request = await declineUnblockRequest(
        session.user.id,
        requesterId,
      );
      if (!request) return jsonError("Request not found or expired", 409);
      const [blocker, requester] = await Promise.all([
        getUserById(session.user.id),
        getUserById(requesterId),
      ]);
      if (!blocker || !requester) return jsonError("User not found", 404);
      await Promise.all([
        updateUnblockRequestNotifications(blocker._id, requester._id, "rejected"),
        createNotification({
          recipient: requester._id,
          sender: blocker._id,
          type: "unblock_request_declined",
          status: "rejected",
          event: {
            conversationId: conversationId || request.conversationId || null,
          },
        }),
      ]);
      emitToUsers([blocker._id, requester._id], "block:update", {
        conversationId: conversationId || request.conversationId || null,
        blockState: {
          blocked: true,
          blockerId: blocker._id,
          blockedUserId: requester._id,
          request: null,
        },
      });
      emitToUsers([requester._id], "notification:new", {
        type: "unblock_request_declined",
      });
      return jsonOk({ declined: true });
    }
    const request = await acceptUnblockRequest(
      session.user.id,
      requesterId,
    );
    if (!request) {
      return jsonError("Request not found or expired", 409);
    }

    const [blocker, requester] = await Promise.all([
      getUserById(session.user.id),
      getUserById(requesterId),
    ]);
    if (!blocker || !requester) return jsonError("User not found", 404);
    await Promise.all([
      updateUnblockRequestNotifications(blocker._id, requester._id, "approved"),
      createNotification({
        recipient: requester._id,
        sender: blocker._id,
        type: "user_unblocked",
        status: "approved",
        event: { conversationId: conversationId || request.conversationId || null },
      }),
    ]);

    const activeConversationId = conversationId || request.conversationId;
    const conversation = activeConversationId
      ? await getConversation(activeConversationId, blocker._id)
      : null;
    let systemMessage = null;
    if (conversation?.participantIds.includes(requester._id)) {
      systemMessage = await createMessage({
        conversationId: activeConversationId,
        senderId: blocker._id,
        systemType: "user_unblocked",
        systemData: {
          blockerId: blocker._id,
          blockedUserId: requester._id,
          blockerUsername: blocker.username,
          blockedUsername: requester.username,
        },
      });
      emitToUsers(conversation.participantIds, "message:new", {
        conversationId: activeConversationId,
        message: systemMessage,
      });
    }
    emitToUsers([blocker._id, requester._id], "block:update", {
      conversationId: activeConversationId || null,
      blockState: { blocked: false },
    });
    emitToUsers([requester._id], "notification:new", {
      type: "user_unblocked",
    });
    return jsonOk({ accepted: true, systemMessage });
  } catch (error) {
    console.error("Unblock request response error:", error);
    return jsonError("Unable to accept unblock request", 500);
  }
}
