import { getServerSession } from "next-auth";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { authOptions } from "@/app/lib/auth";
import { getStory } from "@/app/lib/storyStore";
import {
  getS3Client,
  getS3Config,
} from "@/app/lib/s3Storage";
import { getUserById, getUserRelations } from "@/app/lib/socialStore";

export const runtime = "nodejs";

function isObjectKey(value) {
  return (
    typeof value === "string" &&
    value.startsWith("media/") &&
    !value.includes("..") &&
    !value.includes("\\")
  );
}

export async function GET(req) {
  try {
    const storyId = new URL(req.url).searchParams.get("storyId") || "";
    if (!storyId) {
      return new Response("Missing storyId", { status: 400 });
    }

    const story = await getStory(storyId);
    if (!story || new Date(story.expiresAt).getTime() <= Date.now()) {
      return new Response("Story not found", { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const viewerId = String(session?.user?.id || "");
    const ownerId = String(story.userId || "");

    const relations = viewerId
      ? await getUserRelations(viewerId)
      : {
          supporting: [],
          blockedUsers: [],
          blockedByUsers: [],
        };

    const blocked = new Set(
      [
        ...(relations.blockedUsers || []),
        ...(relations.blockedByUsers || []),
      ].map(String),
    );

    if (viewerId && viewerId !== ownerId && blocked.has(ownerId)) {
      return new Response("Forbidden", { status: 403 });
    }

    const owner = await getUserById(ownerId);
    if (!owner) {
      return new Response("User not found", { status: 404 });
    }

    const supporting = new Set((relations.supporting || []).map(String));
    if (
      owner.ishidden &&
      viewerId !== ownerId &&
      !supporting.has(ownerId)
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const config = getS3Config();
    const key = owner.profilePicKey || "";

    if (!config || !isObjectKey(key)) {
      return new Response("Profile image not available", { status: 404 });
    }

    const result = await getS3Client().send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );

    if (!result.Body) {
      return new Response("Profile image not available", { status: 404 });
    }

    const bytes = await result.Body.transformToByteArray();

    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": result.ContentType || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    console.error("Story globe profile image error:", error);
    return new Response("Unable to load profile image", { status: 500 });
  }
}
