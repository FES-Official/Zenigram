import type * as ImagePicker from "expo-image-picker";
import { File as ExpoFile } from "expo-file-system";
import { api } from "./api";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024;
const SINGLE_VIDEO_THRESHOLD = 10 * 1024 * 1024;
const PART_SIGN_BATCH = 20;
const PART_UPLOAD_CONCURRENCY = 4;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

export type UploadedImage = { key: string; type: "image" };
export type UploadedVideo = { key: string; type: "video" };

function safeFileName(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(-100) || "zenigram-upload";
}

function inferImageType(fileName: string): string {
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

function inferVideoType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "mp4":
    case "m4v": return "video/mp4";
    case "mov": return "video/quicktime";
    case "webm": return "video/webm";
    default: return "";
  }
}

function putBlob(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    request.timeout = 120000;
    if (contentType) request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader("ETag");
        resolve(etag ? etag.replace(/^"|"$/g, "") : null);
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
  const contentType = String(asset.mimeType || inferImageType(fileName)).toLowerCase();
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

  const { data: created } = await api.post<{ key: string; uploadUrl: string }>(
    "/api/media/upload",
    { action: "create", fileName, contentType, size: blob.size },
  );
  if (!created?.key || !created?.uploadUrl) {
    throw new Error("The media service did not return an upload URL.");
  }

  try {
    await putBlob(created.uploadUrl, blob, contentType, onProgress);
    onProgress?.(100);
    return { key: created.key, type: "image" };
  } catch (error) {
    await deleteUploadedMedia([created.key]).catch(() => {});
    throw error;
  }
}

export async function deleteUploadedMedia(keys: string[]): Promise<void> {
  const uniqueKeys = [...new Set(keys)].filter(Boolean).slice(0, 10);
  if (!uniqueKeys.length) return;
  await api.post("/api/media/upload", { action: "delete", keys: uniqueKeys });
}

async function uploadSmallVideo(
  file: ExpoFile,
  fileName: string,
  contentType: string,
  size: number,
  onProgress?: (percent: number) => void,
): Promise<UploadedVideo> {
  const { data: created } = await api.post<{ key: string; uploadUrl: string }>(
    "/api/media/upload",
    { action: "create", fileName, contentType, size },
  );
  if (!created?.key || !created?.uploadUrl) {
    throw new Error("The media service did not return an upload URL.");
  }

  try {
    await putBlob(created.uploadUrl, file.slice(0, size, contentType), contentType, onProgress);
    onProgress?.(100);
    return { key: created.key, type: "video" };
  } catch (error) {
    await deleteUploadedMedia([created.key]).catch(() => {});
    throw error;
  }
}

