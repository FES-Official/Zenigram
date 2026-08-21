import { escapeRegex, jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { getUserRelations, searchUsers } from "@/app/lib/socialStore";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = normalizeString(searchParams.get("q")).slice(0, 50);
    if (!query) return jsonOk({ users: [] });

    const session = await getServerSession(authOptions);
    const [users, relations] = await Promise.all([
      searchUsers(query, 16),
      session?.user?.id
        ? getUserRelations(session.user.id)
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
          profilePic: user.profilePic,
        })),
    });
  } catch (error) {
    console.error("Search user error:", error);
    return jsonError("Failed to search users", 500);
  }
}
