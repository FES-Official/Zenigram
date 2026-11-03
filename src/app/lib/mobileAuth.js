import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDocumentClient, getDynamoTableName } from "@/app/lib/dynamodb";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
const FAMILY_LIFETIME_SECONDS = 90 * 24 * 60 * 60;
const ISSUER = "zenigram-api";
const AUDIENCE = "zenigram-mobile";

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Distributed fixed-window login limiter. Raw IP addresses and identifiers
 * are never stored: the DynamoDB partition keys contain keyed digests only.
 */
export async function consumeMobileLoginRateLimit(request, identifier) {
  const now = nowSeconds();
  const windowSeconds = 15 * 60;
  const windowId = Math.floor(now / windowSeconds);
  const retryAfter = Math.max(1, (windowId + 1) * windowSeconds - now);
  const forwarded = String(request?.headers?.get("x-forwarded-for") || "")
    .split(",")[0]
    .trim();
  const ip = String(request?.headers?.get("x-real-ip") || forwarded || "unknown").slice(0, 100);
  const digest = value =>
    createHmac("sha256", signingSecret()).update(value, "utf8").digest("hex");
  const ipHash = digest(ip);
  const identityHash = digest(ip + String.fromCharCode(0) + String(identifier || "").toLowerCase());
  const expiry = (windowId + 1) * windowSeconds;
  const update = (key, limit) => ({
    Update: {
      TableName: tableName(),
      Key: key,
      UpdateExpression: "SET attempts = if_not_exists(attempts, :zero) + :one, expiresAt = :expires",
      ConditionExpression: "attribute_not_exists(attempts) OR attempts < :limit",
      ExpressionAttributeValues: {
        ":zero": 0,
        ":one": 1,
        ":expires": expiry,
        ":limit": limit,
      },
    },
  });

  try {
    await database().send(new TransactWriteCommand({
      TransactItems: [
        update({ PK: "MOBILERATE#IP#" + ipHash + "#" + windowId, SK: "LOGIN" }, 40),
        update({ PK: "MOBILERATE#IDENTITY#" + identityHash + "#" + windowId, SK: "LOGIN" }, 8),
      ],
    }));
    return { allowed: true, retryAfter };
  } catch (error) {
    if (error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException") {
      return { allowed: false, retryAfter };
    }
    throw error;
  }
}

function database() {
  return getDynamoDocumentClient();
}

function tableName() {
  return getDynamoTableName();
}

function signingSecret() {
  const secret = process.env.ZENIGRAM_MOBILE_AUTH_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("ZENIGRAM_MOBILE_AUTH_SECRET must contain at least 32 bytes");
  }
  return secret;
}