async function uploadMultipartVideo(
  file: ExpoFile,
  fileName: string,
  contentType: string,
  size: number,
  onProgress?: (percent: number) => void,
): Promise<UploadedVideo> {
  const { data: created } = await api.post<{
    key: string;
    uploadId: string;
    partSize: number;
    partCount: number;
  }>("/api/media/upload", {
    action: "createMultipart",
    fileName,
    contentType,
    size,
  });

  if (!created?.key || !created?.uploadId || !created.partSize || !created.partCount) {
    throw new Error("The multipart upload could not be initialized.");
  }

  const uploadedParts: Array<{ PartNumber: number; ETag: string }> = [];
  const loadedByPart = new Map<number, number>();

  const reportProgress = () => {
    const loaded = [...loadedByPart.values()].reduce((sum, value) => sum + value, 0);
    onProgress?.(Math.min(99, Math.round((loaded / size) * 100)));
  };

  async function getSignedPart(partNumber: number): Promise<string> {
    const { data } = await api.post<{ uploadUrl: string }>("/api/media/upload", {
      action: "signPart",
      key: created.key,
      uploadId: created.uploadId,
      partNumber,
    });
    if (!data?.uploadUrl) throw new Error("Unable to sign video part " + partNumber + ".");
    return data.uploadUrl;
  }

  async function uploadPart(
    partNumber: number,
    firstUploadUrl: string,
  ): Promise<{ PartNumber: number; ETag: string }> {
    const start = (partNumber - 1) * created.partSize;
    const end = Math.min(size, start + created.partSize);
    const chunk = file.slice(start, end, contentType);
    let uploadUrl = firstUploadUrl;
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (attempt > 0) uploadUrl = await getSignedPart(partNumber);
        const etag = await putBlob(uploadUrl, chunk, "", percent => {
          loadedByPart.set(partNumber, Math.round((end - start) * percent / 100));
          reportProgress();
        });
        if (!etag) {
          throw new Error("S3 did not return an ETag. Add ETag to the bucket CORS ExposeHeaders list.");
        }
        loadedByPart.set(partNumber, end - start);
        reportProgress();
        return { PartNumber: partNumber, ETag: etag };
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 400 * (2 ** attempt)));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Video part " + partNumber + " failed.");
  }

  async function uploadBatch(parts: Array<{ partNumber: number; uploadUrl: string }>) {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(PART_UPLOAD_CONCURRENCY, parts.length) },
      async () => {
        while (cursor < parts.length) {
          const part = parts[cursor++];
          uploadedParts.push(await uploadPart(part.partNumber, part.uploadUrl));
        }
      },
    );
    await Promise.all(workers);
  }

  try {
    for (let offset = 0; offset < created.partCount; offset += PART_SIGN_BATCH) {
      const partNumbers = Array.from(
        { length: Math.min(PART_SIGN_BATCH, created.partCount - offset) },
        (_, index) => offset + index + 1,
      );
      const { data: signed } = await api.post<{
        parts: Array<{ partNumber: number; uploadUrl: string }>;
      }>("/api/media/upload", {
        action: "signParts",
        key: created.key,
        uploadId: created.uploadId,
        partNumbers,
      });
      if (!Array.isArray(signed?.parts) || signed.parts.length !== partNumbers.length) {
        throw new Error("Unable to prepare the video upload parts.");
      }
      await uploadBatch(signed.parts);
    }

    uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);
    if (uploadedParts.length !== created.partCount) {
      throw new Error("The video upload is incomplete. Please retry.");
    }

    const { data: finished } = await api.post<{ key: string }>(
      "/api/media/upload",
      {
        action: "completeMultipart",
        key: created.key,
        uploadId: created.uploadId,
        parts: uploadedParts,
      },
    );
    if (!finished?.key) throw new Error("The video upload could not be completed.");
    onProgress?.(100);
    return { key: finished.key, type: "video" };
  } catch (error) {
    await api.post("/api/media/upload", {
      action: "abortMultipart",
      key: created.key,
      uploadId: created.uploadId,
    }).catch(() => {});
    throw error;
  }
}

export async function uploadPickedVideo(
  asset: ImagePicker.ImagePickerAsset,
  onProgress?: (percent: number) => void,
): Promise<UploadedVideo> {
  if (asset.type !== "video") throw new Error("Choose a video to create a clip.");

  const fileName = safeFileName(asset.fileName || "zenigram-clip-" + Date.now() + ".mp4");
  const contentType = String(asset.mimeType || inferVideoType(fileName)).toLowerCase();
  if (!ALLOWED_VIDEO_TYPES.has(contentType)) {
    throw new Error("Use an MP4, MOV, or WebM video.");
  }

  const file = new ExpoFile(asset.uri);
  const size = Number(asset.fileSize || file.size);
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) {
    throw new Error("The selected video must be smaller than 5 GB.");
  }

  if (size > SINGLE_VIDEO_THRESHOLD) {
    return uploadMultipartVideo(file, fileName, contentType, size, onProgress);
  }
  return uploadSmallVideo(file, fileName, contentType, size, onProgress);
}
