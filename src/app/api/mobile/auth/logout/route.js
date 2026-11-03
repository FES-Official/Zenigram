import { NextResponse } from "next/server";
import { revokeMobileSession, verifyMobileAccessToken } from "@/app/lib/mobileAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
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
