import { NextResponse } from "next/server";
import {
  normalizeOtpEmail,
  verifySignupEmailOtp,
} from "@/app/lib/verification";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = normalizeOtpEmail(body?.email);
    if (!email) {
      return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    }

    await verifySignupEmailOtp(email, body?.code);
    return NextResponse.json({ message: "Email verified successfully." });
  } catch (error) {
    const status =
      error?.code === "OTP_NOT_CONFIGURED" ? 503 :
      error?.code === "OTP_LOCKED" ? 429 : 400;
    return NextResponse.json(
      { message: error?.message || "Could not verify the code." },
      { status },
    );
  }
}
