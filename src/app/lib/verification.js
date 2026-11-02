import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  getDynamoDocumentClient,
  getDynamoTableName,
} from "@/app/lib/dynamodb";

const EMAIL_PURPOSE = "EMAIL_SIGNUP";
const PHONE_PURPOSE = "PHONE_UPDATE";
const OTP_TTL_SECONDS = 10 * 60;
const RESEND_WAIT_SECONDS = 60;
const MAX_EMAIL_ATTEMPTS = 5;

function client() {
  return getDynamoDocumentClient();
}

function table() {
  return getDynamoTableName();
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function stateKey(purpose, identifier) {
  return {
    PK: `VERIFICATION#${purpose}#${identifier}`,
    SK: "STATE",
  };
}

function verificationError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getOtpSecret() {
  const secret = process.env.OTP_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw verificationError(
      "OTP_SECRET or NEXTAUTH_SECRET must be configured.",
      "OTP_NOT_CONFIGURED",
    );
  }
  return secret;
}

function otpHash(purpose, identifier, code) {
  return createHash("sha256")
    .update(`${getOtpSecret()}:${purpose}:${identifier}:${code}`)
    .digest("hex");
}

function hashMatches(expected, actual) {
  if (typeof expected !== "string" || typeof actual !== "string") return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(actual, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readState(purpose, identifier) {
  const result = await client().send(
    new GetCommand({
      TableName: table(),
      Key: stateKey(purpose, identifier),
      ConsistentRead: true,
    }),
  );
  return result.Item || null;
}

async function reserveState(purpose, identifier, values) {
  const currentTime = nowSeconds();
  try {
    await client().send(
      new PutCommand({
        TableName: table(),
        Item: {
          ...stateKey(purpose, identifier),
          purpose,
          identifier,
          status: "pending",
          attempts: 0,
          createdAt: new Date().toISOString(),
          expiresAt: currentTime + OTP_TTL_SECONDS,
          ttl: currentTime + OTP_TTL_SECONDS,
          nextSendAt: currentTime + RESEND_WAIT_SECONDS,
          ...values,
        },
        ConditionExpression:
          "attribute_not_exists(PK) OR expiresAt <= :now OR (nextSendAt <= :now AND #status = :pending)",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":now": currentTime,
          ":pending": "pending",
        },
      }),
    );
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      throw verificationError(
        "Please wait 60 seconds before requesting another code.",
        "OTP_RATE_LIMITED",
      );
    }
    throw error;
  }
}

async function deleteStateIfMatches(purpose, identifier, expressionName, value) {
  try {
    await client().send(
      new DeleteCommand({
        TableName: table(),
        Key: stateKey(purpose, identifier),
        ConditionExpression: `${expressionName} = :value`,
        ExpressionAttributeNames: expressionName.startsWith("#")
          ? { [expressionName]: expressionName.slice(1) }
          : undefined,
        ExpressionAttributeValues: { ":value": value },
      }),
    );
  } catch {
    // A newer verification request may already have replaced this state.
  }
}

async function sendResendEmail(email, code) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw verificationError(
      "Email OTP is not configured. Add RESEND_API_KEY and EMAIL_FROM to the server environment.",
      "OTP_NOT_CONFIGURED",
    );
  }

  const safeCode = code.replace(/[&<>"]/g, "");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Your Zenigram verification code",
      text: `Your Zenigram verification code is ${code}. It expires in 10 minutes. Do not share this code with anyone.`,
      html: `<div style="font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:32px;border-radius:16px"><h1 style="color:#f87171;margin:0 0 16px">Zenigram</h1><p>Use this code to verify your email address:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#18181b;padding:18px;border-radius:12px;text-align:center">${safeCode}</div><p style="color:#a1a1aa">This code expires in 10 minutes. Never share it with anyone.</p></div>`,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Resend email delivery failed:", response.status, details.slice(0, 500));
    throw verificationError(
      "We could not send the verification email. Check your email provider configuration and try again.",
      "OTP_DELIVERY_FAILED",
    );
  }
}

