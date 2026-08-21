import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { createStory, listStories } from "@/app/lib/storyStore";
import { verifyS3Object } from "@/app/lib/s3Storage";

function parseLocation(value) {
  const location = value && typeof value === "object" ? value : {};
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const body = await req.json();
    const mediaKey = normalizeString(body.mediaKey);
    const mediaType = normalizeString(body.mediaType) || "image";
    const caption = normalizeString(body.caption).slice(0, 500);
    const mentionedUserIds = Array.isArray(body.mentionedUserIds)
      ? [...new Set(body.mentionedUserIds.map(normalizeString).filter(Boolean))].slice(0, 10)
      : [];
    const location = parseLocation(body.location);
    if (!mediaKey || mediaType !== "image") return jsonError("Upload a story image first", 400);
    if (!location) return jsonError("Story location is required", 400);
    const media = await verifyS3Object(mediaKey, session.user.id);
    if (!media || !media.contentType.startsWith("image/")) return jsonError("Invalid story image", 400);
    const result = await createStory({
      userId: session.user.id,
      media,
      mediaType,
      location,
      realityScore: 0,
      realityLabel: "selected",
      duration: Math.min(Math.max(Number(body.duration) || 15, 5), 60),
      caption,
      mentionedUserIds,
      missionId: normalizeString(body.missionId),
      timeZone: normalizeString(body.timeZone) || "UTC",
    });
    if (!result) return jsonError("User not found", 404);
    return jsonOk(result, 201);
  } catch (error) {
    console.error("Story creation error:", error);
    return jsonError(error.message || "Failed to create story", 500);
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    return jsonOk({ stories: await listStories(session?.user?.id) });
  } catch (error) {
    console.error("Story fetch error:", error);
    return jsonError("Unable to load stories", 500);
  }
}
