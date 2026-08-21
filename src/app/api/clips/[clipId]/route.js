import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { deleteClip, getClip, toggleSavedClip, updateClip } from "@/app/lib/socialStore";

export async function PATCH(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { clipId } = await params;
    const { action } = await req.json();
    if (!["view", "like", "share", "interested", "not_interested", "save"].includes(action)) {
      return Response.json({ success: false, message: "Invalid clip action" }, { status: 400 });
    }
    if (action === "save") {
      const clip = await getClip(clipId);
      if (!clip) return Response.json({ success: false, message: "Clip not found" }, { status: 404 });
      const saved = await toggleSavedClip(session.user.id, clipId);
      return Response.json({ success: true, saved });
    }
    const clip = await updateClip(clipId, session.user.id, action);
    if (!clip) {
      return Response.json({ success: false, message: "Clip not found" }, { status: 404 });
    }
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
    return Response.json({ success: false, message: "Unable to update clip" }, { status: 500 });
  }
}

export async function DELETE(_req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    const { clipId } = await params;
    const deleted = await deleteClip(clipId, session.user.id);
    if (!deleted) {
      return Response.json({ success: false, message: "Clip not found or not owned by you" }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (error) {
    console.error("Clip delete error:", error);
    return Response.json({ success: false, message: "Unable to delete clip" }, { status: 500 });
  }
}
