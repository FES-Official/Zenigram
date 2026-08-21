import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import {
  createConversation,
  getBlockRelationship,
  getUserById,
  listConversations,
} from "@/app/lib/socialStore";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({
      conversations: await listConversations(session.user.id),
    });
  } catch (error) {
    console.error("Conversation fetch error:", error);
    return NextResponse.json(
      { error: "Unable to load conversations" },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { recipientId, eventId } = await req.json();
    if (!recipientId || recipientId === session.user.id) {
      return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
    }
    const [recipient, relationship] = await Promise.all([
      getUserById(recipientId),
      getBlockRelationship(session.user.id, recipientId),
    ]);
    if (!recipient || recipient.accountStatus !== "active") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (relationship.blocked) {
      return NextResponse.json(
        { error: "Messaging is unavailable for this user" },
        { status: 403 },
      );
    }
    const conversation = await createConversation(
      session.user.id,
      recipientId,
      eventId || null,
    );
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("Conversation create error:", error);
    return NextResponse.json(
      { error: "Unable to start conversation" },
      { status: 500 },
    );
  }
}
