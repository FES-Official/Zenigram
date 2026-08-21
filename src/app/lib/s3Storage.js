import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getS3Config() {
  const region = process.env.AWS_S3_REGION || process.env.AWS_REGION;
  const bucket = process.env.AWS_BUCKET_NAME;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return { region, bucket, accessKeyId, secretAccessKey };
}

export function isS3Configured() {
  return Boolean(getS3Config());
}

export function sanitizeFileName(fileName = "upload") {
  return normalizeString(fileName)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-100);
}

export function getPublicS3Url(key) {
  const config = getS3Config();
  if (!config) return "";
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${key}`;
}

const signedUrlCache = new Map();

export function getS3KeyFromUrl(value, allowRawKey = false) {
  const config = getS3Config();
  const normalized = normalizeString(value);
  if (!config || !normalized) return "";
  if (!/^https?:\/\//i.test(normalized)) {
    const key = normalized.replace(/^\/+/, "");
    return allowRawKey ||
      key.startsWith("media/") ||
      key.startsWith("images/stories/")
      ? key
      : "";
  }

  try {
    const url = new URL(normalized);
    const virtualHosts = new Set([
      `${config.bucket}.s3.${config.region}.amazonaws.com`,
      `${config.bucket}.s3.amazonaws.com`,
    ]);
    if (virtualHosts.has(url.hostname)) {
      return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    }
    if (url.hostname === `s3.${config.region}.amazonaws.com`) {
      const prefix = `/${config.bucket}/`;
      return url.pathname.startsWith(prefix)
        ? decodeURIComponent(url.pathname.slice(prefix.length))
        : "";
    }
  } catch {
    return "";
  }
  return "";
}

export async function getReadableMediaUrl(value, key = "") {
  const config = getS3Config();
  if (!config) return normalizeString(value);
  const objectKey = normalizeString(key) || getS3KeyFromUrl(value);
  if (!objectKey) return normalizeString(value);

  const cached = signedUrlCache.get(objectKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const url = await getSignedUrl(
    getS3Client(),
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    { expiresIn: 3600 },
  );
  signedUrlCache.set(objectKey, {
    url,
    expiresAt: Date.now() + 50 * 60 * 1000,
  });
  return url;
}

export async function hydrateUserMedia(user) {
  if (!user) return user;
  return {
    ...user,
    profilePic: await getReadableMediaUrl(user.profilePic, user.profilePicKey),
  };
}

export async function hydrateMediaItem(item) {
  if (!item) return item;
  return {
    ...item,
    url: await getReadableMediaUrl(item.url, item.key || item.publicId),
  };
}

export async function hydratePostMedia(post) {
  if (!post) return post;
  const mediaItems = await Promise.all(
    (post.mediaItems || []).map((item) => hydrateMediaItem(item)),
  );
  const first = mediaItems[0];
  return {
    ...post,
    mediaItems,
    mediaUrl: first?.url ||
      (await getReadableMediaUrl(post.mediaUrl, post.mediaPublicId)),
  };
}

export async function deleteS3Objects(values) {
  const config = getS3Config();
  if (!config) throw new Error("AWS media storage is not configured");
  const keys = [
    ...new Set(
      (values || [])
        .map((value) => getS3KeyFromUrl(value, true))
        .filter(Boolean),
    ),
  ];
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    const result = await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: config.bucket,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
    if (result.Errors?.length) {
      throw new Error(`S3 could not delete ${result.Errors.length} media object(s)`);
    }
    batch.forEach((key) => signedUrlCache.delete(key));
  }
  return keys.length;
}

export async function deleteS3Prefix(prefix) {
  const config = getS3Config();
  if (!config) throw new Error("AWS media storage is not configured");
  const safePrefix = normalizeString(prefix).replace(/^\/+/, "");
  if (!safePrefix || safePrefix.includes("..")) {
    throw new Error("Invalid S3 deletion prefix");
  }
  let continuationToken;
  let deleted = 0;
  do {
    const result = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: safePrefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );
    deleted += await deleteS3Objects(
      (result.Contents || []).map((item) => item.Key),
    );
    continuationToken = result.IsTruncated
      ? result.NextContinuationToken
      : undefined;
  } while (continuationToken);
  return deleted;
}

export function getS3Client() {
  const config = getS3Config();
  if (!config) throw new Error("AWS media storage is not configured");
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function isOwnedMediaKey(key, userId) {
  return (
    typeof key === "string" &&
    typeof userId === "string" &&
    key.startsWith(`media/${userId}/`) &&
    !key.includes("..")
  );
}

export async function verifyS3Object(key, userId) {
  const config = getS3Config();
  if (!config || !isOwnedMediaKey(key, userId)) return null;
  const result = await getS3Client().send(
    new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  return {
    key,
    url: getPublicS3Url(key),
    contentType: result.ContentType || "application/octet-stream",
    size: Number(result.ContentLength || 0),
    etag: result.ETag || "",
  };
}
