import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { listSupportSuggestions } from "@/app/lib/socialStore";

export async function GET(request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) return jsonError("Unauthorized", 401);
    return jsonOk({
      suggestions: await listSupportSuggestions(userId, 5),
    });
  } catch (error) {
    console.error("Support suggestions error:", error);
    return jsonError("Unable to load suggestions", 500);
  }
}
