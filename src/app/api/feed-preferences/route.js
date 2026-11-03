import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/app/lib/requestAuth";
import { getUserById, updateUser } from "@/app/lib/socialStore";
import {
  applyFeedFeedback,
  normalizeFeedPreferences,
} from "@/app/lib/feedRanking";

async function getAuthenticatedUser(request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await getUserById(userId);
  if (!user) {
    return { error: NextResponse.json({ error: "User not found" }, { status: 404 }) };
  }

  return { user, userId: String(userId) };
}

export async function GET(request) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error) return auth.error;

    return NextResponse.json({
      preferences: normalizeFeedPreferences(auth.user.feedPreferences),
    });
  } catch (error) {
    console.error("Feed preferences GET error:", error);
    return NextResponse.json({ error: "Unable to load feed preferences." }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const preferences = normalizeFeedPreferences(body?.preferences || body);
    const updated = await updateUser(auth.userId, { feedPreferences: preferences });
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Feed preferences PUT error:", error);
    return NextResponse.json({ error: "Unable to save feed preferences." }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    if (
      body?.creatorId &&
      String(body.creatorId) === auth.userId &&
      ["muteCreator", "lessCreator"].includes(String(body.action || ""))
    ) {
      return NextResponse.json({ error: "You cannot hide your own posts from this control." }, { status: 400 });
    }

    let preferences;
    try {
      preferences = applyFeedFeedback(auth.user.feedPreferences, body);
    } catch (error) {
      return NextResponse.json({ error: error.message || "Invalid feed action." }, { status: 400 });
    }

    const updated = await updateUser(auth.userId, { feedPreferences: preferences });
    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Feed preferences PATCH error:", error);
    return NextResponse.json({ error: "Unable to update feed preferences." }, { status: 500 });
  }
}
