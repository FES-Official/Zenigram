import { listStoryGlobe } from "@/app/lib/storyGlobeStore";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";

export async function GET(req) {
  try {
    const viewerId = await getAuthenticatedUserId(req);
    if (req.headers.get("authorization") && !viewerId) {
      return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") || "all";
    const limit = Number(url.searchParams.get("limit") || 80);
    const cursor = url.searchParams.get("cursor") || "";
    const result = await listStoryGlobe(viewerId || "", tab, limit, cursor);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Story globe feed error:", error);
    return Response.json({ success: false, error: "Unable to load story globe" }, { status: 500 });
  }
}
