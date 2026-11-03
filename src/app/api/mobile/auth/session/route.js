import { NextResponse } from "next/server";
import { getUserById } from "@/app/lib/socialStore";
import { verifyMobileAccessToken } from "@/app/lib/mobileAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const claims = await verifyMobileAccessToken(match[1]);
    if (!claims) {
      return NextResponse.json({ success: false, message: "Session expired. Please sign in again." }, { status: 401 });
    }

    const user = await getUserById(claims.userId);
    if (!user || user.accountStatus !== "active") {
      return NextResponse.json({ success: false, message: "This account is not available." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        username: user.username || "",
        fullname: user.fullname || "",
        email: user.email || "",
        profilePic: user.profilePic || "",
        ishidden: Boolean(user.ishidden),
      },
    });
  } catch (caught) {
    console.error("Mobile session lookup error:", caught);
    if (String(caught?.message || "").includes("ZENIGRAM_MOBILE_AUTH_SECRET")) {
      return NextResponse.json({ success: false, message: "Mobile sign-in is not configured on the server." }, { status: 503 });
    }
    return NextResponse.json({ success: false, message: "Unable to validate the session." }, { status: 500 });
  }
}
