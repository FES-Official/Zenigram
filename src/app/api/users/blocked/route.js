import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { getUserRelations, getUsersByIds } from "@/app/lib/socialStore";

export async function GET(request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) return jsonError("Unauthorized", 401);

    const relations = await getUserRelations(userId);
    const blockedUsers = await getUsersByIds(relations.blockedUsers || []);

    return jsonOk({
      users: blockedUsers.map((user) => ({
        _id: String(user._id),
        username: user.username || "",
        fullname: user.fullname || "",
        profilePic: user.profilePic || "",
      })),
    });
  } catch (error) {
    console.error("Blocked accounts error:", error);
    return jsonError("Unable to load blocked accounts", 500);
  }
}
