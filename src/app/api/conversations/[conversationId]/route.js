import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import { deleteConversationForUser } from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";

export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await params;
    const result = await deleteConversationForUser(
      conversationId,
      session.user.id,
    );
    if (!result) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    emitToUsers(
      result.purged ? result.conversation.participantIds : [session.user.id],
      "conversation:delete",
      {
        conversationId,
        userId: session.user.id,
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
