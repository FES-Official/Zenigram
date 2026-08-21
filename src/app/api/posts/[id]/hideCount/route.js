import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { setPostHideCount } from "@/app/lib/socialStore";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";

export async function POST(_req, { params }) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    if (!isValidObjectId(id)) return jsonError("Invalid post", 400);

    const hideCount = await setPostHideCount(id, session.user.id);
    if (hideCount === null) return jsonError("Post not found", 404);
    return jsonOk({ hideCount });
  } catch (error) {
    console.error("Toggle count error:", error);
    return jsonError("Failed to update count visibility", 500);
  }
}
