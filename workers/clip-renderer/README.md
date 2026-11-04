# Zenigram Clip Renderer

For bearer-authenticated native mobile clip creation, the Next.js API verifies source files in S3, stores the edit timeline in DynamoDB, and publishes a small message to SQS. Website cookie-session clip publishing remains on the existing non-render path. This worker runs outside Vercel, downloads the private source assets, renders one vertical MP4 with FFmpeg, uploads the result to S3, and marks the clip as ready in DynamoDB.

The worker is deliberately separate from the Next.js request lifecycle. Do not run FFmpeg inside a Vercel Route Handler.

## Render output

- MP4 / H.264 video / AAC audio
- 1080 × 1920 (9:16), 30 FPS, yuv420p
- Video trims and scene durations are applied before composition
- Per-scene colour filters: Original, Cinema, Warm, Cool, Mono, Oslo, Tokyo and Rio
- Timed text overlays are drawn into the final frames
- Cut, Fade, Slide and Zoom scene transitions
- Video scene audio is retained; image scenes and silent videos receive silence so the final track remains continuous
- Original source assets and edit metadata remain in S3/DynamoDB; the rendered MP4 is stored at `media/{userId}/clips/rendered/{clipId}/v{renderVersion}.mp4`

Text overlay font rendering uses DejaVu Sans. Text position, size, foreground colour, italic/bold style and background are rendered. Rotation, underline/strike and arbitrary device fonts are not yet included in the FFmpeg export implementation.

## AWS resources

Deploy `infra/clip-render-queue.yaml` to create a standard SQS queue and a dead-letter queue. Save the output `ClipRenderQueueUrl`.

The Next.js server needs these server-side settings:

- `CLIP_RENDERING_ENABLED=true`
- `CLIP_RENDER_QUEUE_URL=<queue URL>`
- `AWS_SQS_REGION=<queue region>` (or use the existing `AWS_REGION` / `AWS_DYNAMODB_REGION` setting)
- Existing `AWS_BUCKET_NAME`, `AWS_S3_REGION`, `AWS_DYNAMODB_REGION`, `DYNAMODB_TABLE_NAME` and AWS credentials

The API's AWS principal needs `sqs:SendMessage` on the clip-render queue. The renderer flag only activates the async path for requests carrying a valid mobile bearer token; it does not change the website's existing cookie-session publishing flow. Continue to keep AWS credentials server-side; never add them to `mobile/.env` or any `EXPO_PUBLIC_*` variable.

## Worker permissions

Prefer an EC2 instance profile / task role rather than long-lived credentials in the container. Grant only:

- SQS: `ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`, `GetQueueAttributes` on the render queue
- S3: `GetObject`, `HeadObject`, `PutObject`, `DeleteObject` (orphan cleanup) on `arn:aws:s3:::YOUR_BUCKET/media/*`
- DynamoDB: `GetItem`, `UpdateItem` on the existing `DYNAMODB_TABLE_NAME` table

If the bucket uses a customer-managed KMS key, add the minimum required KMS decrypt/encrypt permissions for that key.

## Build and run on EC2

Build from the repository root:

```bash
docker build -f workers/clip-renderer/Dockerfile -t zenigram-clip-renderer .
```

Run it with an EC2 instance role attached:

```bash
docker run -d \
  --name zenigram-clip-renderer \
  --restart unless-stopped \
  -e AWS_REGION=ap-south-1 \
  -e AWS_BUCKET_NAME=YOUR_BUCKET \
  -e DYNAMODB_TABLE_NAME=YOUR_DYNAMODB_TABLE \
  -e CLIP_RENDER_QUEUE_URL=YOUR_QUEUE_URL \
  zenigram-clip-renderer
```

Replace the example region, bucket, table and queue values with the values from your AWS account. Do not publish those values in source control if your bucket/table names are confidential.

Scale by running multiple worker containers or EC2 instances against the same standard queue. The worker uses conditional DynamoDB claims, render versions and a visibility/lease heartbeat so duplicate SQS delivery does not normally start two renders for the same version.

## Limits and operations

- The API currently accepts at most 10 source segments and 120 seconds of timeline duration.
- The worker enforces a 2 GB combined source-download limit per render.
- Failed jobs are marked `failed` and removed from the active queue after recording the error; the owner can retry through `POST /api/clips/:clipId/render`.
- Monitor SQS age, visible/in-flight messages, dead-letter queue depth, EC2 disk space, CPU/memory, and worker logs.
- Use an encrypted S3 bucket with Block Public Access enabled. Source and rendered objects are private; the API issues short-lived signed read URLs.
- Ensure the EC2 root/EBS volume has enough free disk for the source files, intermediate files and final output. Start with a worker instance sized for video CPU and temporary disk rather than a small web-only instance.

## Feature flag and rollback

Leave `CLIP_RENDERING_ENABLED` unset/false until the SQS queue, worker, permissions and status API are deployed. In that mode, existing uploads keep their legacy behaviour and clips are marked ready without FFmpeg processing.

To roll back, set `CLIP_RENDERING_ENABLED=false`. New clips use the legacy upload flow. Already queued clips should be allowed to finish or be inspected and retried after the worker is restored.
