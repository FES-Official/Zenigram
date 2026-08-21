import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import {
  deleteAccountPermanently,
  updateUser,
} from "@/app/lib/socialStore";

function jsonOk(data = {}, status = 200) {
  return Response.json({ success: true, ...data }, { status });
}

function jsonError(message, status = 400) {
  return Response.json({ success: false, message }, { status });
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);

    const { action, confirmation } = await req.json();
    if (!["activate", "deactivate", "permanent_delete"].includes(action)) {
      return jsonError("Invalid account action", 400);
    }

    if (action === "permanent_delete") {
      if (confirmation !== "DELETE") {
        return jsonError('Type "DELETE" to confirm permanent deletion', 400);
      }
      const deleted = await deleteAccountPermanently(session.user.id);
      if (!deleted) return jsonError("User not found", 404);
      return jsonOk(deleted);
    }

    const update =
      action === "activate"
        ? { accountStatus: "active", deactivatedAt: null, deleteRequestedAt: null }
        : { accountStatus: "deactivated", deactivatedAt: new Date().toISOString() };

    const user = await updateUser(session.user.id, update);

    if (!user) return jsonError("User not found", 404);
    return jsonOk({ accountStatus: user.accountStatus });
  } catch (error) {
    console.error("Account status error:", error);
    return jsonError("Failed to update account", 500);
  }
}
