# Zenigram Clip Renderer

For bearer-authenticated native mobile clip creation, the Next.js API verifies source files in S3, stores the edit timeline in DynamoDB, and publishes a small message to SQS. Website cookie-session clip publishing remains on the existing non-render path. The worker runs outside Vercel, downloads the private source assets, renders one vertical MP4 with FFmpeg, uploads the result to S3, and marks the clip ready in DynamoDB.

The worker is deliberately separate from the Next.js request lifecycle. Do not run FFmpeg inside a Vercel Route Handler.

## 1. Render output

- MP4 / H.264 video / AAC audio
- 1080 × 1920 (9:16), 30 FPS, yuv420p
- Video trims and scene durations
- Per-scene colour filters: Original, Cinema, Warm, Cool, Mono, Oslo, Tokyo and Rio
- Timed text overlays drawn into the final frames
- Cut, Fade, Slide and Zoom scene transitions
- Video scene audio is retained; image scenes and silent videos receive silence so the final track remains continuous
- Original source assets and edit metadata remain in S3/DynamoDB; rendered MP4 is stored at `media/{userId}/clips/rendered/{clipId}/v{renderVersion}.mp4`

Text uses DejaVu Sans. Text position, size, foreground colour, italic/bold style and background are rendered. Rotation, underline/strike and arbitrary device fonts are not yet included in the FFmpeg export.

## 2. Create the AWS queue and IAM permissions

Deploy `infra/clip-render-queue.yaml` as a CloudFormation stack in the same AWS region as the app's S3 bucket and DynamoDB table. It creates:

- Standard SQS render queue with long polling, 20-minute visibility, server-side encryption, and a dead-letter queue.
- EC2 trust role and instance profile for the worker.
- Worker permissions scoped to S3 `media/*`, this queue, and the `CLIP#*` DynamoDB partition keys.
- A separate managed API publisher policy granting only `sqs:SendMessage` on this queue.

The stack parameters are the existing `AWS_BUCKET_NAME` and `DYNAMODB_TABLE_NAME` values, plus optional queue/role names. Use CloudFormation's `CAPABILITY_NAMED_IAM` acknowledgement.

Save these stack outputs:
- `ClipRenderQueueUrl`
- `WorkerInstanceProfileName`
- `ApiPublisherPolicyArn`

Attach the returned instance profile to the EC2 worker instance. Attach the publisher managed policy to the IAM user/role whose access key is already configured in the Next.js server environment. Do not retrieve or paste the existing AWS secret key. See `infra/worker-iam-policy-notes.md` for the permission boundaries.

If the bucket uses a customer-managed KMS key, add narrowly scoped KMS decrypt/encrypt permissions for that exact key only after confirming its ARN.

## 3. Deploy the worker on a persistent EC2 host

Use an existing suitable Linux EC2 instance when possible. If you need a new instance, choose a compute-optimized x86_64 instance with enough RAM and encrypted EBS scratch space for the largest clips you expect to render. Start with an encrypted 100–150 GB gp3 EBS volume for temporary inputs/output and scale after measuring real job sizes. This is separate from the private S3 bucket.

Requirements:
- Docker Engine and Docker Compose v2 plugin
- EC2 instance profile returned by the CloudFormation stack
- IMDSv2 required on the instance
- Encrypted EBS scratch directory at `/var/lib/zenigram-clip-renderer/tmp`
- Outbound HTTPS access to SQS, S3 and DynamoDB endpoints in the selected region

The repository is public, so you can build directly from the main branch:

```bash
git clone --depth 1 --branch aws/clip-render-worker-activation https://github.com/FES-Official/Zenigram.git
cd Zenigram
sudo mkdir -p /var/lib/zenigram-clip-renderer/tmp
sudo chown 1000:1000 /var/lib/zenigram-clip-renderer/tmp
cp workers/clip-renderer/.env.worker.example workers/clip-renderer/.env.worker
```

Edit `workers/clip-renderer/.env.worker` with the real region, existing bucket/table names and queue URL. Do not put access keys or secret keys into this file. The AWS SDK uses the EC2 instance profile.

Start the worker:

Check the host with:
```bash
docker compose -f workers/clip-renderer/compose.yaml up -d --build
docker compose -f workers/clip-renderer/compose.yaml logs -f
```

The Compose service runs as non-root, uses the EC2 instance profile via IMDSv2, has a read-only root filesystem, drops Linux capabilities, and writes temporary files only to the host-mounted EBS directory. It exposes no listening port. Use `docker compose ... ps` to confirm it stays running.

## 4. Configure the Next.js server

The existing Vercel project already has `CLIP_RENDERING_ENABLED=false` in its environments. Keep it false until the SQS queue and worker are healthy.

Set these as **server-only** Vercel environment variables (never `EXPO_PUBLIC_*`):

- `CLIP_RENDER_QUEUE_URL=<ClipRenderQueueUrl output>`
- `AWS_SQS_REGION=<CloudFormation stack region>`
- `CLIP_RENDERING_ENABLED=true` only after the worker is running and a test render has succeeded

The API also needs its existing AWS S3/DynamoDB configuration. Attach `ApiPublisherPolicyArn` to the principal behind the already-configured API AWS access key; do not put new AWS credentials in the mobile app.

Recommended rollout:
1. Add the queue URL and region to Preview while leaving the flag false.
2. Deploy and verify the worker is polling SQS without authentication errors.
3. Enable rendering in Preview and create one short test clip from the mobile app.
4. Confirm that the worker uploads the rendered MP4 to S3, DynamoDB becomes `ready`, and the app plays the rendered video.
5. Only then set `CLIP_RENDERING_ENABLED=true` for Production. Trigger a Vercel redeploy so the new environment is loaded.

The async render path only activates for native requests carrying a mobile bearer token. Existing website cookie-session clip publishing remains on its legacy path.

## 5. Operations and limits

- At most 10 source segments and 120 seconds of timeline duration.
- The worker enforces a 2 GB combined source-download limit per render.
- Failed jobs are marked `failed`; the clip owner can retry through `POST /api/clips/:clipId/render`.
- Monitor SQS age, visible/in-flight messages, dead-letter queue depth, EC2 disk, CPU/memory and worker logs.
- Source and rendered S3 objects remain private. The API returns short-lived signed read URLs.
- Ensure EBS scratch volume has enough free space for downloaded sources, FFmpeg intermediates and final output.
- The DLQ is for messages that repeatedly fail before being acknowledged or whose state cannot be persisted; normal render errors are recorded as `failed` for owner retry.

## 6. Rollback

Set `CLIP_RENDERING_ENABLED=false` to stop sending new native clips to the renderer. Do not delete the SQS queues while messages remain. Allow in-flight work to complete or inspect and retry queued/failed items before dismantling the worker.
