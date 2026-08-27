import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { listStoryGlobe } from "@/app/lib/storyGlobeStore";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") || "all";
    const limit = Number(url.searchParams.get("limit") || 80);
    const cursor = url.searchParams.get("cursor") || "";
    const result = await listStoryGlobe(session?.user?.id || "", tab, limit, cursor);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("Story globe feed error:", error);
    return Response.json({ success: false, error: "Unable to load story globe" }, { status: 500 });
  }
}
