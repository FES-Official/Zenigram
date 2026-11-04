import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { connect as tlsConnect } from "node:tls";
import { createInterface } from "node:readline";
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

async function sendSmtpEmail(email, code) {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.EMAIL_FROM?.trim() || user;
  if (!host || port !== 465 || !user || !pass || !from) {
    throw verificationError(
      "Configure SMTP_HOST, SMTP_USER, SMTP_PASSWORD and EMAIL_FROM. Use implicit TLS on SMTP_PORT=465.",
      "OTP_NOT_CONFIGURED",
    );
  }

  const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true });
  const lines = createInterface({ input: socket });
  const iterator = lines[Symbol.asyncIterator]();
  const readReply = async () => {
    const reply = [];
    while (true) {
      const item = await iterator.next();
      if (item.done) throw new Error("SMTP connection closed unexpectedly.");
      reply.push(item.value);
      if (/^\d{3} /.test(item.value)) break;
      if (!/^\d{3}-/.test(item.value)) throw new Error("Invalid SMTP server response.");
    }
    return reply;
  };
  const command = async (value, accepted) => {
    socket.write(value + "\r\n");
    const reply = await readReply();
    const status = Number(reply[reply.length - 1].slice(0, 3));
    if (!accepted.includes(status)) throw new Error(`SMTP command failed (${status}).`);
    return reply;
  };

  try {
    await new Promise((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
      socket.setTimeout(15000, () => reject(new Error("SMTP connection timed out.")));
    });
    const greeting = await readReply();
    if (!greeting[greeting.length - 1].startsWith("220 ")) throw new Error("SMTP server rejected connection.");
    await command("EHLO zenigram.app", [250]);
    await command("AUTH LOGIN", [334]);
    await command(Buffer.from(user).toString("base64"), [334]);
    await command(Buffer.from(pass).toString("base64"), [235]);
    await command(`MAIL FROM:<${from}>`, [250]);
    await command(`RCPT TO:<${email}>`, [250, 251]);
    await command("DATA", [354]);

    const boundary = `zenigram_${randomBytes(12).toString("hex")}`;
    const subject = "Your Zenigram verification code";
    const textBody = `Your Zenigram verification code is ${code}. It expires in 10 minutes. Do not share it.`;
    const htmlBody = `<div style="font-family:Arial,sans-serif;background:#09090b;color:#f4f4f5;padding:32px;border-radius:16px"><h1 style="color:#f87171">Zenigram</h1><p>Your email verification code:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#18181b;padding:18px;border-radius:12px;text-align:center">${code}</div><p>This code expires in 10 minutes. Never share this code.</p></div>`;
    const mime = [
      `From: ${from}`, `To: ${email}`, `Subject: ${subject}`,
      "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`, "",
      `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      Buffer.from(textBody).toString("base64"), `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "",
      Buffer.from(htmlBody).toString("base64"), `--${boundary}--`, "",
    ].join("\r\n").replace(/(^|\r\n)\./g, "$1..");
    socket.write(mime + "\r\n.\r\n");
    const sent = await readReply();
    if (!sent[sent.length - 1].startsWith("250 ")) throw new Error("SMTP server did not accept the message.");
    await command("QUIT", [221]);
  } catch (error) {
    console.error("SMTP email delivery failed:", error?.message || "Unknown error");
    throw verificationError("We could not send the verification email. Check SMTP settings and mailbox permissions.", "OTP_DELIVERY_FAILED");
  } finally {
    lines.close();
    socket.end();
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
    await sendSmtpEmail(normalizedEmail, code);
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
    throw verificationError("Enter a valid phone number in international format, such as +919876543210.", "OTP_INVALID_TARGET");
  }
  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const templateId = process.env.MSG91_OTP_TEMPLATE_ID?.trim();
  if (!authKey || !templateId) {
    throw verificationError("SMS delivery is not configured. Add MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID.", "OTP_NOT_CONFIGURED");
  }

  const identifier = `${userId}#${normalizedPhone}`;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const digest = otpHash(PHONE_PURPOSE, identifier, code);
  const requestId = randomBytes(16).toString("hex");
  await reserveState(PHONE_PURPOSE, identifier, {
    ownerId: String(userId), phone: normalizedPhone, otpHash: digest, requestId,
  });

  try {
    const url = new URL("https://control.msg91.com/api/v5/otp");
    url.searchParams.set("template_id", templateId);
    url.searchParams.set("mobile", normalizedPhone.replace("+", ""));
    url.searchParams.set("otp", code);
    url.searchParams.set("otp_length", "6");
    url.searchParams.set("otp_expiry", "10");
    const response = await fetch(url, {
      method: "POST",
      headers: { authkey: authKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(12000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.type !== "success") {
      console.error("MSG91 SMS delivery failed:", response.status, JSON.stringify(result).slice(0, 500));
      throw verificationError("We could not send the SMS code. Check MSG91 credentials, approved OTP template and DLT mapping.", "OTP_DELIVERY_FAILED");
    }
  } catch (error) {
    await deleteStateIfMatches(PHONE_PURPOSE, identifier, "requestId", requestId);
    throw error;
  }
}

export async function verifyPhoneUpdateOtp(userId, phone, code) {
  const normalizedPhone = normalizeE164Phone(phone);
  const normalizedCode = String(code || "").trim();
  if (!userId || !normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
    throw verificationError("Enter the 6-digit SMS verification code.", "OTP_INVALID");
  }
  const identifier = `${userId}#${normalizedPhone}`;
  const state = await readState(PHONE_PURPOSE, identifier);
  const now = nowSeconds();
  if (!state || state.status !== "pending" || state.ownerId !== String(userId) ||
      state.phone !== normalizedPhone || Number(state.expiresAt) <= now) {
    throw verificationError("That SMS code has expired. Request a new one.", "OTP_EXPIRED");
  }
  if (Number(state.attempts || 0) >= MAX_EMAIL_ATTEMPTS) {
    throw verificationError("Too many incorrect attempts. Request a new code.", "OTP_LOCKED");
  }
  const expected = otpHash(PHONE_PURPOSE, identifier, normalizedCode);
  if (!hashMatches(state.otpHash, expected)) {
    await client().send(new UpdateCommand({
      TableName: table(), Key: stateKey(PHONE_PURPOSE, identifier),
      UpdateExpression: "SET attempts = if_not_exists(attempts, :zero) + :one",
      ConditionExpression: "#status = :pending AND expiresAt > :now AND ownerId = :ownerId",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":pending": "pending", ":now": now, ":ownerId": String(userId) },
    })).catch(() => {});
    throw verificationError("The SMS verification code is incorrect.", "OTP_INVALID");
  }
  await client().send(new UpdateCommand({
    TableName: table(), Key: stateKey(PHONE_PURPOSE, identifier),
    UpdateExpression: "SET #status = :verified, verifiedAt = :verifiedAt, expiresAt = :expiresAt, ttl = :expiresAt REMOVE otpHash, requestId, attempts",
    ConditionExpression: "#status = :pending AND expiresAt > :now AND ownerId = :ownerId AND phone = :phone",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":verified": "verified", ":verifiedAt": new Date().toISOString(),
      ":expiresAt": now + OTP_TTL_SECONDS, ":pending": "pending", ":now": now,
      ":ownerId": String(userId), ":phone": normalizedPhone,
    },
  }));
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
