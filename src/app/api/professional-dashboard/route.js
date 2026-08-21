import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { getProfessionalDashboard } from "@/app/lib/socialStore";

export async function GET(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const days = new URL(req.url).searchParams.get("days");
    const dashboard = await getProfessionalDashboard(session.user.id, days);
    if (!dashboard) return jsonError("User not found", 404);
    return jsonOk({ dashboard });
  } catch (error) {
    console.error("Professional dashboard error:", error);
    return jsonError("Unable to load professional dashboard", 500);
  }
}
