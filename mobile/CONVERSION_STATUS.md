# Mobile Conversion Status

Work branch: mobile/ios-android-conversion.
Audit date: 2026-11-03.

## Completed in this branch

- Confirmed and retained the existing Expo Router / React Native / TypeScript / NativeWind project for iOS and Android.
- Added separate mobile login, refresh, session and logout API handlers.
- Added HS256 access tokens (15-minute lifetime), rotating high-entropy refresh tokens, SHA-256 refresh-secret hashes, DynamoDB session/family records, session revocation, and refresh-token replay-family revocation.
- Added a shared server request-auth helper that accepts NextAuth web sessions or explicit mobile bearer tokens. Invalid Authorization headers never fall back to browser cookies.
- Enabled bearer authentication on /api/posts, /api/feed-preferences, /api/user/me, and /api/media/upload.
- Added native Axios refresh-and-retry behavior using tokens stored by Expo SecureStore.
- Connected the native Home feed to the existing ranked feed API.
- Added a native Feed Control Center for feed mode, source weights, topic weights, and topic mute/unmute using existing preference endpoints.
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
- Clips, story editor/viewer/Globe, native video playback, native camera/gallery, publishing, likes/comments/shares/saves, messaging/drawing, Socket.IO realtime, notifications, search, full profile editing, hidden/block controls, Z+ security, collections, missions and supporter banners are not yet ported/connected.
- Additional route families still use NextAuth cookie auth and have not yet been enabled for mobile bearer tokens.
- No automated parity, security, accessibility, performance or end-to-end device tests have been run yet.

## Next implementation passes

1. Add tests and rate limits around the mobile auth/session contract; run root web regression and mobile TypeScript/Expo checks.
2. Complete native posts (likes, comments, saves, share and audience controls) and media upload progress/cancellation.
3. Connect stories, then native clips/video playback and multipart upload.
4. Connect profiles, social graph, privacy/blocking, search, notifications and saved collections.
5. Build realtime messaging/drawing with authenticated persistent Socket.IO hosting and offline fallback.
6. Complete missions/progression/milestones, legal/privacy screens, accessibility and store requirements.

## Release gate

Do not call the app feature-complete or submit it to Google Play / Apple App Store until feature parity, security controls, build signing, automated tests, and real iOS + Android device QA are complete.
