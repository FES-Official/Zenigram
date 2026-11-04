import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import {
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  buildClipFilterGraph,
  buildFfmpegInputArgs,
  validateClipForRender,
} from "./render-plan.mjs";

const REGION = process.env.AWS_REGION || process.env.AWS_DYNAMODB_REGION || process.env.AWS_S3_REGION;
const BUCKET = process.env.AWS_BUCKET_NAME;
const TABLE = process.env.DYNAMODB_TABLE_NAME;
const QUEUE_URL = process.env.CLIP_RENDER_QUEUE_URL;
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";
const VISIBILITY_SECONDS = 1200;
const HEARTBEAT_MS = 45000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;

if (!REGION || !BUCKET || !TABLE || !QUEUE_URL) {
  throw new Error("Set AWS_REGION, AWS_BUCKET_NAME, DYNAMODB_TABLE_NAME, and CLIP_RENDER_QUEUE_URL");
}

const sqs = new SQSClient({ region: REGION });
const s3 = new S3Client({ region: REGION });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const nowSeconds = () => Math.floor(Date.now() / 1000);

function clipKey(clipId) {
  return { PK: `CLIP#${clipId}`, SK: "META" };
}

function safeExtension(media, contentType) {
  const extension = extname(String(media.key || "")).toLowerCase();
  const allowed = new Set([".mp4", ".m4v", ".mov", ".webm", ".jpg", ".jpeg", ".png", ".webp", ".gif"]);
  if (allowed.has(extension)) return extension;
  const type = String(contentType || "").toLowerCase();
  if (type.includes("quicktime")) return ".mov";
  if (type.includes("webm")) return ".webm";
  if (type.includes("png")) return ".png";
  if (type.includes("webp")) return ".webp";
  if (type.includes("gif")) return ".gif";
  if (type.includes("jpeg") || type.includes("jpg")) return ".jpg";
  return media.type === "image" ? ".jpg" : ".mp4";
}

async function getClip(clipId) {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: clipKey(clipId),
    ConsistentRead: true,
  }));
  return result.Item || null;
}

async function updateRenderFields(clipId, userId, version, fields) {
  const names = { "#status": "renderStatus", "#updated": "updatedAt", "#renderUpdated": "renderUpdatedAt" };
  const values = {
    ":userId": userId,
    ":version": version,
    ":now": new Date().toISOString(),
  };
  const sets = ["#updated = :now", "#renderUpdated = :now"];
  const removes = [];

  if (fields.status) {
    values[":status"] = fields.status;
    sets.push("#status = :status");
  }
  if (Number.isFinite(fields.progress)) {
    names["#progress"] = "renderProgress";
    values[":progress"] = Math.max(0, Math.min(100, Math.round(fields.progress)));
    sets.push("#progress = :progress");
  }
  if (Number.isFinite(fields.leaseExpiresAt)) {
    names["#lease"] = "renderLeaseExpiresAt";
    values[":lease"] = fields.leaseExpiresAt;
    sets.push("#lease = :lease");
  }
  if (typeof fields.error === "string") {
    names["#error"] = "renderError";
    values[":error"] = fields.error.slice(0, 500);
    sets.push("#error = :error");
  }
  if (typeof fields.renderedMediaKey === "string") {
    names["#renderedKey"] = "renderedMediaKey";
    values[":renderedKey"] = fields.renderedMediaKey;
    sets.push("#renderedKey = :renderedKey");
  }
  if (Number.isFinite(fields.renderedDuration)) {
    names["#duration"] = "renderedDuration";
    values[":duration"] = fields.renderedDuration;
    sets.push("#duration = :duration");
  }
  if (fields.removeLease) removes.push("renderLeaseExpiresAt");

  return ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: clipKey(clipId),
    UpdateExpression: `SET ${sets.join(", ")}${removes.length ? ` REMOVE ${removes.join(", ")}` : ""}`,
    ConditionExpression: "userId = :userId AND renderVersion = :version",
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

async function claimJob(job) {
  const now = nowSeconds();
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: clipKey(job.clipId),
      UpdateExpression:
        "SET #status = :rendering, renderProgress = :progress, renderLeaseExpiresAt = :lease, renderUpdatedAt = :now ADD renderAttempts :one",
      ConditionExpression:
        "userId = :userId AND renderVersion = :version AND (#status = :queued OR (#status = :rendering AND (attribute_not_exists(renderLeaseExpiresAt) OR renderLeaseExpiresAt < :nowSeconds)))",
      ExpressionAttributeNames: { "#status": "renderStatus" },
      ExpressionAttributeValues: {
        ":userId": job.userId,
        ":version": job.renderVersion,
        ":queued": "queued",
        ":rendering": "rendering",
        ":progress": 2,
        ":lease": now + VISIBILITY_SECONDS + 60,
        ":now": new Date().toISOString(),
        ":nowSeconds": now,
        ":one": 1,
      },
    }));
    return true;
  } catch (error) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

