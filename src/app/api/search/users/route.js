import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { getUserRelations, searchUsers } from "@/app/lib/socialStore";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = normalizeString(searchParams.get("q")).slice(0, 50);
    if (!query) return jsonOk({ users: [] });

    const viewerId = await getAuthenticatedUserId(req);
    const [users, relations] = await Promise.all([
      searchUsers(query, 16),
      viewerId
        ? getUserRelations(viewerId)
        : Promise.resolve({ blockedUsers: [], blockedByUsers: [] }),
    ]);
    return jsonOk({
      users: users
        .filter(
          (user) =>
            !relations.blockedUsers.includes(user._id) &&
            !relations.blockedByUsers.includes(user._id),
        )
        .slice(0, 8)
        .map((user) => ({
          _id: user._id,
          username: user.username,
          fullname: user.fullname || "",
          profilePic: user.profilePic || "",
          ishidden: Boolean(user.ishidden),
        })),
    });
  } catch (error) {
    console.error("Search user error:", error);
    return jsonError("Failed to search users", 500);
  }
}
