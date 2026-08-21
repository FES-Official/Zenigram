import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import {
  createNotification,
  deleteMessageForEveryone,
  getBlockRelationship,
  getMessage,
  updateMessage,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { messageId } = await params;
    const { action, emoji } = await req.json();
    const existing = await getMessage(messageId, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    const otherUserId = existing.conversation.participantIds.find(
      (participantId) => participantId !== session.user.id,
    );
    const relationship = await getBlockRelationship(
      session.user.id,
      otherUserId,
    );
    if (relationship.blocked) {
      return NextResponse.json(
        { error: "Only an unblock request is available in this chat" },
        { status: 403 },
      );
    }
    const result = await updateMessage(messageId, session.user.id, (message) => {
      if (action === "like") {
        const liked = (message.likedBy || []).includes(session.user.id);
        return {
          likedBy: liked
            ? message.likedBy.filter((id) => id !== session.user.id)
            : [...(message.likedBy || []), session.user.id],
        };
      }
      if (action === "react") {
        const cleanEmoji = typeof emoji === "string" ? emoji.trim().slice(0, 16) : "";
        const reactions = (message.reactions || []).filter(
          (reaction) => reaction.user !== session.user.id,
        );
        if (cleanEmoji) reactions.push({ user: session.user.id, emoji: cleanEmoji });
        return { reactions };
      }
      if (action === "warn" && message.sender !== session.user.id) {
        return { warningCount: Number(message.warningCount || 0) + 1 };
      }
      throw new Error("Invalid action");
    });
    if (!result) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    if (action === "warn") {
      await createNotification({
        recipient: result.message.sender?._id || result.message.sender,
        sender: session.user.id,
        type: "message_warning",
      });
    }
    emitToUsers(result.conversation.participantIds, "message:update", {
      conversationId: result.conversation._id,
      message: result.message,
    });
    return NextResponse.json({ message: result.message });
  } catch (error) {
    console.error("Message action error:", error);
    return NextResponse.json(
      { error: error.message || "Unable to update message" },
      { status: error.message === "Invalid action" ? 400 : 500 },
    );
  }
}

export async function DELETE(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { messageId } = await params;
    const everyone = new URL(req.url).searchParams.get("scope") === "everyone";
    const result = everyone
      ? await deleteMessageForEveryone(messageId, session.user.id)
      : await updateMessage(messageId, session.user.id, (message) => ({
          deletedFor: [
            ...new Set([...(message.deletedFor || []), session.user.id]),
          ],
        }));
    if (!result) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    emitToUsers(result.conversation.participantIds, "message:delete", {
      conversationId: result.conversation._id,
      messageId,
      scope: everyone ? "everyone" : "me",
      userId: session.user.id,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Unable to delete message" },
      { status: error.message === "Forbidden" ? 403 : 500 },
    );
  }
}
