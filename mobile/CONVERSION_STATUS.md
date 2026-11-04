# Mobile Conversion Status

Work branch: mobile/video-render-pipeline (based on current main).
Audit date: 2026-11-04.

## Completed in this branch

- Confirmed and retained the existing Expo Router / React Native / TypeScript / NativeWind project for iOS and Android.
- Added separate mobile login, refresh, session and logout API handlers.
- Added HS256 access tokens (15-minute lifetime), rotating high-entropy refresh tokens, SHA-256 refresh-secret hashes, DynamoDB session/family records, session revocation, and refresh-token replay-family revocation.
- Added a shared server request-auth helper that accepts NextAuth web sessions or explicit mobile bearer tokens. Invalid Authorization headers never fall back to browser cookies.
- Enabled bearer authentication on /api/posts, /api/feed-preferences, /api/user/me, and /api/media/upload.
- Added native Axios refresh-and-retry behavior using tokens stored by Expo SecureStore.
- Connected the native Home feed to the existing ranked feed API, with Stories tray and Stories Globe entry.
- Added a native Feed Control Center for feed mode, source weights, topic weights, and topic mute/unmute using existing preference endpoints.
- Added native mixed-media post creation with up to 10 photos/videos, caption/topics/audience controls, signed S3 and multipart uploads, progress reporting, media ordering, and single/carousel/grid presentation settings (carousel styles, grid layouts and aspect ratios).
- Added native post comments/replies and comment likes, plus feed post like/save actions.
- Added native vertical Clips playback, likes/views/saves/interest feedback, comments/replies and a saved-clips library with visibility checks. Replaced the single-video creator with a mixed image/video Clips Studio: multi-scene timeline, ordering, per-video trim start and segment length, photo duration, filter metadata, timed text overlays, transition selection, topics/audience and signed S3/multipart publishing. The old create-clip route points to the Studio. The editor preview follows the timeline playhead, switches between image/video scenes, and seeks/loops video scenes within the chosen trim interval. Added an optional SQS + separate FFmpeg worker rendering pipeline for bearer-authenticated native clip creation: validated edit decision list, server-side queue publisher, DynamoDB render lifecycle, owner-only render status/retry API, hidden pending clips from public feed, and an Expo render progress screen. Existing website cookie-session clip publishing remains unchanged.
- Added a native Story Studio with up to six images, website-inspired full-frame, split, duo, hero, columns, grid, mosaic and six-image layouts, black-cherry/crimson/burgundy background presets, adjustable collage gaps and corner radii, image filters, up to eight text layers, freehand SVG drawing, adjustable story duration, caption and explicit Stories Globe location consent. The Studio snapshots the 9:16 composition as a PNG and uploads one image, matching the story API's single-media contract. Story viewer/engagement, comments/replies, and Stories Globe map/discovery remain connected.
- Enabled bearer auth for the story, clip (including saved clips), conversation/message, profile-update and notification API families while retaining NextAuth cookie auth for the web app.
- Added native conversation inbox and text chat with server-side read receipt updates; manual refresh is currently the fallback while persistent realtime is not connected.
- Added native notification list/read state with accept/reject actions for incoming support requests and unblock requests.
- Added native creator discovery with debounced username search and backend-ranked support suggestions.
- Added public native creator profiles with supporter, supporting and Close Ones lists, mutual-support context, hidden-account request/cancel flows and block controls.
- Added a Blocked Accounts screen with server-backed unblock actions.
- Enabled bearer auth for creator search, support/suggestions, support-request status/cancel/respond, profile reads and profile-post reads, plus block/unblock-request workflows. Web NextAuth cookie sessions remain supported.
- Connected profile/progression reads and native sign-out.
- Preserved the existing Next.js web app, DynamoDB data model, and private S3 upload mechanism.

## Clip rendering setup (optional; disabled until infrastructure is deployed)

