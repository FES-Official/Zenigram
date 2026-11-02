import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/lib/auth";
import {
  normalizeE164Phone,
  verifyPhoneUpdateOtp,
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
      return NextResponse.json({ message: "Enter a valid phone number in international format." }, { status: 400 });
    }

    await verifyPhoneUpdateOtp(session.user.id, phone, body?.code);
    return NextResponse.json({ message: "Phone number verified successfully." });
  } catch (error) {
    const status = error?.code === "OTP_NOT_CONFIGURED" ? 503 : 400;
    return NextResponse.json(
      { message: error?.message || "Could not verify the SMS code." },
      { status },
    );
  }
}
