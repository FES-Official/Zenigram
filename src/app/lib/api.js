import { NextResponse } from "next/server";

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function jsonOk(data = {}, status = 200) {
  return NextResponse.json(
    { ...data, success: true },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function jsonError(message, status = 400, details = {}) {
  const safeDetails = details && typeof details === "object" ? { ...details } : {};
  delete safeDetails.success;
  delete safeDetails.password;
  delete safeDetails.secret;
  delete safeDetails.token;
  return NextResponse.json(
    { ...safeDetails, success: false, message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export function isValidImageFile(file) {
  return (
    file &&
    typeof file === "object" &&
    typeof file.arrayBuffer === "function" &&
    ALLOWED_IMAGE_TYPES.has(file.type) &&
    Number(file.size) <= MAX_IMAGE_UPLOAD_BYTES
  );
}

export function isValidObjectId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

export function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeUsername(value) {
  return normalizeString(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function normalizeEmail(value) {
  return normalizeString(value).normalize("NFKC").toLowerCase();
}

export function escapeRegex(value) {
  return normalizeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
