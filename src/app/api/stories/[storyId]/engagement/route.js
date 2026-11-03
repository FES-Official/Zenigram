import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { engageStory } from "@/app/lib/storyStore";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";

export async function POST(req, { params }) {
  try {
    const userId = await getAuthenticatedUserId(req);
    if (!userId) return jsonError("Unauthorized", 401);
    const { storyId } = await params;
    const { action } = await req.json();
    if (!isValidObjectId(storyId) || !["view", "like"].includes(action)) return jsonError("Invalid story action", 400);
    const result = await engageStory(storyId, userId, action);
    if (!result) return jsonError("Story not found or expired", 404);
    return jsonOk(result);
  } catch (error) {
    console.error("Story engagement error:", error);
    return jsonError("Unable to update story", 500);
  }
}
