import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import {
  normalizeE164Phone,
  sendPhoneUpdateOtp,
} from "@/app/lib/verification";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "Please log in to verify a phone number." }, { status: 401 });
    }

    const body = await request.json();
    const phone = normalizeE164Phone(body?.phone);
    if (!phone) {
      return NextResponse.json(
        { message: "Use international format, for example +919876543210." },
        { status: 400 },
      );
    }

    await sendPhoneUpdateOtp(session.user.id, phone);
    return NextResponse.json({ message: "An SMS verification code has been sent." });
  } catch (error) {
    const status =
      error?.code === "OTP_RATE_LIMITED" ? 429 :
      error?.code === "OTP_NOT_CONFIGURED" ? 503 :
      error?.code === "OTP_DELIVERY_FAILED" ? 502 : 400;
    return NextResponse.json(
      { message: error?.message || "Could not send the SMS code." },
      { status },
    );
  }
}