function runProcess(binary, args, { onProgress, totalDuration = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stderr = "";
    let lineBuffer = "";
    let lastProgress = 0;
    let settled = false;
    const progressTasks = new Set();

    child.stdout.on("data", chunk => {
      lineBuffer += chunk.toString("utf8");
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() || "";
      for (const line of lines) {
        const match = line.match(/^out_time_ms=(\d+)$/);
        if (match && totalDuration > 0 && typeof onProgress === "function") {
          const elapsed = Number(match[1]) / 1_000_000;
          const next = Math.max(12, Math.min(96, 12 + elapsed / totalDuration * 84));
          if (next - lastProgress >= 3) {
            lastProgress = next;
            const task = Promise.resolve(onProgress(next))
              .catch(error => console.error("Render progress update failed:", error))
              .finally(() => progressTasks.delete(task));
            progressTasks.add(task);
          }
        }
      }
    });
    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString("utf8")).slice(-24000);
    });
    child.on("error", error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.on("close", code => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        Promise.all([...progressTasks]).then(() => resolve({ stderr }));
      } else {
        reject(new Error(`${basename(binary)} exited with code ${code}: ${stderr.slice(-3000)}`));
      }
    });
  });
}

async function downloadSource(key, destination) {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  if (!response.Body) throw new Error("S3 returned an empty source object");
  await pipeline(response.Body, createWriteStream(destination));
  return Number(response.ContentLength || (await stat(destination)).size);
}

function runProbe(filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE, [
      "-v", "error",
      "-show_entries", "format=duration:stream=codec_type,duration",
      "-of", "json",
      filePath,
    ], { stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", chunk => { stderr = (stderr + chunk.toString("utf8")).slice(-4000); });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error("ffprobe could not inspect a source video: " + stderr));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error("ffprobe returned invalid media metadata"));
      }
    });
  });
}

