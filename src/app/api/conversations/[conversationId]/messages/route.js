import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
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


function normalizeDrawing(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || !Array.isArray(value.strokes)) return null;
  if (value.strokes.length > 24) return null;

  let totalPoints = 0;
  const strokes = [];
  for (const stroke of value.strokes) {
    const color = typeof stroke?.color === "string" ? stroke.color : "";
    const width = Number(stroke?.width);
    if (!/^#[0-9a-f]{6}$/i.test(color) || !Number.isFinite(width) || width < 1 || width > 18) return null;
    if (!Array.isArray(stroke.points) || stroke.points.length < 2 || stroke.points.length > 160) return null;

    const points = [];
    for (const point of stroke.points) {
      const x = Number(point?.x);
      const y = Number(point?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 360 || y < 0 || y > 480) return null;
      points.push({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    }
    totalPoints += points.length;
    if (totalPoints > 2400) return null;
    strokes.push({
      color: color.toLowerCase(),
      width: Math.round(width * 10) / 10,
      points,
    });
  }

  if (!strokes.length) return null;
  return { version: 1, width: 360, height: 480, strokes };
}

export async function GET(req, { params }) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { conversationId } = await params;
    const result = await listMessages(conversationId, userId);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (result.unreadIds.length) {
      emitToUsers(result.conversation.participantIds, "message:read", {
        conversationId,
        readerId: userId,
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
    const userId = await getAuthenticatedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { conversationId } = await params;
    const { text, media, replyTo, forwardFrom, drawing: drawingInput } = await req.json();
    const cleanText = typeof text === "string" ? text.trim() : "";
    const drawing = normalizeDrawing(drawingInput);
    if (drawingInput != null && !drawing) {
      return NextResponse.json({ error: "Invalid drawing data" }, { status: 400 });
    }
    const conversation = await getConversation(conversationId, userId);
    if (!conversation) {
      return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
    }
    const recipientIds = conversation.participantIds.filter(
      (id) => id !== userId,
    );
    const relationships = await Promise.all(
      recipientIds.map((recipientId) =>
        getBlockRelationship(userId, recipientId),
      ),
    );
    if (relationships.some((relationship) => relationship.blocked)) {
      return NextResponse.json(
        { error: "Messaging is unavailable for this user" },
        { status: 403 },
      );
    }
    const requestedMedia = normalizeMedia(media);
    const cleanMedia = await Promise.all(
      requestedMedia.map(async (item) => {
        const object = await verifyS3Object(item.publicId, userId);
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
      forwarded = await getMessage(forwardFrom, userId);
    }
    if (
      (!cleanText && cleanMedia.length === 0 && !forwarded && !drawing) ||
      cleanText.length > 1000
    ) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
    const message = await createMessage({
      conversationId,
      senderId: userId,
      text: forwarded?.message.text || cleanText,
      media: forwarded?.message.media?.length
        ? forwarded.message.media
        : cleanMedia,
      replyTo: replyTo || null,
      forwardedFrom: forwarded?.message._id || null,
      drawing: forwarded?.message.drawing || drawing,
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
