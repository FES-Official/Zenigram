import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { createStory } from "@/app/lib/storyStore";
import { listStoryGlobeFeed } from "@/app/lib/storyFeeds";
import { verifyS3Object } from "@/app/lib/s3Storage";

function parseLocation(value) {
  const location = value && typeof value === "object" ? value : {};
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
}

function parseMapsCoordinates(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const direct = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (direct) {
    const lat = Number(direct[1]);
    const lng = Number(direct[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) }
      : null;
  }

  let url;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  const googleHost = host === "google.com" || host.endsWith(".google.com") || host === "google.co.in" || host.endsWith(".google.co.in");
  if (!googleHost) return null;

  const query = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("center");
  const queryMatch = query?.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (queryMatch) {
    const lat = Number(queryMatch[1]);
    const lng = Number(queryMatch[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }

  for (const pattern of [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ]) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }
  return null;
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
    const mapsUrl = normalizeString(body.location?.googleMapsUrl);
    const locationSource = normalizeString(body.location?.source);
    const verified = body.location?.verified === true;

    if (!mediaKey || mediaType !== "image") return jsonError("Upload a story image first", 400);
    if (!location) return jsonError("Story location is required", 400);
    if (!verified || locationSource !== "google_maps_manual" || !mapsUrl) {
      return jsonError("Story location must be verified manually with Google Maps", 400);
    }

    const mapsCoordinates = parseMapsCoordinates(mapsUrl);
    if (!mapsCoordinates || mapsCoordinates.lat !== location.lat || mapsCoordinates.lng !== location.lng) {
      return jsonError("Google Maps coordinates do not match the selected story location", 400);
    }

    const media = await verifyS3Object(mediaKey, session.user.id);
    if (!media || !media.contentType.startsWith("image/")) return jsonError("Invalid story image", 400);
    if (media.size > 25 * 1024 * 1024) return jsonError("Story image is too large", 400);

    const verifiedLocation = {
      ...location,
      source: "google_maps_manual",
      verified: true,
      googleMapsUrl: mapsUrl,
    };

    const result = await createStory({
      userId: session.user.id,
      media,
      mediaType,
      location: verifiedLocation,
      realityScore: 0,
      realityLabel: "google_maps_selected",
      duration: Math.min(Math.max(Number(body.duration) || 15, 5), 60),
      caption,
      mentionedUserIds,
      missionId: normalizeString(body.missionId),
      timeZone: normalizeString(body.timeZone) || "UTC",
    });
    if (!result) return jsonError("User not found", 404);

    return jsonOk({
      ...result,
      locationSource: "google_maps_manual",
      locationVerified: true,
      googleMapsUrl: mapsUrl,
    }, 201);
  } catch (error) {
    console.error("Story creation error:", error);
    return jsonError("Failed to create story", 500);
  }
}

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const url = new URL(req.url);
    const tab = normalizeString(url.searchParams.get("tab")) || "all";
    const rawLimit = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 100) : 50;
    const cursor = normalizeString(url.searchParams.get("cursor")) || null;
    const result = await listStoryGlobeFeed({ viewerId: session?.user?.id || null, tab, limit, cursor });
    return jsonOk(result);
  } catch (error) {
    console.error("Story fetch error:", error);
    return jsonError("Unable to load stories", 500);
  }
}
