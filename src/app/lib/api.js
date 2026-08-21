import { NextResponse } from "next/server";

export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function jsonOk(data = {}, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function jsonError(message, status = 400, details = {}) {
  return NextResponse.json({ success: false, message, ...details }, { status });
}

export function isValidImageFile(file) {
  return (
    file &&
    typeof file === "object" &&
    typeof file.arrayBuffer === "function" &&
    ALLOWED_IMAGE_TYPES.has(file.type) &&
    file.size <= MAX_IMAGE_UPLOAD_BYTES
  );
}

export function isValidObjectId(value) {
  return typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value);
}

export function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function escapeRegex(value) {
  return normalizeString(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
