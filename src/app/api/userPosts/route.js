import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  jsonError,
  normalizeString,
} from "@/app/lib/api";
import { NextResponse } from "next/server";
import {
  getUserById,
  getUserByUsername,
  getUserRelations,
  listUserPosts,
} from "@/app/lib/socialStore";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    const body = await req.json();
    const userId = normalizeString(body.userId);
    const username = normalizeString(body.username);
    if (!userId && !username) return jsonError("User is required", 400);
    const user = userId
      ? await getUserById(userId)
      : await getUserByUsername(username);
    if (!user) return jsonError("User not found", 404);

    const viewerId = session?.user?.id;
    const [relations, viewerRelations] = await Promise.all([
      getUserRelations(user._id),
      viewerId
        ? getUserRelations(viewerId)
        : Promise.resolve({ blockedUsers: [] }),
    ]);
    if (viewerId && viewerId !== String(user._id)) {
      const blocked =
        viewerRelations.blockedUsers.includes(String(user._id)) ||
        relations.blockedUsers.includes(viewerId);
      if (blocked) return jsonError("User not found", 404);
    }
    const canView =
      !user.ishidden ||
      viewerId === user._id.toString() ||
      relations.supporters.includes(viewerId);
    if (!canView) return jsonError("This account is hidden", 403);

    const posts = await listUserPosts(user._id, viewerId);
    return NextResponse.json(posts);
  } catch (error) {
    console.error("User posts error:", error);
    return jsonError("Failed to load posts", 500);
  }
}
