import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { getReadableMediaUrl } from "@/app/lib/s3Storage";
import {
  getClip,
  queueClipRenderRetry,
  updateClipRenderState,
} from "@/app/lib/socialStore";
import { enqueueClipRenderJob, isClipRenderingEnabled } from "@/app/lib/clipRenderQueue";

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

async function ownedClip(req, params) {
  const userId = await getAuthenticatedUserId(req);
  if (!userId) return { error: jsonError("Unauthorized", 401) };
  const { clipId } = await params;
  const clip = await getClip(clipId);
  if (!clip || String(clip.userId) !== String(userId)) {
    return { error: jsonError("Clip not found", 404) };
  }
  return { userId, clip };
}

export async function GET(req, { params }) {
  try {
    const result = await ownedClip(req, params);
    if (result.error) return result.error;
    const { clip } = result;
    const renderedMediaUrl = clip.renderStatus === "ready" && clip.renderedMediaKey
      ? await getReadableMediaUrl("", clip.renderedMediaKey)
      : "";
    return Response.json({
      success: true,
      clipId: clip._id,
      status: clip.renderStatus || "ready",
      progress: Math.max(0, Math.min(100, Number(clip.renderProgress ?? 100))),
      error: clip.renderStatus === "failed" ? String(clip.renderError || "The clip could not be rendered.") : "",
      renderedMediaUrl,
      duration: Number(clip.renderedDuration || clip.duration || 0),
      updatedAt: clip.renderUpdatedAt || clip.updatedAt,
    });
  } catch (error) {
    console.error("Clip render status error:", error);
    return jsonError("Unable to load clip render status", 500);
  }
}

export async function POST(req, { params }) {
  try {
    if (!isClipRenderingEnabled()) {
      return jsonError("Clip rendering is not enabled on this server.", 503);
    }
    if (!process.env.CLIP_RENDER_QUEUE_URL?.trim()) {
      return jsonError("Clip rendering queue is not configured.", 503);
    }

    const result = await ownedClip(req, params);
    if (result.error) return result.error;
    const { clip, userId } = result;
    if (clip.renderStatus !== "failed") {
      return jsonError("Only a failed render can be retried.", 409);
    }

    const queued = await queueClipRenderRetry(clip._id, userId);
    if (!queued) return jsonError("This clip is not ready for a retry.", 409);

    try {
      await enqueueClipRenderJob({
        clipId: clip._id,
        userId,
        renderVersion: queued.renderVersion,
      });
    } catch (error) {
      await updateClipRenderState({
        clipId: clip._id,
        userId,
        renderVersion: queued.renderVersion,
        status: "failed",
        progress: 0,
        error: "The render queue is temporarily unavailable. Please retry.",
      }).catch(() => {});
      console.error("Clip render retry enqueue error:", error);
      return jsonError("Unable to queue the clip for rendering. Please retry.", 503);
    }

    return Response.json({
      success: true,
      status: "queued",
      progress: 0,
      renderVersion: queued.renderVersion,
    }, { status: 202 });
  } catch (error) {
    console.error("Clip render retry error:", error);
    return jsonError("Unable to retry clip rendering", 500);
  }
}
