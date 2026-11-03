import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { createStory } from "@/app/lib/storyStore";
import { listStoryGlobeFeed } from "@/app/lib/storyFeeds";
import { verifyS3Object } from "@/app/lib/s3Storage";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";

function parseLocation(value) {
  const location = value && typeof value === "object" ? value : {};
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return {
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
  };
}

export async function POST(req) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);

    const body = await req.json();
    const mediaKey = normalizeString(body.mediaKey);
    const mediaType = normalizeString(body.mediaType) || "image";
    const caption = normalizeString(body.caption).slice(0, 500);
    const mentionedUserIds = Array.isArray(body.mentionedUserIds)
      ? [...new Set(body.mentionedUserIds.map(normalizeString).filter(Boolean))].slice(0, 10)
      : [];
    const location = parseLocation(body.location);

    if (!mediaKey || mediaType !== "image") {
      return jsonError("Upload a story image first", 400);
    }

    if (!location) {
      return jsonError("Valid story latitude and longitude are required", 400);
    }

    const media = await verifyS3Object(mediaKey, userId);
    if (!media || !media.contentType.startsWith("image/")) {
      return jsonError("Invalid story image", 400);
    }

    const selectedLocation = {
      ...location,
      source: "coordinates",
      verified: false,
    };

    const result = await createStory({
      userId: userId,
      media,
      mediaType,
      location: selectedLocation,
      realityScore: 0,
      realityLabel: "coordinate_selected",
      duration: Math.min(Math.max(Number(body.duration) || 15, 5), 60),
      caption,
      mentionedUserIds,
      missionId: normalizeString(body.missionId),
      timeZone: normalizeString(body.timeZone) || "UTC",
    });
    if (!result) return jsonError("User not found", 404);

    return jsonOk(
      {
        ...result,
        locationSource: "coordinates",
        locationVerified: false,
      },
      201,
    );
  } catch (error) {
    console.error("Story creation error:", error);
    return jsonError(error.message || "Failed to create story", 500);
  }
}

export async function GET(req) {
  try {
    const viewerId = await getAuthenticatedUserId(req);
    if (req.headers.get("authorization") && !viewerId) return jsonError("Unauthorized", 401);
    const url = new URL(req.url);
    const tab = normalizeString(url.searchParams.get("tab")) || "all";
    const limit = Number(url.searchParams.get("limit") || 50);
    const cursor = normalizeString(url.searchParams.get("cursor")) || null;
    const result = await listStoryGlobeFeed({
      viewerId: viewerId || null,
      tab,
      limit,
      cursor,
    });
    return jsonOk(result);
  } catch (error) {
    console.error("Story fetch error:", error);
    return jsonError("Unable to load stories", 500);
  }
}
