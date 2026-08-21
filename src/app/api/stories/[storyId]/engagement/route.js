import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { engageStory } from "@/app/lib/storyStore";

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { storyId } = await params;
    const { action } = await req.json();
    if (!isValidObjectId(storyId) || !["view", "like"].includes(action)) return jsonError("Invalid story action", 400);
    const result = await engageStory(storyId, session.user.id, action);
    if (!result) return jsonError("Story not found or expired", 404);
    return jsonOk(result);
  } catch (error) {
    console.error("Story engagement error:", error);
    return jsonError("Unable to update story", 500);
  }
}
