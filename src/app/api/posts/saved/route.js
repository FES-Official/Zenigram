import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { getUserById, listSavedPosts } from "@/app/lib/socialStore";

function jsonOk(data = {}, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const user = await getUserById(session.user.id);

    if (!user) return jsonError("User not found", 404);
    return jsonOk({ posts: await listSavedPosts(session.user.id) });
  } catch (error) {
    console.error("Saved posts fetch error:", error);
    return jsonError("Failed to load saved posts", 500);
  }
}
