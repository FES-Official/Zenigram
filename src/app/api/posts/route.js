import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { verifyS3Object } from "@/app/lib/s3Storage";
import { createPost, getUserById } from "@/app/lib/socialStore";
import { listVisiblePosts, setContentAudience } from "@/app/lib/audienceStore";

const MAX_IMAGES_PER_POST = 10;
const PRESENTATIONS = new Set(["single", "carousel", "grid"]);
const CAROUSEL_STYLES = new Set(["classic", "fade", "stack", "filmstrip", "zoom", "flip", "cube"]);
const GRID_LAYOUTS = new Set(["tiles", "hero", "columns", "strips"]);
const ASPECT_RATIOS = new Set(["square", "portrait", "landscape"]);

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const user = await getUserById(session.user.id);
    if (!user) return jsonError("User not found", 404);

    const body = await req.json();
    const caption = normalizeString(body.caption);
    const presentation = PRESENTATIONS.has(body.presentation) ? body.presentation : "single";
    const carouselStyle = CAROUSEL_STYLES.has(body.carouselStyle) ? body.carouselStyle : "classic";
    const gridLayout = GRID_LAYOUTS.has(body.gridLayout) ? body.gridLayout : "";
    const aspectRatio = ASPECT_RATIOS.has(body.aspectRatio) ? body.aspectRatio : "square";
    const requestedMedia = Array.isArray(body.mediaItems) ? body.mediaItems.slice(0, MAX_IMAGES_PER_POST) : [];
    const store = await cookies();
    const cookieAudience = store.get("zenigram_post_audience")?.value === "close";
    const closeOnesOnly = body.closeOnesOnly === true || cookieAudience;

    if (!caption || caption.length > 2200) return jsonError("Caption required", 400);
    if (!requestedMedia.length) return jsonError("Media is required", 400);

    const verified = await Promise.all(requestedMedia.map((item) => verifyS3Object(item.key, session.user.id)));
    if (verified.some((item) => !item)) return jsonError("One or more S3 objects could not be verified", 400);
    const mediaItems = verified.map((item, index) => {
      const type = requestedMedia[index].type;
      const matches = (type === "image" && item.contentType.startsWith("image/")) || (type === "video" && item.contentType.startsWith("video/"));
      if (!matches) throw new Error("Uploaded media type does not match");
      return { key: item.key, url: item.url, type, provider: "s3" };
    });

    const newPost = await createPost({ userId: user._id, mediaItems, caption, presentation, carouselStyle, gridLayout, aspectRatio });
    const post = await setContentAudience("post", newPost._id, user._id, closeOnesOnly);
    store.delete("zenigram_post_audience");

    return jsonOk({ message: "Post uploaded", post: post || { ...newPost, closeOnesOnly } }, 201);
  } catch (error) {
    console.error("POST CREATE ERROR:", error);
    return jsonError("Failed to upload post", 500);
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const post = await listVisiblePosts(session.user.id);
    return NextResponse.json({ post }, { status: 200 });
  } catch (err) {
    console.error("Posts fetch error:", err);
    return NextResponse.json({ error: "Database connection failed", message: err.message }, { status: 500 });
  }
}