function hashRefreshSecret(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function equalHash(left, right) {
  if (
    typeof left !== "string" ||
    typeof right !== "string" ||
    !/^[a-f0-9]{64}$/i.test(left) ||
    !/^[a-f0-9]{64}$/i.test(right)
  ) return false;

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function sessionKey(sessionId) {
  return { PK: "MOBILESESSION#" + sessionId, SK: "SESSION" };
}

function familyKey(familyId) {
  return { PK: "MOBILEFAMILY#" + familyId, SK: "FAMILY" };
}

function createRefreshToken(sessionId) {
  const secret = randomBytes(48).toString("base64url");
  return {
    token: sessionId + "." + secret,
    hash: hashRefreshSecret(secret),
  };
}

function createAccessToken(userId, sessionId) {
  const issuedAt = nowSeconds();
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: String(userId),
    sid: sessionId,
    iat: issuedAt,
    exp: issuedAt + ACCESS_TOKEN_SECONDS,
  };
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = header + "." + body;
  const signature = createHmac("sha256", signingSecret()).update(signingInput).digest("base64url");
  return { token: signingInput + "." + signature, expiresIn: ACCESS_TOKEN_SECONDS };
}

async function getSessionRecord(sessionId) {
  const result = await database().send(new GetCommand({
    TableName: tableName(),
    Key: sessionKey(sessionId),
    ConsistentRead: true,
  }));
  return result.Item || null;
}

async function getFamilyRecord(familyId) {
  const result = await database().send(new GetCommand({
    TableName: tableName(),
    Key: familyKey(familyId),
    ConsistentRead: true,
  }));
  return result.Item || null;
}

function makeSessionItem({ sessionId, familyId, userId, refreshHash, now, familyExpiresAt, deviceName }) {
  return {
    ...sessionKey(sessionId),
    entityType: "mobileSession",
    sessionId,
    familyId,
    userId: String(userId),
    refreshTokenHash: refreshHash,
    deviceName: String(deviceName || "Zenigram mobile").slice(0, 100),
    createdAt: now,
    expiresAt: Math.min(now + REFRESH_TOKEN_SECONDS, familyExpiresAt),
    familyExpiresAt,
  };
}

export async function createMobileSession(userId, deviceName) {
  // Fail before writing a DynamoDB session when the server key is missing.
  signingSecret();
  const now = nowSeconds();
  const sessionId = randomBytes(16).toString("hex");
  const familyId = sessionId;
  const refresh = createRefreshToken(sessionId);
  const familyExpiresAt = now + FAMILY_LIFETIME_SECONDS;
  const sessionItem = makeSessionItem({
    sessionId,
    familyId,
    userId,
    refreshHash: refresh.hash,
    now,
    familyExpiresAt,
    deviceName,
  });
  const familyItem = {
    ...familyKey(familyId),
    entityType: "mobileSessionFamily",
    familyId,
    userId: String(userId),
    createdAt: now,
    expiresAt: familyExpiresAt,
  };

  await database().send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: tableName(),
          Item: familyItem,
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
      {
        Put: {
          TableName: tableName(),
          Item: sessionItem,
          ConditionExpression: "attribute_not_exists(PK)",
        },
      },
    ],
  }));

  const access = createAccessToken(userId, sessionId);
  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    tokenType: "Bearer",
    expiresIn: access.expiresIn,
    refreshExpiresAt: sessionItem.expiresAt,
  };
}

export async function rotateMobileRefreshToken(refreshToken) {
  if (typeof refreshToken !== "string" || refreshToken.length > 256) return null;
  const separator = refreshToken.indexOf(".");
  if (separator < 1) return null;

  const sessionId = refreshToken.slice(0, separator);
  const refreshSecret = refreshToken.slice(separator + 1);
  if (!/^[a-f0-9]{32}$/.test(sessionId) || refreshSecret.length < 40) return null;

  const session = await getSessionRecord(sessionId);
  if (!session || !equalHash(session.refreshTokenHash, hashRefreshSecret(refreshSecret))) return null;

  const now = nowSeconds();
  const family = await getFamilyRecord(session.familyId);
  if (!family || family.revokedAt || family.expiresAt <= now || session.expiresAt <= now) return null;

  // A valid refresh token that has already been rotated is a replay. Revoke
  // the entire device-session family so a stolen token cannot keep the session alive.
  if (session.revokedAt) {
    try {
      await database().send(new UpdateCommand({
        TableName: tableName(),
        Key: familyKey(session.familyId),
        UpdateExpression: "SET revokedAt = :now",
        ConditionExpression: "attribute_not_exists(revokedAt)",
        ExpressionAttributeValues: { ":now": now },
      }));
    } catch (error) {
      if (error?.name !== "ConditionalCheckFailedException") throw error;
    }
    return null;
  }

  const nextSessionId = randomBytes(16).toString("hex");
  const nextRefresh = createRefreshToken(nextSessionId);
  const nextSession = makeSessionItem({
    sessionId: nextSessionId,
    familyId: session.familyId,
    userId: session.userId,
    refreshHash: nextRefresh.hash,
    now,
    familyExpiresAt: family.expiresAt,
    deviceName: session.deviceName,
  });

  try {
    await database().send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName(),
            Key: sessionKey(sessionId),
            UpdateExpression: "SET revokedAt = :now, replacedBy = :next",
            ConditionExpression: "refreshTokenHash = :hash AND attribute_not_exists(revokedAt) AND expiresAt > :now",
            ExpressionAttributeValues: {
              ":now": now,
              ":next": nextSessionId,
              ":hash": session.refreshTokenHash,
            },
          },
        },
        {
          Put: {
            TableName: tableName(),
            Item: nextSession,
            ConditionExpression: "attribute_not_exists(PK)",
          },
        },
      ],
    }));
  } catch (error) {
    if (error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException") {
      return null;
    }
    throw error;
  }

  const access = createAccessToken(session.userId, nextSessionId);
  return {
    userId: String(session.userId),
    accessToken: access.token,
    refreshToken: nextRefresh.token,
    tokenType: "Bearer",
    expiresIn: access.expiresIn,
    refreshExpiresAt: nextSession.expiresAt,
  };
}