async function renderClip(job, receiptHandle) {
  const clip = await getClip(job.clipId);
  if (!clip || String(clip.userId) !== job.userId || Number(clip.renderVersion) !== job.renderVersion) {
    console.info("Ignoring stale or missing render job", job.clipId);
    return;
  }
  if (clip.renderStatus === "ready") {
    console.info("Clip render is already ready", job.clipId);
    return;
  }

  const claimed = await claimJob(job);
  if (!claimed) {
    console.info("Clip render is already claimed or no longer queued", job.clipId);
    return;
  }

  let latestProgress = 2;
  let heartbeatBusy = false;
  let heartbeatPromise = Promise.resolve();
  const heartbeat = setInterval(() => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    heartbeatPromise = Promise.all([
      sqs.send(new ChangeMessageVisibilityCommand({
        QueueUrl: QUEUE_URL,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: VISIBILITY_SECONDS,
      })),
      updateRenderFields(job.clipId, job.userId, job.renderVersion, {
        progress: latestProgress,
        leaseExpiresAt: nowSeconds() + VISIBILITY_SECONDS + 60,
      }),
    ])
      .catch(error => console.error("Clip render heartbeat failed:", error))
      .finally(() => { heartbeatBusy = false; });
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const workDir = await mkdtemp(join(tmpdir(), `zenigram-${job.clipId}-`));
  try {
    const plan = validateClipForRender(clip, job.userId);
    await updateRenderFields(job.clipId, job.userId, job.renderVersion, { progress: 5 });
    latestProgress = 5;

    const localFiles = [];
    let totalSourceBytes = 0;
    const hasAudio = [];

    for (let index = 0; index < plan.mediaItems.length; index += 1) {
      const media = plan.mediaItems[index];
      const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: media.key }));
      const contentLength = Number(head.ContentLength || 0);
      totalSourceBytes += contentLength;
      if (!contentLength || totalSourceBytes > MAX_SOURCE_BYTES) {
        throw new Error("The combined source files exceed the 2 GB rendering limit.");
      }
      if (media.type === "image" && !String(head.ContentType || "").startsWith("image/")) {
        throw new Error("A clip image source has an invalid content type.");
      }
      if (media.type === "video" && !String(head.ContentType || "").startsWith("video/")) {
        throw new Error("A clip video source has an invalid content type.");
      }

      const destination = join(workDir, `source-${index}${safeExtension(media, head.ContentType)}`);
      const downloadedBytes = await downloadSource(media.key, destination);
      if (downloadedBytes !== contentLength) {
        throw new Error("An S3 source download was incomplete.");
      }
      localFiles.push(destination);

      if (media.type === "video") {
        const metadata = await runProbe(destination);
        const hasVideo = (metadata.streams || []).some(stream => stream.codec_type === "video");
        if (!hasVideo) throw new Error("A selected video file has no video stream.");
        const sourceDuration = Number(metadata.format?.duration || 0);
        const timeline = plan.timeline[index];
        if (sourceDuration > 0 && timeline.trimStart + timeline.duration > sourceDuration + 0.25) {
          throw new Error("A video trim range extends beyond the source file.");
        }
        hasAudio.push((metadata.streams || []).some(stream => stream.codec_type === "audio"));
      } else {
        hasAudio.push(false);
      }

      latestProgress = 5 + Math.round(((index + 1) / plan.mediaItems.length) * 10);
      await updateRenderFields(job.clipId, job.userId, job.renderVersion, { progress: latestProgress });
    }

    const textFilePaths = [];
    for (let index = 0; index < plan.textLayers.length; index += 1) {
      const filePath = join(workDir, `overlay-${index}.txt`);
      await writeFile(filePath, plan.textLayers[index].text, { encoding: "utf8", mode: 0o600 });
      textFilePaths.push(filePath);
    }

    const graph = buildClipFilterGraph({ plan, textFilePaths, hasAudio });
    const outputPath = join(workDir, "rendered.mp4");
    const inputArgs = buildFfmpegInputArgs(plan, localFiles);
    const args = [
      "-hide_banner",
      "-y",
      ...inputArgs,
      "-filter_complex", graph.filterComplex,
      "-map", "[vout]",
      "-map", "[aout]",
      "-t", graph.outputDuration.toFixed(3),
      "-c:v", "libx264",
      "-preset", process.env.FFMPEG_PRESET || "veryfast",
      "-crf", process.env.FFMPEG_CRF || "22",
      "-profile:v", "high",
      "-level:v", "4.1",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ar", "48000",
      "-ac", "2",
      "-movflags", "+faststart",
      "-max_muxing_queue_size", "2048",
      "-progress", "pipe:1",
      "-nostats",
      outputPath,
    ];

    latestProgress = 16;
    await updateRenderFields(job.clipId, job.userId, job.renderVersion, { progress: latestProgress });
    await runProcess(FFMPEG, args, {
      totalDuration: graph.outputDuration,
      onProgress: async value => {
        latestProgress = Math.max(latestProgress, Math.round(value));
        await updateRenderFields(job.clipId, job.userId, job.renderVersion, { progress: latestProgress });
      },
    });

    const outputStat = await stat(outputPath);
    if (!outputStat.size) throw new Error("FFmpeg produced an empty output file.");

    latestProgress = 97;
    await updateRenderFields(job.clipId, job.userId, job.renderVersion, { progress: latestProgress });
    const renderedMediaKey = `media/${job.userId}/clips/rendered/${job.clipId}/v${job.renderVersion}.mp4`;
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: renderedMediaKey,
      Body: createReadStream(outputPath),
      ContentLength: outputStat.size,
      ContentType: "video/mp4",
      CacheControl: "private, max-age=31536000, immutable",
      Metadata: {
        clipid: job.clipId,
        renderversion: String(job.renderVersion),
      },
    }));

    await updateRenderFields(job.clipId, job.userId, job.renderVersion, {
      status: "ready",
      progress: 100,
      renderedMediaKey,
      renderedDuration: graph.outputDuration,
      error: "",
      removeLease: true,
    });
    console.info("Clip render completed", {
      clipId: job.clipId,
      bytes: outputStat.size,
      duration: graph.outputDuration,
      dimensions: `${OUTPUT_WIDTH}x${OUTPUT_HEIGHT}`,
    });
  } finally {
    clearInterval(heartbeat);
    await heartbeatPromise.catch(() => {});
    await rm(workDir, { recursive: true, force: true });
  }
}

