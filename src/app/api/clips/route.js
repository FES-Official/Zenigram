import { cookies } from "next/headers";
import { verifyS3Object } from "@/app/lib/s3Storage";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { createClip, deleteClip, getUserById, getUserRelations, listClips } from "@/app/lib/socialStore";
import { enqueueClipRenderJob, isClipRenderingEnabled } from "@/app/lib/clipRenderQueue";
import { filterVisibleClips, setContentAudience } from "@/app/lib/audienceStore";
import { normalizeFeedPreferences, normalizeTopicId, rankFeedPosts } from "@/app/lib/feedRanking";

function jsonError(message, status = 400) { return Response.json({ success: false, message }, { status }); }

function normalizeTimeline(items, mediaCount) {
  const source = Array.isArray(items) && items.length ? items.slice(0, mediaCount) : Array.from({ length: mediaCount }, () => ({ duration: 5, trimStart: 0 }));
  if (source.length !== mediaCount) return null;
  return source.map((item, index) => {
    const rawDuration = Number(item?.duration ?? 3);
    const rawTrimStart = Number(item?.trimStart ?? 0);
    if (!Number.isFinite(rawDuration) || !Number.isFinite(rawTrimStart)) return null;
    return { mediaIndex: index, duration: Math.max(0.5, Math.min(120, rawDuration)), trimStart: Math.max(0, rawTrimStart), filter: String(item?.filter || "none").slice(0, 40) };
  });
}

