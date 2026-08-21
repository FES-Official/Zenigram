import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { getUserTrail } from "@/app/lib/storyStore";

export async function GET(req, { params }) {
  try {
    const session = await getServerSession(authOptions);
    const { userId } = await params;
    const trail = await getUserTrail(userId, session?.user?.id);
    if (trail?.hidden) return jsonError("This account is hidden", 403);
    if (!trail) return jsonError("User not found", 404);
    return jsonOk(trail);
  } catch (error) {
    console.error("Trail fetch error:", error);
    return jsonError("Unable to load trail", 500);
  }
}
