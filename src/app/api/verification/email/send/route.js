import { NextResponse } from "next/server";
import { getUserByEmail } from "@/app/lib/socialStore";
import {
  normalizeOtpEmail,
  sendSignupEmailOtp,
} from "@/app/lib/verification";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const email = normalizeOtpEmail(body?.email);
    if (!email) {
      return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    }

    if (await getUserByEmail(email)) {
      return NextResponse.json({ message: "That email is already registered. Log in instead." }, { status: 409 });
    }

    await sendSignupEmailOtp(email);
    return NextResponse.json({ message: "A verification code has been sent to your email." });
  } catch (error) {
    const status =
      error?.code === "OTP_RATE_LIMITED" ? 429 :
      error?.code === "OTP_NOT_CONFIGURED" ? 503 :
      error?.code === "OTP_DELIVERY_FAILED" ? 502 : 400;
    return NextResponse.json(
      { message: error?.message || "Could not send the verification code." },
      { status },
    );
  }
}