export async function GET(req) {
  try {
    const authenticatedUserId = await getAuthenticatedUserId(req);
    if (req.headers.get("authorization") && !authenticatedUserId) return jsonError("Unauthorized", 401);
    const limitValue = new URL(req.url).searchParams.get("limit");
    const rawLimit = limitValue === null ? 80 : Number(limitValue);
    const limit = Number.isSafeInteger(rawLimit) ? Math.min(80, Math.max(1, rawLimit)) : 80;
    const viewerId = authenticatedUserId || "guest";
    const guestRelations = {
      blockedUsers: [],
      blockedByUsers: [],
      supporting: [],
      supportingCount: 0,
      closeOnes: [],
      savedClips: [],
    };

    const [user, relations] = authenticatedUserId
      ? await Promise.all([
          getUserById(viewerId),
          getUserRelations(viewerId),
        ])
      : [null, guestRelations];

    // Load a wider candidate set before applying the user's own clip rules.
    const candidates = await listClips(viewerId, 80, relations, { preserveCandidatePool: true });
    const visible = filterVisibleClips(candidates, viewerId, relations);
    const preferences = normalizeFeedPreferences(user?.feedPreferences);
    const clips = rankFeedPosts(
      visible,
      preferences,
      { ...relations, viewerId },
    ).slice(0, limit);

    return Response.json({
      success: true,
      clips,
      feedPreferences: preferences,
    });
  } catch (error) {
    console.error("Clips fetch error:", error);
    return jsonError("Failed to load clips", 500);
  }
}

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const body = await req.json();
    // Keep existing website publishing unchanged; render jobs are opt-in for bearer-authenticated native clients.
    const renderEnabled = Boolean(req.headers.get("authorization")) && isClipRenderingEnabled();
    if (renderEnabled && !process.env.CLIP_RENDER_QUEUE_URL?.trim()) {
      return jsonError("Clip rendering is enabled but its SQS queue is not configured", 503);
    }
    const caption = String(body.caption || "").trim().slice(0, 500);
    const topics = [...new Set(
      (Array.isArray(body.topics) ? body.topics : [])
        .map(normalizeTopicId)
        .filter(Boolean),
    )].slice(0, 5);
    const requestedItems = Array.isArray(body.mediaItems) ? body.mediaItems.slice(0, 20) : body.media ? [body.media] : [];
    const store = await cookies();
    const cookieAudience = store.get("zenigram_clip_audience")?.value === "close";
    const closeOnesOnly = body.closeOnesOnly === true || cookieAudience;

    if (!requestedItems.length || requestedItems.some((item) => !item?.key || !["image", "video"].includes(item.type))) return jsonError("Choose a supported image or video clip", 400);
    const timeline = normalizeTimeline(body.timeline, requestedItems.length);
    if (!timeline) return jsonError("Every clip media item needs a valid timeline entry", 400);
    const duration = timeline.reduce((sum, item) => sum + item.duration, 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 120) return jsonError("Clips must be between 1 second and 2 minutes", 400);

    const [user, uploadedItems] = await Promise.all([
      getUserById(userId),
      Promise.all(requestedItems.map((item) => verifyS3Object(item.key, userId))),
    ]);
    if (!user || uploadedItems.some((item) => !item)) return jsonError("Clip upload could not be verified", 400);

    const mediaItems = uploadedItems.map((uploaded, index) => {
      const requested = requestedItems[index];
      const matches = (requested.type === "image" && uploaded.contentType.startsWith("image/")) || (requested.type === "video" && uploaded.contentType.startsWith("video/"));
      if (!matches) throw new Error("Clip media type does not match");
      return { key: uploaded.key, url: uploaded.url, type: requested.type };
    });

    const textLayers = (Array.isArray(body.textLayers) ? body.textLayers : []).slice(0, 12).map((layer) => ({
      id: String(layer.id || "").slice(0, 80), text: String(layer.text || "").slice(0, 180), start: Math.max(0, Number(layer.start || 0)), end: Math.min(duration, Math.max(0, Number(layer.end || duration))),
      x: Math.min(100, Math.max(0, Number(layer.x ?? 50))), y: Math.min(100, Math.max(0, Number(layer.y ?? 50))), size: Math.min(72, Math.max(14, Number(layer.size || 32))), color: /^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : "#ffffff",
      background: Boolean(layer.background), backgroundColor: /^#[0-9a-f]{6}$/i.test(layer.backgroundColor) ? layer.backgroundColor : "#000000", showBorder: Boolean(layer.showBorder), borderColor: /^#[0-9a-f]{6}$/i.test(layer.borderColor) ? layer.borderColor : "#ffffff", borderWidth: Math.min(8, Math.max(1, Number(layer.borderWidth || 2))), rotation: Math.min(180, Math.max(-180, Number(layer.rotation || 0))), fontFamily: String(layer.fontFamily || "Arial").slice(0, 50), fontWeight: Number(layer.fontWeight) === 400 ? 400 : 700, italic: Boolean(layer.italic), underline: Boolean(layer.underline), strike: Boolean(layer.strike),
    })).filter((layer) => layer.text && Number.isFinite(layer.start) && Number.isFinite(layer.end) && layer.start < duration && layer.end > layer.start);

    const clip = await createClip({
      userId: user._id,
      caption,
      media: mediaItems[0],
      mediaItems,
      topics,
      timeline,
      textLayers,
      duration,
      transition: ["cut", "fade", "slide", "zoom"].includes(body.transition) ? body.transition : "fade",
      aspectRatio: "9:16",
      renderStatus: renderEnabled ? "queued" : "ready",
      renderVersion: 1,
    });
    const updated = await setContentAudience("clip", clip._id, user._id, closeOnesOnly);

    if (renderEnabled) {
      try {
        await enqueueClipRenderJob({
          clipId: clip._id,
          userId: user._id,
          renderVersion: 1,
        });
      } catch (queueError) {
        console.error("Clip render queue error:", queueError);
        // Do not leave a feed-visible clip pointing at uploads the client will clean up.
        await deleteClip(clip._id, user._id).catch((cleanupError) => {
          console.error("Clip cleanup after queue failure failed:", cleanupError);
        });
        return jsonError("Your clip was uploaded, but the render service is unavailable. Please try again.", 503);
      }
    }

    store.delete("zenigram_clip_audience");
    const responseClip = updated
      ? { ...clip, closeOnesOnly }
      : clip;
    return Response.json({
      success: true,
      clip: responseClip,
      renderStatus: renderEnabled ? "queued" : "ready",
      renderProgress: renderEnabled ? 0 : 100,
    }, { status: renderEnabled ? 202 : 201 });
  } catch (error) {
    console.error("Clip create error:", error);
    return jsonError("Failed to create clip", 500);
  }
}
