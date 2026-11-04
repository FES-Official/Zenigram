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

## AWS deployment

The repository includes a CloudFormation stack at `infra/clip-render-stack.yaml`. It creates:

- An encrypted standard SQS queue with 20-second long polling, a 20-minute visibility timeout and a dead-letter queue.
- A worker managed policy restricted to SQS consumption, `s3:GetObject` / `PutObject` / `DeleteObject` on `media/*`, and DynamoDB `GetItem` / `UpdateItem` on the existing table.
- An EC2 worker role/instance profile with the worker policy and `AmazonSSMManagedInstanceCore`.
- A separate API publisher policy allowing only `sqs:SendMessage` to the render queue.

The stack does **not** create an EC2 instance or change existing access keys. This avoids starting a new recurring EC2 charge before checking whether an existing instance can host the worker.

### 1. Create the queue and IAM resources

In the AWS Console, open **CloudFormation → Create stack → With new resources (standard)** and upload `infra/clip-render-stack.yaml`.

Set:
- **MediaBucketName**: the existing private Zenigram S3 bucket.
- **DynamoDBTableName**: the existing Zenigram DynamoDB table.
- **DynamoDBRegion**: the table's actual region; leave blank only when it matches the stack's region.
- Keep the queue names at their defaults unless those names already exist.

Deploy the stack in the AWS region you intend to use for SQS. Save the stack outputs:
- `ClipRenderQueueUrl`
- `QueueRegion`
- `ClipRenderWorkerPolicyArn`
- `ClipRenderApiPublisherPolicyArn`
- `ClipRenderWorkerInstanceProfileName`

The Vercel API principal must be granted the publisher policy. Attach `ClipRenderApiPublisherPolicyArn` to the exact IAM user or role represented by the existing AWS credentials configured in Vercel. Do not replace or expose those keys. The instance needs the worker policy, not the API publisher policy.

### 2. Prepare the existing EC2 instance

Prefer reusing an existing EC2 instance if it has enough CPU, memory and free EBS disk for FFmpeg. The worker can use the existing instance's IAM role: attach `ClipRenderWorkerPolicyArn` to that role and ensure it already has `AmazonSSMManagedInstanceCore`. This avoids replacing an instance profile that other applications may depend on.

Alternatively, when the instance has no role attached, attach the stack's `ClipRenderWorkerInstanceProfileName`. Do not replace an existing production instance role without reviewing the permissions used by its other services.

Use **Systems Manager Session Manager** to connect; the worker needs no inbound SSH port. The instance needs outbound HTTPS connectivity to AWS APIs, Docker Hub and GitHub. If it uses IMDSv2, keep it required; for containers that access instance-role credentials, AWS recommends a metadata response hop limit of 2. The provided deployment script uses Docker host networking for instance-profile credential access.

### 3. Build and start the worker

On the EC2 instance, clone the merged `main` branch (or use the deployment script in this repository). Set these non-secret values from the CloudFormation outputs and the existing app configuration:

```bash
export CLIP_RENDER_QUEUE_URL='https://sqs.<region>.amazonaws.com/<account>/zenigram-clip-render'
export AWS_SQS_REGION='<CloudFormation QueueRegion>'
export AWS_S3_REGION='<existing S3 region>'
export AWS_DYNAMODB_REGION='<existing DynamoDB region>'
export AWS_BUCKET_NAME='<existing bucket name>'
export DYNAMODB_TABLE_NAME='<existing table name>'

sudo --preserve-env=CLIP_RENDER_QUEUE_URL,AWS_SQS_REGION,AWS_S3_REGION,AWS_DYNAMODB_REGION,AWS_BUCKET_NAME,DYNAMODB_TABLE_NAME \
  bash workers/clip-renderer/deploy-existing-ec2.sh
```

The script installs Docker if needed, builds the FFmpeg image, writes a root-only environment file with no AWS credentials, and starts the container with automatic restart. It uses the EC2 instance profile for AWS SDK authentication.

Check the host with:
```bash
docker ps --filter name=zenigram-clip-renderer
docker logs --tail 100 zenigram-clip-renderer
df -h /
```

### 4. Configure Vercel, then enable gradually

Add the following **server-side** project environment variables in Vercel for Preview first:
- `CLIP_RENDER_QUEUE_URL`: the CloudFormation queue URL.
- `AWS_SQS_REGION`: the CloudFormation `QueueRegion` output.
- `CLIP_RENDERING_ENABLED`: keep this `false` until the worker is running and its IAM access has been verified.

The existing Vercel AWS identity needs the API publisher policy for `sqs:SendMessage`. The worker's EC2 role uses a separate policy. Do not add AWS credentials to `mobile/.env`, any `EXPO_PUBLIC_*` variable, the Docker image, or the worker environment file.

After the queue and worker are healthy, redeploy Preview and publish a test clip from the native app. Confirm the job is consumed, the worker writes a rendered MP4 to the private S3 bucket, and DynamoDB changes the clip to `ready`. Only then set `CLIP_RENDERING_ENABLED=true` for Preview. Test again. Enable Production only after Preview has completed an end-to-end render successfully. Set the same queue URL and `AWS_SQS_REGION` for the Production environment and redeploy it.

Website cookie-session clip publishing remains on its legacy path; the asynchronous render flag applies only to authenticated native bearer-token requests.

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