export function normalizeOtpEmail(value) {
  const email = String(value || "").trim().normalize("NFKC").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function normalizeE164Phone(value) {
  const phone = String(value || "").trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : "";
}

export async function sendSignupEmailOtp(email) {
  const normalizedEmail = normalizeOtpEmail(email);
  if (!normalizedEmail) {
    throw verificationError("Enter a valid email address.", "OTP_INVALID_TARGET");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const digest = otpHash(EMAIL_PURPOSE, normalizedEmail, code);
  await reserveState(EMAIL_PURPOSE, normalizedEmail, { otpHash: digest });

  try {
    await sendResendEmail(normalizedEmail, code);
  } catch (error) {
    await deleteStateIfMatches(EMAIL_PURPOSE, normalizedEmail, "#otpHash", digest);
    throw error;
  }
}

export async function verifySignupEmailOtp(email, code) {
  const normalizedEmail = normalizeOtpEmail(email);
  const normalizedCode = String(code || "").trim();
  if (!normalizedEmail || !/^\d{6}$/.test(normalizedCode)) {
    throw verificationError("Enter the 6-digit code sent to your email.", "OTP_INVALID");
  }

  const state = await readState(EMAIL_PURPOSE, normalizedEmail);
  const now = nowSeconds();
  if (!state || state.status !== "pending" || Number(state.expiresAt) <= now) {
    throw verificationError("That code has expired. Request a new one.", "OTP_EXPIRED");
  }
  if (Number(state.attempts || 0) >= MAX_EMAIL_ATTEMPTS) {
    throw verificationError("Too many incorrect attempts. Request a new code.", "OTP_LOCKED");
  }

  const expected = otpHash(EMAIL_PURPOSE, normalizedEmail, normalizedCode);
  if (!hashMatches(state.otpHash, expected)) {
    await client().send(
      new UpdateCommand({
        TableName: table(),
        Key: stateKey(EMAIL_PURPOSE, normalizedEmail),
        UpdateExpression: "SET attempts = if_not_exists(attempts, :zero) + :one",
        ConditionExpression: "#status = :pending AND expiresAt > :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":zero": 0,
          ":one": 1,
          ":pending": "pending",
          ":now": now,
        },
      }),
    ).catch(() => {});
    throw verificationError("The verification code is incorrect.", "OTP_INVALID");
  }

  await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: stateKey(EMAIL_PURPOSE, normalizedEmail),
      UpdateExpression:
        "SET #status = :verified, verifiedAt = :verifiedAt, expiresAt = :expiresAt, ttl = :expiresAt REMOVE otpHash, attempts",
      ConditionExpression: "#status = :pending AND expiresAt > :now",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":verified": "verified",
        ":verifiedAt": new Date().toISOString(),
        ":expiresAt": now + OTP_TTL_SECONDS,
        ":pending": "pending",
        ":now": now,
      },
    }),
  );
}