1. Deploy `workers/clip-renderer/infra/clip-render-queue.yaml` in the same AWS region used by the application. Set the resulting queue URL as server-only `CLIP_RENDER_QUEUE_URL`.
2. Set server-only `CLIP_RENDERING_ENABLED=true` and `AWS_SQS_REGION` (or ensure `AWS_REGION` / `AWS_DYNAMODB_REGION` is correct). Do not expose AWS credentials to Expo.
3. Build and run `workers/clip-renderer/Dockerfile` on EC2 or another persistent worker host with FFmpeg installed. Use an instance/task role for SQS receive/delete/visibility, S3 source read and rendered output write, and DynamoDB clip read/update.
4. Keep the S3 bucket private. Give the worker read/write only to `media/*`; use an encrypted bucket and allow the API to return short-lived signed read URLs.
5. Monitor the queue and dead-letter queue, worker disk/CPU, render failures and S3 object sizes. The renderer currently rejects combined source assets above 2 GB and total timeline above 120 seconds.
6. The mobile app routes queued clip publication to `/clip/rendering/[clipId]`, polls render progress, displays the finished preview, and allows an owner to retry failed renders.

Legacy publishing remains the default with `CLIP_RENDERING_ENABLED=false`. The worker code and API contract exist, but AWS provisioning, IAM policy attachment, worker deployment and end-to-end render verification remain release gates.

## Important setup needed before testing the mobile login

1. Set ZENIGRAM_MOBILE_AUTH_SECRET as a server-only environment variable for local Next.js and Vercel Preview/Production. Generate a high-entropy secret (example: openssl rand -base64 48). Keep it separate from NEXTAUTH_SECRET; never add it to mobile/.env.
2. Set EXPO_PUBLIC_API_URL in mobile/.env to the HTTPS origin of the Next.js API. For physical-device local testing, use the computer's LAN IP, not localhost.
3. Configure DynamoDB TTL on the numeric expiresAt attribute for eventual cleanup of expired session records. API authorization independently checks expiry and revocation.

## Not complete / not yet verified

- These source changes have not yet been built or run on an iOS Simulator, physical iPhone, Android emulator, or Android device in this session.
- The Vercel web build is not a native React Native build. A preview deployment of the Next.js API does not establish that the Android/iOS app compiles.
- A distributed fixed-window limiter now protects login (8 attempts per IP/identifier and 40 per IP per 15 minutes); refresh-endpoint limiting and abuse monitoring are still required before public exposure.
- Logout-all, device session management, registration, verification, password recovery, Google/Apple native OAuth and account recovery are not implemented.
- Messaging still needs realtime Socket.IO on a persistent host, media/drawing attachments, replies/forwarding/reactions and group workflows in the native UI.
- The SQS/FFmpeg renderer is implemented in source but has not been deployed against the AWS account or exercised with real S3 uploads. Keep CLIP_RENDERING_ENABLED=false until the SQS queue, worker container, IAM permissions, and bucket/disk capacity are configured. Text overlay rotation, underline/strike and arbitrary device fonts are not yet baked into FFmpeg output. Native Clips playback still needs sequential mixed-media scene playback and rendered transition parity in the editor preview. Story Studio currently composes photos only; video stories, website image dragging/individual image transforms, mission and user-mention flows are not yet ported. Post editor has mixed media, layout controls and upload, but advanced per-image adjustment/export parity remains outstanding.
- Social graph foundation is connected; remaining work includes pagination for large connection lists, end-to-end unblock-request testing and broader privacy/report controls.
- Saved collections, Z+ security/device sessions, missions, supporter milestone banners and legal/privacy screens still need native UI and route-by-route authorization work.
- Additional route families still use NextAuth cookie auth and have not yet been enabled for mobile bearer tokens.
- No automated parity, security, accessibility, performance or end-to-end device tests have been run yet.

## Next implementation passes

1. Add tests and rate limits around the mobile auth/session contract; run root web regression and mobile TypeScript/Expo checks.
2. Finish native post parity: rendered photo adjustments, sharing, post editing/deletion and automated mixed-media regression tests.
3. Deploy and verify the SQS/FFmpeg renderer; finish native sequential Clips scene playback and remaining overlay style parity; then add video-story editing and port remaining Story website features (missions, mentions, richer drawing/layout effects).
4. Add social-graph pagination and privacy/security tests; complete saved collections, Z+ security and device-session management.
5. Build realtime messaging/drawing/media with authenticated persistent Socket.IO hosting and offline fallback.
6. Complete missions/progression/milestones, legal/privacy screens, accessibility and store requirements.

## Release gate

Do not call the app feature-complete or submit it to Google Play / Apple App Store until feature parity, security controls, build signing, automated tests, and real iOS + Android device QA are complete.
