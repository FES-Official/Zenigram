import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  deleteClip,
  getClip,
  getUserById,
  getUserRelations,
  toggleSavedClip,
  updateClip,
} from "@/app/lib/socialStore";
import {
  getClipViewerEngagement,
  incrementClipShareAtomic,
  recordClipViewAtomic,
  toggleClipLikeAtomic,
} from "@/app/lib/clipEngagement";

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

async function getVisibleClip(clipId, viewerId) {
  const clip = await getClip(clipId);
  if (!clip) return null;

  const owner = await getUserById(clip.userId);
  if (!owner || owner.accountStatus !== "active") return null;
  if (String(owner._id) === String(viewerId)) return clip;

  const relations = await getUserRelations(viewerId);
  const blocked = new Set([
    ...(relations.blockedUsers || []),
    ...(relations.blockedByUsers || []),
  ].map(String));
  if (blocked.has(String(clip.userId))) return null;

  if (
    owner.ishidden &&
    !(relations.supporting || []).map(String).includes(String(clip.userId))
  ) {
    return null;
  }

  return clip;
}

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const { clipId } = await params;
    const { action } = await req.json();
    if (
      ![
        "view",
        "like",
        "share",
        "interested",
        "not_interested",
        "save",
      ].includes(action)
    ) {
      return jsonError("Invalid clip action", 400);
    }

    const visibleClip = await getVisibleClip(clipId, session.user.id);
    if (!visibleClip) return jsonError("Clip not found or not available to you", 404);

    if (action === "save") {
      const saved = await toggleSavedClip(session.user.id, clipId);
      return Response.json({ success: true, saved });
    }

    if (action === "like") {
      const engagement = await toggleClipLikeAtomic(clipId, session.user.id);
      const viewer = await getClipViewerEngagement(clipId, session.user.id);
      return Response.json({
        success: true,
        liked: engagement.liked,
        likesCount: engagement.likesCount,
        viewsCount: Number(visibleClip.viewsCount || visibleClip.views?.length || 0),
        shares: Number(visibleClip.shares || 0),
        viewed: viewer.viewed,
      });
    }

    if (action === "view") {
      const engagement = await recordClipViewAtomic(clipId, session.user.id);
      const viewer = await getClipViewerEngagement(clipId, session.user.id);
      return Response.json({
        success: true,
        liked: viewer.liked,
        likesCount: Number(visibleClip.likesCount || visibleClip.likes?.length || 0),
        viewsCount: engagement.viewsCount,
        shares: Number(visibleClip.shares || 0),
        viewed: true,
      });
    }

    if (action === "share") {
      const engagement = await incrementClipShareAtomic(clipId);
      const viewer = await getClipViewerEngagement(clipId, session.user.id);
      return Response.json({
        success: true,
        liked: viewer.liked,
        likesCount: Number(visibleClip.likesCount || visibleClip.likes?.length || 0),
        viewsCount: Number(visibleClip.viewsCount || visibleClip.views?.length || 0),
        shares: engagement.shares,
        viewed: viewer.viewed,
      });
    }

    const clip = await updateClip(clipId, session.user.id, action);
    if (!clip) return jsonError("Clip not found", 404);
    const viewer = await getClipViewerEngagement(clipId, session.user.id);

    return Response.json({
      success: true,
      liked: viewer.liked,
      likesCount: Number(clip.likesCount || clip.likes?.length || 0),
      viewsCount: Number(clip.viewsCount || clip.views?.length || 0),
      shares: Number(clip.shares || 0),
      preference: ["interested", "not_interested"].includes(action)
        ? action
        : undefined,
      viewed: viewer.viewed,
    });
  } catch (error) {
    console.error("Clip action error:", error);
    return jsonError("Unable to update clip", 500);
  }
}

export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const { clipId } = await params;
    const deleted = await deleteClip(clipId, session.user.id);
    if (!deleted) return jsonError("Clip not found or not owned by you", 404);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Clip delete error:", error);
    return jsonError("Unable to delete clip", 500);
  }
}
