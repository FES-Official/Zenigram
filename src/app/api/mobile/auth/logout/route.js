import { NextResponse } from "next/server";
import {
  revokeMobileRefreshSession,
  revokeMobileSession,
  verifyMobileAccessToken,
} from "@/app/lib/mobileAuth";
import { normalizeString } from "@/app/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    let body = {};
    try {
      body = await request.json();
    } catch {
      // Logout remains available to callers that only have a valid access token.
    }

    const refreshToken = normalizeString(body?.refreshToken);
    if (refreshToken) {
      const revoked = await revokeMobileRefreshSession(refreshToken);
      return NextResponse.json({ success: true, revoked });
    }

    const authorization = request.headers.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return NextResponse.json({ success: true, revoked: false });
    }

    const claims = await verifyMobileAccessToken(match[1]);
    if (!claims) {
      return NextResponse.json({ success: true, revoked: false });
    }

    const revoked = await revokeMobileSession(claims.sessionId, claims.userId);
    return NextResponse.json({ success: true, revoked });
  } catch (caught) {
    console.error("Mobile sign-out error:", caught);
    return NextResponse.json({ success: false, message: "Unable to sign out on the server." }, { status: 500 });
  }
}
