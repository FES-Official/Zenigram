FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY workers/clip-renderer/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY workers/clip-renderer/ ./
RUN chown -R node:node /app
USER node

CMD ["node", "worker.mjs"]
