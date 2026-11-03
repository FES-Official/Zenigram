# Mobile Conversion Status

Work branch: mobile/social-graph.
Audit date: 2026-11-03.

## Completed in this branch

- Confirmed and retained the existing Expo Router / React Native / TypeScript / NativeWind project for iOS and Android.
- Added separate mobile login, refresh, session and logout API handlers.
- Added HS256 access tokens (15-minute lifetime), rotating high-entropy refresh tokens, SHA-256 refresh-secret hashes, DynamoDB session/family records, session revocation, and refresh-token replay-family revocation.
- Added a shared server request-auth helper that accepts NextAuth web sessions or explicit mobile bearer tokens. Invalid Authorization headers never fall back to browser cookies.
- Enabled bearer authentication on /api/posts, /api/feed-preferences, /api/user/me, and /api/media/upload.
- Added native Axios refresh-and-retry behavior using tokens stored by Expo SecureStore.
- Connected the native Home feed to the existing ranked feed API, with Stories tray and Stories Globe entry.
- Added a native Feed Control Center for feed mode, source weights, topic weights, and topic mute/unmute using existing preference endpoints.
- Added native post creation with multi-photo selection, caption/topics/audience controls, signed S3 uploads, progress reporting and failed-upload cleanup.
- Added native post comments/replies and comment likes, plus feed post like/save actions.
- Added native vertical Clips playback, likes/views/saves/interest feedback, comments/replies, a saved-clips library with visibility checks, and a single-video creator using resumable multipart S3 upload.
- Added a native geotagged image Story composer, Story viewer/engagement, Story comments/replies, and Stories Globe map/discovery.
- Enabled bearer auth for the story, clip (including saved clips), conversation/message, profile-update and notification API families while retaining NextAuth cookie auth for the web app.
- Added native conversation inbox and text chat with server-side read receipt updates; manual refresh is currently the fallback while persistent realtime is not connected.
- Added native notification list/read state with accept/reject actions for incoming support requests and unblock requests.
- Added native creator discovery with debounced username search and backend-ranked support suggestions.
- Added public native creator profiles with supporter, supporting and Close Ones lists, mutual-support context, hidden-account request/cancel flows and block controls.
- Added a Blocked Accounts screen with server-backed unblock actions.
- Enabled bearer auth for creator search, support/suggestions, support-request status/cancel/respond, profile reads and profile-post reads, plus block/unblock-request workflows. Web NextAuth cookie sessions remain supported.
- Connected profile/progression reads and native sign-out.
- Preserved the existing Next.js web app, DynamoDB data model, and private S3 upload mechanism.

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
- Clips currently publish one selected video with a basic timeline; the full multi-asset editor (trim, text layers, filters and transitions) remains outstanding. Stories also need full editor parity and video-story playback.
- Social graph foundation is connected; remaining work includes pagination for large connection lists, end-to-end unblock-request testing and broader privacy/report controls.
- Saved collections, Z+ security/device sessions, missions, supporter milestone banners and legal/privacy screens still need native UI and route-by-route authorization work.
- Additional route families still use NextAuth cookie auth and have not yet been enabled for mobile bearer tokens.
- No automated parity, security, accessibility, performance or end-to-end device tests have been run yet.

## Next implementation passes

1. Add tests and rate limits around the mobile auth/session contract; run root web regression and mobile TypeScript/Expo checks.
2. Finish native post parity: sharing, media carousels, audience settings and post editing/deletion.
3. Finish story and clip editor parity, including video stories, multi-asset timelines, filters, text overlays and location privacy.
4. Add social-graph pagination and privacy/security tests; complete saved collections, Z+ security and device-session management.
5. Build realtime messaging/drawing/media with authenticated persistent Socket.IO hosting and offline fallback.
6. Complete missions/progression/milestones, legal/privacy screens, accessibility and store requirements.

## Release gate

Do not call the app feature-complete or submit it to Google Play / Apple App Store until feature parity, security controls, build signing, automated tests, and real iOS + Android device QA are complete.
