import { jsonError, jsonOk } from "@/app/lib/api";
import { listActiveMissions } from "@/app/lib/storyStore";

export async function GET() {
  try {
    return jsonOk({ missions: await listActiveMissions() });
  } catch (error) {
    console.error("Mission fetch error:", error);
    return jsonError("Unable to load missions", 500);
  }
}
