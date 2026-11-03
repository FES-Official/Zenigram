import type * as ImagePicker from "expo-image-picker";
import { api } from "./api";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type UploadedImage = {
  key: string;
  type: "image";
};

export type UploadedVideo = {
  key: string;
  type: "video";
};

function inferContentType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    default: return "";
  }
}

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-100) || "zenigram-image.jpg";
}

function putBlob(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.timeout = 120000;
    request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error("S3 upload failed (" + request.status + ")."));
      }
    };
    request.onerror = () => reject(new Error("S3 upload network error."));
    request.ontimeout = () => reject(new Error("S3 upload timed out. Check your connection and retry."));
    request.onabort = () => reject(new Error("S3 upload was cancelled."));
    request.send(blob);
  });
}

export async function uploadPickedImage(
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: (percent: number) => void,
): Promise<UploadedImage> {
  if (asset.type && asset.type !== "image") {
    throw new Error("Only photos can be published in this post composer.");
  }

  const fileName = safeFileName(asset.fileName || "zenigram-" + Date.now() + ".jpg");
  const contentType = String(asset.mimeType || inferContentType(fileName)).toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Use a JPG, PNG, WebP, or GIF image. This format is not supported yet.");
  }

  const localResponse = await fetch(asset.uri);
  if (!localResponse.ok) {
    throw new Error("Zenigram could not read the selected photo from this device.");
  }
  const blob = await localResponse.blob();
  if (!blob.size || blob.size > MAX_IMAGE_BYTES) {
    throw new Error("Each photo must be smaller than 25 MB.");
  }

  const { data: created } = await api.post<{
    key: string;
    uploadUrl: string;
  }>("/api/media/upload", {
    action: "create",
    fileName,
    contentType,
    size: blob.size,
  });

  if (!created?.key || !created?.uploadUrl) {
    throw new Error("The media service did not return an upload URL.");
  }

  try {
    await putBlob(created.uploadUrl, blob, contentType, onProgress);
    onProgress?.(100);
    return { key: created.key, type: "image" };
  } catch (error) {
    // A failed/aborted signed PUT must not leave an orphan object in the bucket.
    await deleteUploadedMedia([created.key]).catch(() => {});
    throw error;
  }
}

export async function deleteUploadedMedia(keys: string[]): Promise<void> {
  const uniqueKeys = [...new Set(keys)].filter(Boolean).slice(0, 10);
  if (!uniqueKeys.length) return;
  await api.post("/api/media/upload", { action: "delete", keys: uniqueKeys });
}


export async function uploadPickedVideo(
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: (percent: number) => void,
): Promise<UploadedVideo> {
  if (asset.type !== "video") {
    throw new Error("Choose a video to create a clip.");
  }

  // The current native single-PUT path deliberately caps the file size to
  // avoid reading very large videos into one in-memory Blob on mobile.
  const maxBytes = 200 * 1024 * 1024;
  if (asset.fileSize && asset.fileSize > maxBytes) {
    throw new Error("Videos must be 200 MB or smaller in this version.");
  }

  const fileName = safeFileName(asset.fileName || "zenigram-" + Date.now() + ".mp4");
  const contentType = String(asset.mimeType || "video/mp4").toLowerCase();
  if (!new Set(["video/mp4", "video/quicktime", "video/webm"]).has(contentType)) {
    throw new Error("Use an MP4, MOV, or WebM video.");
  }

  const localResponse = await fetch(asset.uri);
  if (!localResponse.ok) {
    throw new Error("Zenigram could not read the selected video from this device.");
  }
  const blob = await localResponse.blob();
  if (!blob.size || blob.size > maxBytes) {
    throw new Error("Videos must be larger than 0 bytes and 200 MB or smaller.");
  }

  const { data: created } = await api.post<{
    key: string;
    uploadUrl: string;
  }>("/api/media/upload", {
    action: "create",
    fileName,
    contentType,
    size: blob.size,
  });

  if (!created?.key || !created?.uploadUrl) {
    throw new Error("The media service did not return an upload URL.");
  }

  try {
    await putBlob(created.uploadUrl, blob, contentType, onProgress);
    onProgress?.(100);
    return { key: created.key, type: "video" };
  } catch (error) {
    await deleteUploadedMedia([created.key]).catch(() => {});
    throw error;
  }
}
