import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

let client;
function getQueueClient() {
  if (client) return client;
  const region = (
    process.env.AWS_SQS_REGION ||
    process.env.AWS_REGION ||
    process.env.AWS_DYNAMODB_REGION
  )?.trim();
  if (!region) throw new Error("AWS region is not configured for clip rendering");
  client = new SQSClient({ region });
  return client;
}

export function isClipRenderingEnabled() {
  return process.env.CLIP_RENDERING_ENABLED === "true";
}

export async function enqueueClipRenderJob({ clipId, userId, renderVersion = 1 }) {
  const queueUrl = process.env.CLIP_RENDER_QUEUE_URL?.trim();
  if (!queueUrl) throw new Error("CLIP_RENDER_QUEUE_URL is not configured");
  if (!clipId || !userId || !Number.isSafeInteger(Number(renderVersion))) {
    throw new Error("Clip render job details are invalid");
  }

  const payload = {
    schemaVersion: 1,
    clipId: String(clipId),
    userId: String(userId),
    renderVersion: Number(renderVersion),
    requestedAt: new Date().toISOString(),
  };
  const input = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  };

  if (queueUrl.endsWith(".fifo")) {
    input.MessageGroupId = String(userId).slice(0, 128);
    input.MessageDeduplicationId = `${clipId}:${renderVersion}`.slice(0, 128);
  }

  await getQueueClient().send(new SendMessageCommand(input));
  return payload;
}
