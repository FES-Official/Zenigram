import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { deleteClip, getClip, getUserById, getUserRelations, toggleSavedClip, updateClip } from "@/app/lib/socialStore";

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

  if (owner.ishidden && !(relations.supporting || []).map(String).includes(String(clip.userId))) {
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
    if (!["view", "like", "share", "interested", "not_interested", "save"].includes(action)) {
      return jsonError("Invalid clip action", 400);
    }

    const visibleClip = await getVisibleClip(clipId, session.user.id);
    if (!visibleClip) return jsonError("Clip not found or not available to you", 404);

    if (action === "save") {
      const saved = await toggleSavedClip(session.user.id, clipId);
      return Response.json({ success: true, saved });
    }

    const clip = await updateClip(clipId, session.user.id, action);
    if (!clip) return jsonError("Clip not found", 404);

    return Response.json({
      success: true,
      liked: clip.likes.includes(session.user.id),
      likesCount: clip.likes.length,
      viewsCount: clip.views.length,
      shares: clip.shares,
      preference: ["interested", "not_interested"].includes(action) ? action : undefined,
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
