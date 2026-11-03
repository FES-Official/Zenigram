import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import {
  createConversation,
  createCloseOnesGroup,
  getBlockRelationship,
  getUserById,
  getUserRelations,
  listConversations,
} from "@/app/lib/socialStore";

export async function GET(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [conversations, relations] = await Promise.all([
      listConversations(userId),
      getUserRelations(userId),
    ]);
    const closeOnes = await Promise.all((relations.closeOnes || []).map(getUserById));
    return NextResponse.json({
      conversations,
      closeOnes: closeOnes
        .filter(Boolean)
        .filter((user) => user.accountStatus === "active")
        .map((user) => ({ _id: user._id, username: user.username, profilePic: user.profilePic })),
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
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { recipientId, eventId, memberIds, groupName } = await req.json();
    if (Array.isArray(memberIds)) {
      const conversation = await createCloseOnesGroup(
        userId,
        memberIds,
        groupName,
      );
      if (!conversation) {
        return NextResponse.json(
          { error: "Choose at least two close ones for this group" },
          { status: 400 },
        );
      }
      return NextResponse.json({ conversation }, { status: 201 });
    }
    if (!recipientId || recipientId === userId) {
      return NextResponse.json({ error: "Invalid recipient" }, { status: 400 });
    }
    const [recipient, relationship] = await Promise.all([
      getUserById(recipientId),
      getBlockRelationship(userId, recipientId),
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
      userId,
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