export async function verifyMobileAccessToken(token) {
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (header?.alg !== "HS256" || header?.typ !== "JWT") return null;
  const expected = createHmac("sha256", signingSecret()).update(parts[0] + "." + parts[1]).digest();
  const supplied = Buffer.from(parts[2], "base64url");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  const now = nowSeconds();
  if (
    payload?.iss !== ISSUER ||
    payload?.aud !== AUDIENCE ||
    typeof payload?.sub !== "string" ||
    !/^[a-f0-9]{32}$/.test(payload?.sid || "") ||
    !Number.isInteger(payload?.iat) ||
    !Number.isInteger(payload?.exp) ||
    payload.iat > now + 30 ||
    payload.exp <= now ||
    payload.exp - payload.iat > ACCESS_TOKEN_SECONDS
  ) return null;

  const [session, family] = await Promise.all([
    getSessionRecord(payload.sid),
    getFamilyRecord(payload.sid),
  ]);
  // Newer rotated sessions use the original family ID, which is persisted on
  // the session record. Fetch that family when it differs from the session ID.
  const resolvedFamily = session?.familyId && session.familyId !== payload.sid
    ? await getFamilyRecord(session.familyId)
    : family;

  if (
    !session ||
    session.userId !== payload.sub ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !resolvedFamily ||
    resolvedFamily.revokedAt ||
    resolvedFamily.expiresAt <= now
  ) return null;

  return {
    userId: payload.sub,
    sessionId: payload.sid,
    expiresAt: payload.exp,
  };
}

export async function revokeMobileSession(sessionId, userId) {
  if (!/^[a-f0-9]{32}$/.test(String(sessionId || ""))) return false;
  const session = await getSessionRecord(sessionId);
  if (!session || session.userId !== String(userId)) return false;

  const now = nowSeconds();
  try {
    await database().send(new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: tableName(),
            Key: sessionKey(sessionId),
            UpdateExpression: "SET revokedAt = :now",
            ConditionExpression: "userId = :userId AND attribute_not_exists(revokedAt)",
            ExpressionAttributeValues: { ":now": now, ":userId": String(userId) },
          },
        },
        {
          Update: {
            TableName: tableName(),
            Key: familyKey(session.familyId),
            UpdateExpression: "SET revokedAt = :now",
            ConditionExpression: "attribute_not_exists(revokedAt)",
            ExpressionAttributeValues: { ":now": now },
          },
        },
      ],
    }));
    return true;
  } catch (error) {
    if (error?.name === "TransactionCanceledException" || error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}



export async function revokeMobileRefreshSession(refreshToken) {
  if (typeof refreshToken !== "string" || refreshToken.length > 256) return false;
  const separator = refreshToken.indexOf(".");
  if (separator < 1) return false;

  const sessionId = refreshToken.slice(0, separator);
  const refreshSecret = refreshToken.slice(separator + 1);
  if (!/^[a-f0-9]{32}$/.test(sessionId) || refreshSecret.length < 40) return false;

  const session = await getSessionRecord(sessionId);
  if (
    !session ||
    !equalHash(session.refreshTokenHash, hashRefreshSecret(refreshSecret))
  ) return false;

  // Revoking the family invalidates all access and refresh tokens issued for
  // this device, even when the short-lived access token itself has expired.
  try {
    await database().send(new UpdateCommand({
      TableName: tableName(),
      Key: familyKey(session.familyId),
      UpdateExpression: "SET revokedAt = :now",
      ConditionExpression: "attribute_exists(PK) AND attribute_not_exists(revokedAt)",
      ExpressionAttributeValues: { ":now": nowSeconds() },
    }));
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") {
      const family = await getFamilyRecord(session.familyId);
      return Boolean(family?.revokedAt);
    }
    throw error;
  }

  return true;
}

export async function getBearerMobileUserId(request) {
  const authorization = request?.headers?.get("authorization") || "";
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const claims = await verifyMobileAccessToken(match[1]);
  return claims?.userId || null;
}
