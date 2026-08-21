import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { isValidObjectId, jsonError, jsonOk } from "@/app/lib/api";
import { createInvitation, listInvitations, respondToInvitation } from "@/app/lib/storyStore";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    return jsonOk({ invitations: await listInvitations(session.user.id) });
  } catch (error) {
    console.error("Invitation fetch error:", error);
    return jsonError("Unable to load invitations", 500);
  }
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { eventId, recipientId } = await req.json();
    if (!isValidObjectId(eventId) || !isValidObjectId(recipientId) || recipientId === session.user.id) return jsonError("Invalid invitation", 400);
    const invitation = await createInvitation(eventId, session.user.id, recipientId);
    if (invitation?.forbidden) return jsonError("Only contributors can invite", 403);
    if (!invitation) return jsonError("Event or recipient not found", 404);
    return jsonOk({ invitation }, 201);
  } catch (error) {
    console.error("Invitation create error:", error);
    return jsonError("Unable to send invitation", 500);
  }
}

export async function PATCH(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const { invitationId, action } = await req.json();
    if (!invitationId || !["accept", "decline"].includes(action)) return jsonError("Invalid response", 400);
    const invitation = await respondToInvitation(session.user.id, invitationId, action);
    if (invitation?.expired) return jsonError("Event has expired", 410);
    if (!invitation) return jsonError("Invitation not found", 404);
    return jsonOk({ invitation });
  } catch (error) {
    console.error("Invitation response error:", error);
    return jsonError("Unable to respond to invitation", 500);
  }
}
