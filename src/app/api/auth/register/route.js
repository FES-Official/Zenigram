import bcrypt from "bcryptjs";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import {
  createUser,
  getUserByEmail,
  getUserByUsername,
} from "@/app/lib/socialStore";

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeUsername(value) {
  return normalizeString(value).toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidUsername(value) {
  return /^[a-z0-9._]{3,24}$/.test(value);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const fullname = normalizeString(body.fullname);
    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const dob = normalizeString(body.dob);
    const gender = normalizeString(body.gender);
    const mobile = normalizeString(body.mobile);

    if (!fullname || fullname.length > 80) {
      return jsonError("Enter your full name", 400);
    }

    if (!isValidUsername(username)) {
      return jsonError(
        "Username must be 3-24 characters and use only letters, numbers, dots, or underscores",
        400,
      );
    }

    if (!isValidEmail(email)) {
      return jsonError("Enter a valid email address", 400);
    }

    if (password.length < 6) {
      return jsonError("Password must be at least 6 characters", 400);
    }

    const [usernameUser, emailUser] = await Promise.all([
      getUserByUsername(username),
      getUserByEmail(email),
    ]);
    if (usernameUser) {
      return jsonError("That username is already taken", 409);
    }
    if (emailUser) {
      return jsonError("That email is already registered", 409);
    }

    const hashedPassword = await bcrypt.hash(password, 11);

    const user = await createUser({
      fullname,
      username,
      email,
      password: hashedPassword,
      authProvider: "credentials",
      DOB: dob,
      gender,
      mobile,
    });

    // A successful response must only be returned after the profile is
    // readable from DynamoDB. This also makes the immediate credentials login
    // deterministic after account creation.
    const persistedUser = await getUserByEmail(email);
    if (!persistedUser || persistedUser._id !== user._id) {
      throw new Error("DynamoDB user verification failed");
    }

    return jsonOk(
      {
        message: "Account created",
        user: {
          id: String(persistedUser._id),
          fullname: persistedUser.fullname,
          username: persistedUser.username,
          email: persistedUser.email,
        },
      },
      201,
    );
  } catch (error) {
    console.error("Registration error:", error);

    if (error?.name === "TransactionCanceledException") {
      return jsonError("Username or email already exists", 409);
    }

    return jsonError("Registration failed", 500);
  }
}
