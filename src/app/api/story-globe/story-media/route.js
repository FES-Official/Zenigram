import { getServerSession } from "next-auth";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/lib/auth";
import { getStory } from "@/app/lib/storyStore";
import {
  getS3Client,
  getS3Config,
  getS3KeyFromUrl,
} from "@/app/lib/s3Storage";
import { getUserById, getUserRelations } from "@/app/lib/socialStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

function isAllowedStoryKey(value) {
  return (
    typeof value === "string" &&
    (value.startsWith("media/") || value.startsWith("images/stories/")) &&
    !value.includes("..") &&
    !value.includes("\\") &&
    !value.startsWith("/")
  );
}

function getStoryExpiry(story) {
  if (story?.expiresAt) return new Date(story.expiresAt).getTime();
  const createdAt = new Date(story?.createdAt || 0).getTime();
  return Number.isFinite(createdAt) ? createdAt + DAY_MS : 0;
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const storyId = url.searchParams.get("storyId") || "";
    if (!storyId) {
      return new Response("Missing storyId", { status: 400 });
    }

    const story = await getStory(storyId);
    if (!story || getStoryExpiry(story) <= Date.now()) {
      return new Response("Story not found or expired", { status: 404 });
    }

    const ownerId = String(story.userId || "");
    if (!ownerId) {
      return new Response("Story owner not found", { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const viewerId = String(session?.user?.id || "");
    const [owner, relations] = await Promise.all([
      getUserById(ownerId),
      viewerId
        ? getUserRelations(viewerId)
        : Promise.resolve({
            supporting: [],
            blockedUsers: [],
            blockedByUsers: [],
          }),
    ]);

    if (!owner || owner.accountStatus !== "active") {
      return new Response("Story owner not found", { status: 404 });
    }

    const blockedIds = new Set(
      [
        ...(relations.blockedUsers || []),
        ...(relations.blockedByUsers || []),
      ].map(String),
    );

    if (viewerId !== ownerId && blockedIds.has(ownerId)) {
      return new Response("Story is unavailable", { status: 403 });
    }

    const supportingIds = new Set(
      (relations.supporting || []).map(String),
    );
    if (
      owner.ishidden &&
      viewerId !== ownerId &&
      !supportingIds.has(ownerId)
    ) {
      return new Response("Story is private", { status: 403 });
    }

    const config = getS3Config();
    if (!config) {
      return new Response("Media storage is unavailable", { status: 503 });
    }

    const key =
      story.mediaKey ||
      getS3KeyFromUrl(story.mediaUrl, true);

    if (!isAllowedStoryKey(key)) {
      return new Response("Story media not found", { status: 404 });
    }

    const requestedRange = req.headers.get("range");
    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ...(requestedRange ? { Range: requestedRange } : {}),
      }),
    );

    if (!result.Body) {
      return new Response("Story media not found", { status: 404 });
    }

    const body = result.Body.transformToWebStream();
    const headers = new Headers({
      "Content-Type":
        result.ContentType ||
        (story.mediaType === "video" ? "video/mp4" : "image/jpeg"),
      "Cache-Control": "private, max-age=180",
      "Accept-Ranges": "bytes",
      "X-Content-Type-Options": "nosniff",
    });

    if (result.ContentLength != null) {
      headers.set("Content-Length", String(result.ContentLength));
    }
    if (result.ContentRange) {
      headers.set("Content-Range", result.ContentRange);
    }
    if (result.ETag) {
      headers.set("ETag", result.ETag);
    }

    return new Response(body, {
      status: result.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.name === "NotFound") {
      return new Response("Story media not found", { status: 404 });
    }

    console.error("Story globe media error:", error);
    return new Response("Unable to load story media", { status: 500 });
  }
}