export async function sendPhoneUpdateOtp(userId, phone) {
  const normalizedPhone = normalizeE164Phone(phone);
  if (!userId || !normalizedPhone) {
    throw verificationError(
      "Enter a valid phone number in international format, such as +919876543210.",
      "OTP_INVALID_TARGET",
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) {
    throw verificationError(
      "SMS verification is not configured. Add the Twilio Verify environment variables.",
      "OTP_NOT_CONFIGURED",
    );
  }

  const identifier = `${userId}#${normalizedPhone}`;
  const requestId = randomBytes(16).toString("hex");
  const accountRateId = randomBytes(16).toString("hex");
  await reserveState(PHONE_PURPOSE, identifier, {
    ownerId: String(userId),
    phone: normalizedPhone,
    requestId,
  });

  try {
    await reserveState("PHONE_UPDATE_RATE", String(userId), {
      requestId: accountRateId,
      ownerId: String(userId),
    });
  } catch (error) {
    await deleteStateIfMatches(PHONE_PURPOSE, identifier, "requestId", requestId);
    throw error;
  }

  try {
    const body = new URLSearchParams({
      To: normalizedPhone,
      Channel: "sms",
    });
    const response = await fetch(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/Verifications`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      console.error("Twilio SMS delivery failed:", response.status, details.slice(0, 500));
      throw verificationError(
        "We could not send the SMS code. Check the phone number and Twilio configuration.",
        "OTP_DELIVERY_FAILED",
      );
    }
  } catch (error) {
    await deleteStateIfMatches(PHONE_PURPOSE, identifier, "requestId", requestId);
    throw error;
  }
}

export async function verifyPhoneUpdateOtp(userId, phone, code) {
  const normalizedPhone = normalizeE164Phone(phone);
  const normalizedCode = String(code || "").trim();
  if (!userId || !normalizedPhone || !/^\d{4,10}$/.test(normalizedCode)) {
    throw verificationError("Enter the valid SMS verification code.", "OTP_INVALID");
  }

  const identifier = `${userId}#${normalizedPhone}`;
  const state = await readState(PHONE_PURPOSE, identifier);
  if (
    !state ||
    state.status !== "pending" ||
    state.ownerId !== String(userId) ||
    Number(state.expiresAt) <= nowSeconds()
  ) {
    throw verificationError("That SMS code has expired. Request a new one.", "OTP_EXPIRED");
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID?.trim();
  if (!accountSid || !authToken || !serviceSid) {
    throw verificationError("SMS verification is not configured.", "OTP_NOT_CONFIGURED");
  }

  const body = new URLSearchParams({
    To: normalizedPhone,
    Code: normalizedCode,
  });
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(serviceSid)}/VerificationCheck`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.status !== "approved") {
    throw verificationError("The SMS verification code is incorrect or expired.", "OTP_INVALID");
  }

  const now = nowSeconds();
  await client().send(
    new UpdateCommand({
      TableName: table(),
      Key: stateKey(PHONE_PURPOSE, identifier),
      UpdateExpression:
        "SET #status = :verified, verifiedAt = :verifiedAt, expiresAt = :expiresAt, ttl = :expiresAt REMOVE requestId, attempts",
      ConditionExpression: "#status = :pending AND expiresAt > :now AND ownerId = :ownerId",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":verified": "verified",
        ":verifiedAt": new Date().toISOString(),
        ":expiresAt": now + OTP_TTL_SECONDS,
        ":pending": "pending",
        ":now": now,
        ":ownerId": String(userId),
      },
    }),
  );
}

export async function hasVerifiedSignupEmail(email) {
  const normalizedEmail = normalizeOtpEmail(email);
  if (!normalizedEmail) return false;
  const state = await readState(EMAIL_PURPOSE, normalizedEmail);
  return Boolean(
    state &&
      state.status === "verified" &&
      Number(state.expiresAt) > nowSeconds(),
  );
}

export async function consumeVerifiedSignupEmail(email) {
  const normalizedEmail = normalizeOtpEmail(email);
  if (!normalizedEmail) return false;
  try {
    await client().send(
      new DeleteCommand({
        TableName: table(),
        Key: stateKey(EMAIL_PURPOSE, normalizedEmail),
        ConditionExpression: "#status = :verified AND expiresAt > :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":verified": "verified",
          ":now": nowSeconds(),
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function hasVerifiedPhoneUpdate(userId, phone) {
  const normalizedPhone = normalizeE164Phone(phone);
  if (!userId || !normalizedPhone) return false;
  const state = await readState(PHONE_PURPOSE, `${userId}#${normalizedPhone}`);
  return Boolean(
    state &&
      state.status === "verified" &&
      state.ownerId === String(userId) &&
      state.phone === normalizedPhone &&
      Number(state.expiresAt) > nowSeconds(),
  );
}

export async function consumeVerifiedPhoneUpdate(userId, phone) {
  const normalizedPhone = normalizeE164Phone(phone);
  if (!userId || !normalizedPhone) return false;
  try {
    await client().send(
      new DeleteCommand({
        TableName: table(),
        Key: stateKey(PHONE_PURPOSE, `${userId}#${normalizedPhone}`),
        ConditionExpression:
          "#status = :verified AND ownerId = :ownerId AND phone = :phone AND expiresAt > :now",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":verified": "verified",
          ":ownerId": String(userId),
          ":phone": normalizedPhone,
          ":now": nowSeconds(),
        },
      }),
    );
    return true;
  } catch {
    return false;
  }
}
