import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  PutObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth";
import { jsonError, jsonOk, normalizeString } from "@/app/lib/api";
import {
  getPublicS3Url,
  getS3Client,
  getS3Config,
  isOwnedMediaKey,
  sanitizeFileName,
} from "@/app/lib/s3Storage";

const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/mp4", "audio/webm", "audio/wav",
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const MIN_PART_SIZE = 5 * 1024 * 1024;
const DEFAULT_PART_SIZE = 10 * 1024 * 1024;
const MAX_PARTS = 10000;

function mediaFolder(contentType) {
  if (contentType.startsWith("image/")) return "images";
  if (contentType.startsWith("video/")) return "videos";
  return "audio";
}

function validateNewUpload(body) {
  const fileName = sanitizeFileName(body.fileName);
  const contentType = normalizeString(body.contentType);
  const size = Number(body.size);
  if (!fileName || !ALLOWED_MEDIA_TYPES.has(contentType)) throw new Error("Unsupported media type");
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE_SIZE) throw new Error("Invalid media size");
  return { fileName, contentType, size };
}

function validateMultipartParts(parts) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > MAX_PARTS) {
    throw new Error("Invalid uploaded parts");
  }
  const normalized = parts.map((part) => ({
    ETag: normalizeString(part?.ETag),
    PartNumber: Number(part?.PartNumber),
  }));
  for (let index = 0; index < normalized.length; index += 1) {
    const part = normalized[index];
    if (!part.ETag || !Number.isInteger(part.PartNumber) || part.PartNumber !== index + 1) {
      throw new Error("Multipart parts must be contiguous and ordered");
    }
  }
  return normalized;
}

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return jsonError("Unauthorized", 401);
    const config = getS3Config();
    if (!config) return jsonError("AWS media storage is not configured", 503);

    const body = await req.json();
    const action = normalizeString(body.action);
    const s3 = getS3Client();

    if (action === "create") {
      const { fileName, contentType, size } = validateNewUpload(body);
      const key = `media/${session.user.id}/${mediaFolder(contentType)}/${Date.now()}-${randomUUID()}-${fileName}`;
      const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
        Bucket: config.bucket, Key: key, ContentType: contentType, ContentLength: size,
        Metadata: { owner: session.user.id },
      }), { expiresIn: 300 });
      return jsonOk({ key, uploadUrl, objectUrl: getPublicS3Url(key) });
    }

    if (action === "createMultipart") {
      const { fileName, contentType, size } = validateNewUpload(body);
      if (!contentType.startsWith("video/")) return jsonError("Multipart upload is reserved for videos", 400);
      const partSize = Math.max(MIN_PART_SIZE, Math.min(DEFAULT_PART_SIZE, Math.ceil(size / MAX_PARTS)));
      const key = `media/${session.user.id}/videos/${Date.now()}-${randomUUID()}-${fileName}`;
      const created = await s3.send(new CreateMultipartUploadCommand({
        Bucket: config.bucket, Key: key, ContentType: contentType,
        Metadata: { owner: session.user.id },
      }));
      return jsonOk({ key, uploadId: created.UploadId, partSize, partCount: Math.ceil(size / partSize), objectUrl: getPublicS3Url(key) });
    }

    const key = normalizeString(body.key);
    const uploadId = normalizeString(body.uploadId);
    if (!key || !uploadId || !isOwnedMediaKey(key, session.user.id)) return jsonError("Invalid multipart upload", 400);

    if (action === "signPart") {
      const partNumber = Number(body.partNumber);
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PARTS) return jsonError("Invalid part number", 400);
      const uploadUrl = await getSignedUrl(s3, new UploadPartCommand({
        Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber,
      }), { expiresIn: 900 });
      return jsonOk({ uploadUrl, partNumber });
    }

    if (action === "completeMultipart") {
      let parts;
      try { parts = validateMultipartParts(body.parts); } catch (error) { return jsonError(error.message, 400); }
      await s3.send(new CompleteMultipartUploadCommand({
        Bucket: config.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts },
      }));
      return jsonOk({ key, objectUrl: getPublicS3Url(key) });
    }

    if (action === "abortMultipart") {
      await s3.send(new AbortMultipartUploadCommand({ Bucket: config.bucket, Key: key, UploadId: uploadId }));
      return jsonOk({ aborted: true });
    }

    return jsonError("Invalid upload action", 400);
  } catch (error) {
    console.error("Direct S3 upload error:", error);
    return jsonError(error.message || "Unable to prepare upload", 500);
  }
}
