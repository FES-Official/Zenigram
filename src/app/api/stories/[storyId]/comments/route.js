import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isValidObjectId, jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { addStoryComment, listStoryComments, toggleStoryCommentLike } from "@/app/lib/storyStore";

export async function GET(req, { params }) {
  try {
    const { storyId } = await params;
    if (!isValidObjectId(storyId)) return jsonError("Invalid story", 400);
    const session = await getServerSession(authOptions);
    return jsonOk({ comments: await listStoryComments(storyId, session?.user?.id || "") });
  } catch (error) {
    console.error("Story comments fetch error:", error);
    return jsonError("Unable to load comments", 500);
  }
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { storyId } = await params;
    const { text, parentId } = await req.json();
    const cleanText = normalizeString(text);
    if (!isValidObjectId(storyId) || !cleanText || cleanText.length > 500) return jsonError("Invalid comment", 400);
    const comment = await addStoryComment(storyId, session.user.id, cleanText, String(parentId || "") || null);
    if (!comment) return jsonError("Story not found", 404);
    return jsonOk({ comment }, 201);
  } catch (error) {
    console.error("Story comment error:", error);
    return jsonError("Unable to add comment", 500);
  }
}

export async function PATCH(req, { params }) {
  try { const session = await getServerSession(authOptions); if (!session?.user?.id) return jsonError("Unauthorized", 401); const { storyId } = await params; const { commentId, action } = await req.json(); if (!isValidObjectId(storyId) || action !== "like" || !commentId) return jsonError("Invalid comment action", 400); const comment = await toggleStoryCommentLike(storyId, String(commentId), session.user.id); if (!comment) return jsonError("Comment not found", 404); return jsonOk({ comment }); } catch { return jsonError("Unable to update comment", 500); }
}
