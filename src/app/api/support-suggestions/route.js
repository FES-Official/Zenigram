import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk } from "@/app/lib/api";
import { listSupportSuggestions } from "@/app/lib/socialStore";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    return jsonOk({
      suggestions: await listSupportSuggestions(session.user.id, 5),
    });
  } catch (error) {
    console.error("Support suggestions error:", error);
    return jsonError("Unable to load suggestions", 500);
  }
}
