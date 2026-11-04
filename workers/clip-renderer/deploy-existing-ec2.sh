#!/usr/bin/env bash
set -Eeuo pipefail

# Run on an existing Amazon Linux 2 / Amazon Linux 2023 EC2 instance after
# attaching ClipRenderWorkerRole (or ClipRenderWorkerPolicy) to its instance role.
# The container uses the EC2 instance profile; do not provide AWS access keys.

required=(CLIP_RENDER_QUEUE_URL AWS_BUCKET_NAME DYNAMODB_TABLE_NAME AWS_SQS_REGION)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 2
  fi
done

AWS_S3_REGION="${AWS_S3_REGION:-$AWS_SQS_REGION}"
AWS_DYNAMODB_REGION="${AWS_DYNAMODB_REGION:-$AWS_SQS_REGION}"
ZENIGRAM_RENDERER_REF="${ZENIGRAM_RENDERER_REF:-main}"
REPO_URL="https://github.com/FES-Official/Zenigram.git"
APP_DIR="/opt/zenigram"
ENV_DIR="/etc/zenigram"
ENV_FILE="$ENV_DIR/clip-renderer.env"
CONTAINER_NAME="zenigram-clip-renderer"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script with sudo/root." >&2
  exit 2
fi

if command -v dnf >/dev/null 2>&1; then
  dnf install -y docker git
elif command -v yum >/dev/null 2>&1; then
  yum install -y docker git
else
  echo "This script supports Amazon Linux 2 and Amazon Linux 2023." >&2
  exit 2
fi

systemctl enable --now docker

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch --depth 1 origin "$ZENIGRAM_RENDERER_REF"
  git -C "$APP_DIR" checkout -B "$ZENIGRAM_RENDERER_REF" FETCH_HEAD
else
  git clone --depth 1 --branch "$ZENIGRAM_RENDERER_REF" "$REPO_URL" "$APP_DIR"
fi

install -d -m 0750 "$ENV_DIR"
umask 077
cat > "$ENV_FILE" <<EOF
AWS_SQS_REGION=$AWS_SQS_REGION
AWS_S3_REGION=$AWS_S3_REGION
AWS_DYNAMODB_REGION=$AWS_DYNAMODB_REGION
AWS_REGION=$AWS_SQS_REGION
AWS_BUCKET_NAME=$AWS_BUCKET_NAME
DYNAMODB_TABLE_NAME=$DYNAMODB_TABLE_NAME
CLIP_RENDER_QUEUE_URL=$CLIP_RENDER_QUEUE_URL
EOF
chmod 0600 "$ENV_FILE"

docker build -f "$APP_DIR/workers/clip-renderer/Dockerfile" -t zenigram-clip-renderer:latest "$APP_DIR"

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

# Host networking lets the AWS SDK in the container use the EC2 instance
# profile through IMDSv2. No AWS credentials are placed in the container env.
docker run -d \
  --name "$CONTAINER_NAME" \
  --network host \
  --restart unless-stopped \
  --env-file "$ENV_FILE" \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  zenigram-clip-renderer:latest

echo
echo "Renderer container started."
echo "Check status: docker ps --filter name=$CONTAINER_NAME"
echo "Check logs:   docker logs --tail 100 $CONTAINER_NAME"
echo "Check disk:   df -h /"
