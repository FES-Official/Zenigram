import { jsonError, jsonOk, isValidObjectId } from "@/app/lib/api";
import { getStory } from "@/app/lib/storyStore";
import { getReadableMediaUrl } from "@/app/lib/s3Storage";
import { getUserById, getUserRelations } from "@/app/lib/socialStore";
import { sanitizePublicUserRecord } from "@/app/lib/userSerialization";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const viewerId = await getAuthenticatedUserId(request);
    if (request.headers.get("authorization") && !viewerId) {
      return jsonError("Unauthorized", 401);
    }

    const { storyId } = await params;
    if (!isValidObjectId(storyId)) return jsonError("Invalid story", 400);

    const story = await getStory(storyId);
    if (!story || new Date(story.expiresAt).getTime() <= Date.now()) {
      return jsonError("Story not found or expired", 404);
    }

    const ownerId = String(story.userId || "");
    const [owner, relations] = await Promise.all([
      getUserById(ownerId),
      viewerId
        ? getUserRelations(viewerId)
        : Promise.resolve({ supporting: [], blockedUsers: [], blockedByUsers: [] }),
    ]);

    if (!owner || owner.accountStatus !== "active") return jsonError("Story not found", 404);

    const blocked = new Set([
      ...(relations.blockedUsers || []),
      ...(relations.blockedByUsers || []),
    ].map(String));
    const supporting = new Set((relations.supporting || []).map(String));
    if (viewerId !== ownerId && blocked.has(ownerId)) return jsonError("Story is unavailable", 403);
    if (owner.ishidden && viewerId !== ownerId && !supporting.has(ownerId)) {
      return jsonError("Story is private", 403);
    }

    const mediaUrl = await getReadableMediaUrl(story.mediaUrl, story.mediaKey);
    if (!mediaUrl) return jsonError("Story media unavailable", 404);

    return jsonOk({
      story: {
        ...story,
        mediaUrl,
        userId: sanitizePublicUserRecord(owner),
        viewerIsOwner: viewerId === ownerId,
      },
    });
  } catch (error) {
    console.error("Story detail error:", error);
    return jsonError("Unable to load story", 500);
  }
}