async function markFailed(job, error) {
  const safeMessage = (error instanceof Error ? error.message : String(error))
    .replace(/\s+/g, " ")
    .slice(0, 450);
  await updateRenderFields(job.clipId, job.userId, job.renderVersion, {
    status: "failed",
    progress: 0,
    error: safeMessage || "Clip rendering failed. Please try again.",
    removeLease: true,
  });
}

async function deleteMessage(receiptHandle) {
  await sqs.send(new DeleteMessageCommand({
    QueueUrl: QUEUE_URL,
    ReceiptHandle: receiptHandle,
  }));
}

async function processMessage(message) {
  let job;
  try {
    job = JSON.parse(message.Body || "");
    if (
      job?.schemaVersion !== 1 ||
      typeof job.clipId !== "string" ||
      typeof job.userId !== "string" ||
      !Number.isSafeInteger(Number(job.renderVersion))
    ) {
      console.error("Discarding malformed clip render message");
      await deleteMessage(message.ReceiptHandle);
      return;
    }
    job.renderVersion = Number(job.renderVersion);
  } catch {
    console.error("Discarding invalid JSON clip render message");
    await deleteMessage(message.ReceiptHandle);
    return;
  }

  try {
    await renderClip(job, message.ReceiptHandle);
    await deleteMessage(message.ReceiptHandle);
  } catch (error) {
    console.error("Clip rendering failed", { clipId: job.clipId, error });
    try {
      await markFailed(job, error);
      await deleteMessage(message.ReceiptHandle);
    } catch (stateError) {
      // Leave the message in SQS. A later delivery can recover after the lease expires.
      console.error("Could not persist clip render failure; message will be retried", stateError);
    }
  }
}

async function main() {
  console.info("Zenigram clip renderer started", {
    region: REGION,
    bucket: BUCKET,
    queue: QUEUE_URL,
    ffmpeg: FFMPEG,
  });
  while (true) {
    try {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: QUEUE_URL,
        MaxNumberOfMessages: 1,
        WaitTimeSeconds: 20,
        VisibilityTimeout: VISIBILITY_SECONDS,
        AttributeNames: ["ApproximateReceiveCount"],
      }));
      const message = response.Messages?.[0];
      if (message) await processMessage(message);
    } catch (error) {
      console.error("Clip renderer poll failed", error);
      await sleep(3000);
    }
  }
}

main().catch(error => {
  console.error("Clip renderer fatal error", error);
  process.exitCode = 1;
});
