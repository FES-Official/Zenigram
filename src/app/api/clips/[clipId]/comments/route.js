import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { normalizeString } from "@/app/lib/api";
import { canViewContent } from "@/app/lib/audienceStore";
import { addClipComment, getClip, getUserById, getUserRelations, listClipComments, toggleClipCommentLike } from "@/app/lib/socialStore";

function jsonError(message, status = 400) { return Response.json({ success: false, message }, { status }); }

async function canAccessClip(clip, viewerId) {
  if (!clip || (clip.renderStatus && clip.renderStatus !== "ready")) return false;
  const owner = await getUserById(clip.userId);
  if (!owner || owner.accountStatus !== "active") return false;
  if (!viewerId) return !owner.ishidden && !clip.closeOnesOnly;
  const relations = await getUserRelations(viewerId);
  return canViewContent(clip, viewerId, owner, relations);
}

export async function GET(request, { params }) {
  try {
    const viewerId = await getAuthenticatedUserId(request);
    if (request.headers.get("authorization") && !viewerId) return jsonError("Unauthorized", 401);
    const { clipId } = await params;
    const clip = await getClip(clipId);
    if (!clip) return jsonError("Clip not found", 404);
    if (!(await canAccessClip(clip, viewerId))) return jsonError("Clip not found", 404);
    return Response.json({ success: true, comments: await listClipComments(clipId, viewerId || "") });
  } catch (error) { console.error("Clip comments fetch error:", error); return jsonError("Unable to load comments", 500); }
}

export async function POST(req, { params }) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const { clipId } = await params;
    const { text, parentId } = await req.json();
    const cleanText = normalizeString(text);
    if (!cleanText || cleanText.length > 500) return jsonError("Write a comment up to 500 characters", 400);
    const clip = await getClip(clipId);
    if (!clip || !(await canAccessClip(clip, userId))) return jsonError("Clip not found", 404);
    const comment = await addClipComment(clipId, userId, cleanText, String(parentId || "") || null);
    if (!comment) return jsonError("Clip not found", 404);
    return Response.json({ success: true, comment }, { status: 201 });
  } catch (error) { console.error("Clip comment error:", error); return jsonError("Unable to add comment", 500); }
}

export async function PATCH(req, { params }) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const { clipId } = await params;
    const { commentId, action } = await req.json();
    if (action !== "like" || !commentId) return jsonError("Invalid comment action", 400);
    const clip = await getClip(clipId);
    if (!clip || !(await canAccessClip(clip, userId))) return jsonError("Clip not found", 404);
    const comment = await toggleClipCommentLike(clipId, String(commentId), userId);
    if (!comment) return jsonError("Comment not found", 404);
    return Response.json({ success: true, comment });
  } catch { return jsonError("Unable to update comment", 500); }
}
