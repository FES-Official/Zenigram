import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import {
  createMessage,
  getBlockRelationship,
  getConversation,
  getMessage,
  listMessages,
} from "@/app/lib/socialStore";
import { emitToUsers } from "@/app/lib/socketHub";
import { verifyS3Object } from "@/app/lib/s3Storage";

const MESSAGE_MEDIA_TYPES = new Set(["image", "video", "audio", "drawing"]);

function normalizeMedia(items) {
  if (!Array.isArray(items)) return [];
  return items
    .slice(0, 8)
    .map((item) => ({
      url: typeof item?.url === "string" ? item.url.trim() : "",
      type: typeof item?.type === "string" ? item.type.trim() : "",
      publicId: typeof item?.publicId === "string" ? item.publicId.trim() : "",
    }))
    .filter((item) => item.publicId && MESSAGE_MEDIA_TYPES.has(item.type));
}

export async function GET(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { conversationId } = await params;
    const result = await listMessages(conversationId, session.user.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.unreadIds.length) {
      emitToUsers(result.conversation.participantIds, "message:read", {
        conversationId,
        readerId: session.user.id,
        messageIds: result.unreadIds,
      });
    }
    return NextResponse.json({ messages: result.messages });
  } catch (error) {
    console.error("Message fetch error:", error);
    return NextResponse.json(
      { error: "Unable to load messages" },
      { status: 500 },
    );
  }
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { conversationId } = await params;
    const { text, media, replyTo, forwardFrom } = await req.json();
    const cleanText = typeof text === "string" ? text.trim() : "";
    const conversation = await getConversation(conversationId, session.user.id);
    if (!conversation) {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
    }
    const recipientId = conversation.participantIds.find(
      (id) => id !== session.user.id,
    );
    const relationship = await getBlockRelationship(
      session.user.id,
      recipientId,
    );
    if (relationship.blocked) {
      return NextResponse.json(
        { error: "Messaging is unavailable for this user" },
        { status: 403 },
      );
    }
    const requestedMedia = normalizeMedia(media);
    const cleanMedia = await Promise.all(
      requestedMedia.map(async (item) => {
        const object = await verifyS3Object(item.publicId, session.user.id);
        if (!object) throw new Error("Message media could not be verified");
        const validType =
          ((item.type === "image" || item.type === "drawing") && object.contentType.startsWith("image/")) ||
          (item.type === "video" && object.contentType.startsWith("video/")) ||
          (item.type === "audio" && object.contentType.startsWith("audio/"));
        if (!validType) throw new Error("Message media type does not match");
        return { url: object.url, publicId: object.key, type: item.type };
      }),
    );
    let forwarded = null;
    if (forwardFrom) {
      forwarded = await getMessage(forwardFrom, session.user.id);
    }
    if (
      (!cleanText && cleanMedia.length === 0 && !forwarded) ||
      cleanText.length > 1000
    ) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
    const message = await createMessage({
      conversationId,
      senderId: session.user.id,
      text: forwarded?.message.text || cleanText,
      media: forwarded?.message.media?.length
        ? forwarded.message.media
        : cleanMedia,
      replyTo: replyTo || null,
      forwardedFrom: forwarded?.message._id || null,
      sharedPost: forwarded?.message.sharedPost || null,
      sharedClip: forwarded?.message.sharedClip || null,
    });
    if (!message) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
    emitToUsers(conversation.participantIds, "message:new", {
      conversationId,
      message,
    });
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    console.error("Message create error:", error);
    return NextResponse.json(
      { error: "Unable to send message" },
      { status: 500 },
    );
  }
}
