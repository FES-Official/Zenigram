import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { deleteConversationForUser } from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function DELETE(req, { params }) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await params;
    const result = await deleteConversationForUser(
      conversationId,
      userId,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    emitToUsers(
      result.purged ? result.conversation.participantIds : [userId],
      "conversation:delete",
      {
        conversationId,
        userId: userId,
        purged: result.purged,
      },
    );
    return NextResponse.json({ success: true, purged: result.purged });
  } catch (error) {
    console.error("Conversation delete error:", error);
    return NextResponse.json(
      { error: "Unable to delete conversation" },
      { status: 500 },
    );
  }
}
