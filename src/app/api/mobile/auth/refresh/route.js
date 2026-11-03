import { NextResponse } from "next/server";
import { getUserById } from "@/app/lib/socialStore";
import { rotateMobileRefreshToken } from "@/app/lib/mobileAuth";
import { normalizeString } from "@/app/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    }

    const refreshToken = normalizeString(body?.refreshToken);
    if (!refreshToken) {
      return NextResponse.json({ success: false, message: "Refresh token required" }, { status: 400 });
    }

    const tokens = await rotateMobileRefreshToken(refreshToken);
    if (!tokens) {
      return NextResponse.json({ success: false, message: "Session expired. Please sign in again." }, { status: 401 });
    }

    const user = await getUserById(tokens.userId);
    if (!user || user.accountStatus !== "active") {
      return NextResponse.json({ success: false, message: "This account is not available." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenType: tokens.tokenType,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: {
        id: String(user._id),
        username: user.username || "",
        fullname: user.fullname || "",
        email: user.email || "",
        profilePic: user.profilePic || "",
      },
    });
  } catch (caught) {
    console.error("Mobile token refresh error:", caught);
    if (String(caught?.message || "").includes("ZENIGRAM_MOBILE_AUTH_SECRET")) {
      return NextResponse.json({ success: false, message: "Mobile sign-in is not configured on the server." }, { status: 503 });
    }
    return NextResponse.json({ success: false, message: "Unable to refresh the session." }, { status: 500 });
  }
}
