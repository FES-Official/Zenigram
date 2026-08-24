import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { verifyS3Object } from "@/app/lib/s3Storage";
import {
  createClip,
  getUserById,
  listClips,
} from "@/app/lib/socialStore";

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

function normalizeTimeline(items, mediaCount) {
  const source = Array.isArray(items) && items.length
    ? items.slice(0, mediaCount)
    : Array.from({ length: mediaCount }, () => ({ duration: 5, trimStart: 0 }));

  if (source.length !== mediaCount) return null;

  return source.map((item, index) => {
    const rawDuration = Number(item?.duration ?? 3);
    const rawTrimStart = Number(item?.trimStart ?? 0);
    if (!Number.isFinite(rawDuration) || !Number.isFinite(rawTrimStart)) return null;

    return {
      mediaIndex: index,
      duration: Math.max(0.5, Math.min(120, rawDuration)),
      trimStart: Math.max(0, rawTrimStart),
      filter: String(item?.filter || "none").slice(0, 40),
    };
  });
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const rawLimit = Number(new URL(req.url).searchParams.get("limit"));
    const limit = Number.isSafeInteger(rawLimit)
      ? Math.min(80, Math.max(1, rawLimit))
      : 80;

    return Response.json({
      success: true,
      clips: await listClips(session?.user?.id || "guest", limit),
    });
  } catch (error) {
    console.error("Clips fetch error:", error);
    return jsonError("Failed to load clips", 500);
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const body = await req.json();
    const caption = String(body.caption || "").trim().slice(0, 500);
    const requestedItems = Array.isArray(body.mediaItems)
      ? body.mediaItems.slice(0, 20)
      : body.media
        ? [body.media]
        : [];

    if (
      !requestedItems.length ||
      requestedItems.some(
        (item) => !item?.key || !["image", "video"].includes(item.type),
      )
    ) {
      return jsonError("Choose a supported image or video clip", 400);
    }

    const timeline = normalizeTimeline(body.timeline, requestedItems.length);
    if (!timeline) {
      return jsonError("Every clip media item needs a valid timeline entry", 400);
    }

    const duration = timeline.reduce((sum, item) => sum + item.duration, 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 120) {
      return jsonError("Clips must be between 1 second and 2 minutes", 400);
    }

    const [user, uploadedItems] = await Promise.all([
      getUserById(session.user.id),
      Promise.all(
        requestedItems.map((item) => verifyS3Object(item.key, session.user.id)),
      ),
    ]);
    if (!user || uploadedItems.some((item) => !item)) {
      return jsonError("Clip upload could not be verified", 400);
    }

    const mediaItems = uploadedItems.map((uploaded, index) => {
      const requested = requestedItems[index];
      const matches =
        (requested.type === "image" && uploaded.contentType.startsWith("image/")) ||
        (requested.type === "video" && uploaded.contentType.startsWith("video/"));
      if (!matches) throw new Error("Clip media type does not match");
      return { key: uploaded.key, url: uploaded.url, type: requested.type };
    });

    const textLayers = (Array.isArray(body.textLayers) ? body.textLayers : [])
      .slice(0, 12)
      .map((layer) => ({
        id: String(layer.id || "").slice(0, 80),
        text: String(layer.text || "").slice(0, 180),
        start: Math.max(0, Number(layer.start || 0)),
        end: Math.min(duration, Math.max(0, Number(layer.end || duration))),
        x: Math.min(100, Math.max(0, Number(layer.x ?? 50))),
        y: Math.min(100, Math.max(0, Number(layer.y ?? 50))),
        size: Math.min(72, Math.max(14, Number(layer.size || 32))),
        color: /^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : "#ffffff",
        background: Boolean(layer.background),
        backgroundColor: /^#[0-9a-f]{6}$/i.test(layer.backgroundColor) ? layer.backgroundColor : "#000000",
        showBorder: Boolean(layer.showBorder),
        borderColor: /^#[0-9a-f]{6}$/i.test(layer.borderColor) ? layer.borderColor : "#ffffff",
        borderWidth: Math.min(8, Math.max(1, Number(layer.borderWidth || 2))),
        rotation: Math.min(180, Math.max(-180, Number(layer.rotation || 0))),
        fontFamily: String(layer.fontFamily || "Arial").slice(0, 50),
        fontWeight: Number(layer.fontWeight) === 400 ? 400 : 700,
        italic: Boolean(layer.italic),
        underline: Boolean(layer.underline),
        strike: Boolean(layer.strike),
      }))
      .filter((layer) =>
        layer.text &&
        Number.isFinite(layer.start) &&
        Number.isFinite(layer.end) &&
        layer.start < duration &&
        layer.end > layer.start,
      );

    const clip = await createClip({
      userId: user._id,
      caption,
      media: mediaItems[0],
      mediaItems,
      timeline,
      textLayers,
      duration,
      transition: ["cut", "fade", "slide", "zoom"].includes(body.transition)
        ? body.transition
        : "fade",
      aspectRatio: "9:16",
    });
    return Response.json({ success: true, clip }, { status: 201 });
  } catch (error) {
    console.error("Clip create error:", error);
    return jsonError("Failed to create clip", 500);
  }
}
