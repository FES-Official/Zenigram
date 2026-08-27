# Zenigram App

Zenigram is a Next.js social app with credentials/Google auth, posts, comments,
likes, profile privacy, messaging, story creation, and the Stories Globe.

## Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:7860](http://localhost:7860).

## Environment

Create `.env.local` with:

```env
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:7860
NEXTAUTH_URL_INTERNAL=http://localhost:7860
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_DYNAMODB_REGION=
AWS_S3_REGION=
AWS_BUCKET_NAME=
DYNAMODB_TABLE_NAME=linkex-app
NEXT_PUBLIC_MAPBOX_TOKEN=
```

Set `AWS_DYNAMODB_REGION` for DynamoDB (or use `AWS_REGION` as the shared AWS
region). Set both service-specific values when S3 and DynamoDB are in
different regions; the app deliberately does not reuse the S3 region for
DynamoDB because identically named tables can exist in multiple regions.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run dev:stop
npm run aws:setup
```

The app is configured to run on port `7860`.

## AWS storage

The browser asks `/api/media/upload` for a short-lived signed request, uploads
the file directly to S3, and sends only the resulting object key to the post or
clip API. Next.js checks the object with `HeadObject` before writing metadata.
Images and small videos use a signed `PutObject`; videos at least 25 MB use
multipart upload with 10 MB parts, three concurrent workers, and three retries
per failed part. A failed upload is aborted and the bucket lifecycle rule also
removes incomplete multipart uploads after one day.

All application data—including users, posts, clips, stories, story events,
missions, comments, likes, supports, notifications, reports, invitations,
saved content, collections, conversations, and messages—uses DynamoDB.
The table uses on-demand billing, `PK`/`SK`, and two global secondary indexes
(`GSI1` and `GSI2`) for global and per-user feeds.

S3 objects remain private. API responses convert stable object keys into
short-lived signed read URLs so images, videos, audio, stories, and avatars are
visible without making the bucket public.

```bash
npm run aws:setup
```

`aws:setup` safely creates/verifies the table, merges the required S3 CORS rule
(`ETag` must be exposed for multipart completion), and merges the multipart
cleanup lifecycle rule.

<!-- CI verification trigger: story location picker fix -->
