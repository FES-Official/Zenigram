"use client";

const MULTIPART_THRESHOLD = 10 * 1024 * 1024;
const MAX_RETRIES = 3;
const CONCURRENCY = 5;

async function api(body) {
  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error(`Upload service returned status ${response.status}`); }
  if (!response.ok) throw new Error(data.message || "Upload preparation failed");
  return data;
}

async function put(url, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    if (contentType) request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress?.(event.loaded, event.total); };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        const etag = request.getResponseHeader("ETag");
        resolve(etag ? etag.replace(/^\"|\"$/g, "") : null);
      } else reject(new Error(`S3 upload failed with status ${request.status}`));
    };
    request.onerror = () => reject(new Error("S3 upload network error"));
    request.onabort = () => reject(new Error("S3 upload was cancelled"));
    request.send(body);
  });
}

async function retry(operation, retries = MAX_RETRIES) {
  let error;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try { return await operation(attempt); } catch (caught) {
      error = caught;
      if (attempt + 1 < retries) await new Promise((resolve) => window.setTimeout(resolve, 400 * 2 ** attempt));
    }
  }
  throw error;
}

async function singleUpload(file, onProgress) {
  const created = await api({ action: "create", fileName: file.name, contentType: file.type, size: file.size });
  await retry(() => put(created.uploadUrl, file, file.type, (loaded, total) => onProgress?.(Math.round((loaded / total) * 100))));
  return { key: created.key, url: created.objectUrl, contentType: file.type };
}

async function multipartUpload(file, onProgress) {
  const created = await api({ action: "createMultipart", fileName: file.name, contentType: file.type, size: file.size });
  if (!created.uploadId || !created.key || !created.partCount) throw new Error("S3 multipart upload could not be initialized");

  const loadedByPart = new Map();
  const partNumbers = Array.from({ length: created.partCount }, (_, index) => index + 1);
  const completed = new Array(created.partCount);
  const report = () => onProgress?.(Math.min(99, Math.round(([...loadedByPart.values()].reduce((sum, value) => sum + value, 0) / file.size) * 100)));

  const uploadPart = async (partNumber, signedPart) => {
    const start = (partNumber - 1) * created.partSize;
    const chunk = file.slice(start, Math.min(file.size, start + created.partSize));
    const ETag = await retry(() => put(signedPart.uploadUrl, chunk, "", (loaded) => { loadedByPart.set(partNumber, loaded); report(); }));
    if (!ETag) throw new Error("S3 did not expose the ETag header. Add ETag to the bucket CORS ExposeHeaders list.");
    return { PartNumber: partNumber, ETag };
  };

  try {
    const signed = await api({ action: "signParts", key: created.key, uploadId: created.uploadId, partNumbers });
    if (!Array.isArray(signed.parts) || signed.parts.length !== partNumbers.length) throw new Error("S3 multipart part signing failed");
    const signedByNumber = new Map(signed.parts.map((part) => [Number(part.partNumber), part]));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, partNumbers.length) }, async () => {
      while (cursor < partNumbers.length) {
        const partNumber = partNumbers[cursor++];
        const signedPart = signedByNumber.get(partNumber);
        if (!signedPart?.uploadUrl) throw new Error(`Missing upload URL for part ${partNumber}`);
        completed[partNumber - 1] = await uploadPart(partNumber, signedPart);
      }
    });
    await Promise.all(workers);
    const finished = await api({ action: "completeMultipart", key: created.key, uploadId: created.uploadId, parts: completed.filter(Boolean) });
    onProgress?.(100);
    return { key: finished.key, url: finished.objectUrl, contentType: file.type };
  } catch (error) {
    await api({ action: "abortMultipart", key: created.key, uploadId: created.uploadId }).catch(() => {});
    throw error;
  }
}

export async function uploadMediaDirect(file, { onProgress } = {}) {
  if (!(file instanceof File)) throw new Error("A media file is required");
  if (file.type.startsWith("video/") && file.size >= MULTIPART_THRESHOLD) return multipartUpload(file, onProgress);
  return singleUpload(file, onProgress);
}
