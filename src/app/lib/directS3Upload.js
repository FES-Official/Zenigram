"use client";

const MULTIPART_THRESHOLD = 25 * 1024 * 1024;
const MAX_RETRIES = 3;
const CONCURRENCY = 3;

async function api(body) {
  const response = await fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Upload preparation failed");
  return data;
}

async function put(url, body, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url, true);
    if (contentType) request.setRequestHeader("Content-Type", contentType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded, event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.getResponseHeader("ETag"));
      } else {
        reject(new Error(`S3 upload failed with status ${request.status}`));
      }
    };
    request.onerror = () => reject(new Error("S3 upload network error"));
    request.send(body);
  });
}

async function retry(operation, retries = MAX_RETRIES) {
  let error;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (caught) {
      error = caught;
      if (attempt + 1 < retries) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, 400 * 2 ** attempt),
        );
      }
    }
  }
  throw error;
}

async function singleUpload(file, onProgress) {
  const created = await api({
    action: "create",
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  await retry(() =>
    put(created.uploadUrl, file, file.type, (loaded, total) =>
      onProgress?.(Math.round((loaded / total) * 100)),
    ),
  );
  return { key: created.key, url: created.objectUrl, contentType: file.type };
}

async function multipartUpload(file, onProgress) {
  const created = await api({
    action: "createMultipart",
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  const loadedByPart = new Map();
  const partNumbers = Array.from({ length: created.partCount }, (_, index) => index + 1);
  const completed = [];

  const report = () => {
    const loaded = [...loadedByPart.values()].reduce((sum, value) => sum + value, 0);
    onProgress?.(Math.min(99, Math.round((loaded / file.size) * 100)));
  };

  const uploadPart = async (partNumber) => {
    const start = (partNumber - 1) * created.partSize;
    const chunk = file.slice(start, Math.min(file.size, start + created.partSize));
    return retry(async () => {
      loadedByPart.set(partNumber, 0);
      report();
      const signed = await api({
        action: "signPart",
        key: created.key,
        uploadId: created.uploadId,
        partNumber,
      });
      const ETag = await put(signed.uploadUrl, chunk, "", (loaded) => {
        loadedByPart.set(partNumber, loaded);
        report();
      });
      if (!ETag) {
        throw new Error(
          "S3 did not expose the ETag header. Add ETag to the bucket CORS ExposeHeaders list.",
        );
      }
      return { PartNumber: partNumber, ETag };
    });
  };

  try {
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, partNumbers.length) },
      async () => {
        while (cursor < partNumbers.length) {
          const partNumber = partNumbers[cursor];
          cursor += 1;
          completed.push(await uploadPart(partNumber));
        }
      },
    );
    await Promise.all(workers);
    const finished = await api({
      action: "completeMultipart",
      key: created.key,
      uploadId: created.uploadId,
      parts: completed,
    });
    onProgress?.(100);
    return { key: finished.key, url: finished.objectUrl, contentType: file.type };
  } catch (error) {
    await api({
      action: "abortMultipart",
      key: created.key,
      uploadId: created.uploadId,
    }).catch(() => {});
    throw error;
  }
}

export async function uploadMediaDirect(file, { onProgress } = {}) {
  if (!(file instanceof File)) throw new Error("A media file is required");
  if (file.type.startsWith("video/") && file.size >= MULTIPART_THRESHOLD) {
    return multipartUpload(file, onProgress);
  }
  return singleUpload(file, onProgress);
}
