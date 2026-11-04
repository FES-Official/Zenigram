# Zenigram

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
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
EMAIL_FROM=
MSG91_AUTH_KEY=
MSG91_OTP_TEMPLATE_ID=
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
SES_FROM_EMAIL=
AWS_SES_REGION=
AWS_SNS_REGION=
OTP_SECRET=
# Set true only when running the custom Node server (server.js).
NEXT_PUBLIC_REALTIME_ENABLED=false
```

Set `AWS_DYNAMODB_REGION` for DynamoDB (or use `AWS_REGION` as the shared AWS
region). Set both service-specific values when S3 and DynamoDB are in
different regions; the app deliberately does not reuse the S3 region for
DynamoDB because identically named tables can exist in multiple regions.

### Verification delivery and OTP security

Zenigram generates six-digit email and phone OTPs with Node.js `crypto`,
stores only keyed hashes in DynamoDB, and verifies codes inside the app.
Codes expire after 10 minutes, requests have a 60-second resend cooldown,
and failed attempts are limited. Email is delivered over standard SMTP using
Nodemailer as the SMTP protocol client (not Resend). SMS is delivered through
the MSG91 SMS OTP endpoint using the app-generated code; Zenigram performs
the code verification itself rather than using MSG91's verification service.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and
`EMAIL_FROM` for email. Configure `MSG91_AUTH_KEY` and
`MSG91_OTP_TEMPLATE_ID` for SMS. The MSG91 OTP template must be approved
and mapped to the applicable Indian DLT template and sender details. Set a
dedicated `OTP_SECRET`; `NEXTAUTH_SECRET` is only a fallback. Never commit
secrets. DynamoDB TTL cleanup is asynchronous; application code checks expiry.

### Realtime behavior

The custom `server.js` process hosts Socket.IO for local development and
self-hosted Node deployments. Vercel's Next.js Function deployment does not run
that custom server, so realtime is disabled there by default and the UI uses
short polling for messages, conversations, invitations, and navigation badges.
For a self-hosted production deployment using `server.js`, set
`NEXT_PUBLIC_REALTIME_ENABLED=true` to enable Socket.IO in the browser.

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
Images and small videos use a signed `PutObject`; videos at least 10 MB use
multipart upload with 10 MB parts, up to five concurrent part workers, and
three retries per failed part. The clip editor uploads multiple files in
parallel (up to two large-video uploads or four lightweight assets), reports
byte-weighted progress, and preserves the original timeline order. A failed upload is aborted and the bucket lifecycle rule also
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


## User-controlled feed

Zenigram's home feed includes a Feed Control Center. Users can choose Balanced, Your circle, Latest, My interests, or Discover; adjust topic preferences and source weights; and save those rules to their DynamoDB profile. Posts and clips offer a "Why am I seeing this?" explanation plus controls to show more or less of a topic, mute a topic, change a creator's influence, or hide a creator from the feed.

Feed preferences are served by `/api/feed-preferences` and applied to visible post candidates by `src/app/lib/feedRanking.js`. Visibility and account/privacy filters run before personalized ranking. "Latest" is chronological. Other modes use transparent, deterministic weights for selected interests, circle relationships, freshness, discovery, engagement, and optional creator adjustments.

Creators can now explicitly select up to five topics when publishing a post or clip. Those tags take precedence as feed signals, with caption and hashtag inference retained for older or untagged content. The same saved user rules apply to posts and clips; clip candidates are ranked after visibility/privacy filtering so the previous clip-personalization sort does not override the user's selected feed mode. Topic inference for untagged content remains a lightweight keyword map, not a machine-learning classifier, so ambiguous captions may still be categorized imperfectly.

<!-- CI verification trigger: story location picker fix -->
