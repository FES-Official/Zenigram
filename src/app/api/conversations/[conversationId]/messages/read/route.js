import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import { markMessagesRead } from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await params;
    const body = await req.json();
    if (!Array.isArray(body.messageIds) || body.messageIds.length > 200) {
      return NextResponse.json(
        { error: "Invalid message list" },
        { status: 400 },
      );
    }
    const messageIds = [
      ...new Set(body.messageIds.map(String).filter(Boolean)),
    ];
    const result = await markMessagesRead(
      conversationId,
      session.user.id,
      messageIds,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    if (result.messageIds.length) {
      emitToUsers(result.conversation.participantIds, "message:read", {
        conversationId,
        readerId: session.user.id,
        messageIds: result.messageIds,
      });
    }
    return NextResponse.json({ success: true, messageIds: result.messageIds });
  } catch (error) {
    console.error("Message read error:", error);
    return NextResponse.json(
      { error: "Unable to mark messages as seen" },
      { status: 500 },
    );
  }
}
