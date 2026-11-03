import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getUserByIdentifier, getUserById, updateUser } from "@/app/lib/socialStore";
import { createMobileSession } from "@/app/lib/mobileAuth";
import { normalizeString } from "@/app/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function error(message, status) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function POST(request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return error("Invalid request body", 400);
    }

    const identifier = normalizeString(body?.identifier).toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!identifier || identifier.length > 254 || !password || password.length > 1024) {
      return error("Enter your username/email and password.", 400);
    }

    const user = await getUserByIdentifier(identifier);
    if (!user?.password || user.accountStatus !== "active") {
      return error("Invalid username/email or password.", 401);
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return error("Invalid username/email or password.", 401);

    const updated = await updateUser(user._id, { lastLogin: new Date().toISOString() });
    if (!updated || updated.accountStatus !== "active") {
      return error("This account is not available.", 403);
    }

    const safeUser = await getUserById(updated._id);
    if (!safeUser || safeUser.accountStatus !== "active") {
      return error("This account is not available.", 403);
    }

    const tokens = await createMobileSession(
      safeUser._id,
      normalizeString(request.headers.get("x-device-name")) || "Zenigram mobile",
    );

    return NextResponse.json({
      success: true,
      ...tokens,
      user: {
        id: String(safeUser._id),
        username: safeUser.username || "",
        fullname: safeUser.fullname || "",
        email: safeUser.email || "",
        profilePic: safeUser.profilePic || "",
      },
    });
  } catch (caught) {
    console.error("Mobile sign-in error:", caught);
    if (String(caught?.message || "").includes("ZENIGRAM_MOBILE_AUTH_SECRET")) {
      return error("Mobile sign-in is not configured on the server.", 503);
    }
    return error("Unable to sign in right now.", 500);
  }
}
