# Zenigram Mobile API and Authentication Contract

## Current implementation state

The first native authentication slice is implemented on the mobile/social-graph branch:

| Endpoint | Status | Purpose |
| --- | --- | --- |
| POST /api/mobile/auth/login | Implemented | Verify existing credentials and issue a mobile session |
| POST /api/mobile/auth/refresh | Implemented | Rotate a refresh token and issue a new access token |
| POST /api/mobile/auth/logout | Implemented | Revoke the current device-session family |
| GET /api/mobile/auth/session | Implemented | Return the active account linked to a valid access token |
| POST /api/mobile/auth/logout-all | Pending | Revoke every device session for an account |

The native client stores access/refresh tokens through Expo SecureStore and refreshes after an API 401. The Home feed, Feed Control Center, profile reads, creator discovery and core social-graph actions are connected to the existing backend. Converted routes continue to accept web NextAuth sessions as well as mobile bearer tokens.

## Authentication architecture

The web app continues to use NextAuth v4 and browser cookies. The native app uses a separate mobile token system; it does not receive, copy, or share the NextAuth token or secret.

- Access tokens are HS256-signed, issuer- and audience-scoped tokens with a 15-minute lifetime.
- The server key is ZENIGRAM_MOBILE_AUTH_SECRET. It must be at least 32 bytes and must be set only in server-side local/Vercel environment variables. Generate a high-entropy value (for example, openssl rand -base64 48). Never put it in mobile/.env, EXPO_PUBLIC_ variables, source control, or the app bundle.
- Refresh tokens contain a random session identifier and a high-entropy secret. DynamoDB stores only a SHA-256 hash of the secret.
- Refresh tokens rotate on use. Reuse of a valid already-rotated token revokes the entire device-session family.
- Session and family records are stored in the existing DYNAMODB_TABLE_NAME table under MOBILESESSION#... and MOBILEFAMILY#... partition keys. The handlers check expiry and revocation in application logic.
- Configure DynamoDB TTL on the numeric expiresAt attribute for cleanup of expired mobile session/family records. TTL cleanup is asynchronous and is not used as the authorization check.
- The native API client reads tokens from Expo SecureStore (iOS Keychain / Android Keystore integration) and retries a failed request once after a successful refresh.
- The shared server request helper accepts either a NextAuth web session or a valid mobile bearer token. An explicitly supplied invalid Authorization header does not fall back to a browser cookie.

## Server environment setup

Set ZENIGRAM_MOBILE_AUTH_SECRET in the local Next.js server environment and in the Vercel environments used by the API (Preview and Production as appropriate). Keep this separate from NEXTAUTH_SECRET. Do not set this variable in the Expo app.

In mobile/.env, set EXPO_PUBLIC_API_URL to the HTTPS origin of the deployed Next.js API. For local testing on a physical phone, use the development computer's LAN IP and port, not localhost.

## Security gates still required before public release

- Login now uses a DynamoDB-backed fixed-window limiter (8 attempts per IP/identifier and 40 per IP per 15 minutes, with hashed identifiers); add an equivalent refresh-endpoint limiter and abuse monitoring before public release.
- Implement logout-all and user-visible per-device session management.
- Add native Google and Apple OAuth with authorization-code + PKCE flows; do not ship provider client secrets.
- Add registration, email/phone verification, recovery and other account flows.
- Test invalid, expired, wrong-audience, revoked and replayed tokens, concurrent refresh attempts, inactive accounts, and offline behavior.
- Validate the DynamoDB IAM policy and retention/TTL configuration for the new session records.
- Confirm token values never appear in logs, analytics, crash reports, source maps or API responses other than the intended issuance/refresh response.
- Complete web-session regression tests; do not weaken existing cookie/CSRF protections.

## Protected API integration status

The shared bearer-auth helper is connected to these existing route families:

- /api/posts and /api/post — feed retrieval, post creation and post interactions
- /api/feed-preferences — read, write and feedback actions
- /api/user/me and /api/userPosts — current profile/progression and visible profile posts
- /api/profile and /api/profile-update — public profile reads and profile edits
- /api/search/users and /api/support-suggestions — creator search and ranked suggestions
- /api/support, /api/support/cancel, /api/support/respond and /api/check-request — support, hidden-account requests and request decisions
- /api/users/block, /api/users/blocked and /api/users/unblock-request — block, unblock, blocked-account list and unblock-request workflows
- /api/media/upload — signed S3 and multipart upload instruction requests
- /api/clips, /api/stories, /api/story-globe, /api/story-upload — native story and clip APIs
- /api/conversations and /api/messages — native inbox and messaging APIs
- /api/notifications — notification list and read state

The following route families still need route-by-route mobile authorization audit and device testing:

| Feature | Existing route family |
| --- | --- |
| Saved content | /api/saved-collections and saved-content routes |
| Safety / privacy | /api/content-audience, /api/reports, remaining account/privacy routes |
| Missions / progression | /api/missions, /api/badges, /api/support, /api/trails (beyond social support actions) |

For each remaining route, record methods, request/response schema, pagination, authorization, idempotency, rate limits and error format before writing its mobile service.

## Media upload requirements

Continue to use private S3. The mobile app requests a short-lived signed upload instruction from the Next.js API, uploads directly to S3, and submits the resulting object key to the authorized feature endpoint. Never embed AWS credentials or make the bucket public.

Support cancellation, retries, byte-based progress, multipart completion/abort, content-type and size validation, and cleanup of incomplete uploads. Verify signed-read URL expiry and refresh behavior in native image/video components.

## Realtime requirements

The custom server.js Socket.IO process is not run by a standard Vercel Next.js Function deployment. Before enabling mobile realtime in production, provide a separately hosted persistent Socket.IO gateway or supported managed realtime service. Authenticate socket handshakes with the mobile access token, authorize every room/action, and retain polling fallback for reconnect/offline cases.

## Acceptance tests

- A web NextAuth session continues to work unchanged.
- Mobile bearer tokens work without browser cookies on every explicitly enabled route.
- Invalid, expired, wrong-audience, revoked and replayed refresh tokens are rejected.
- A user cannot read or mutate another user's private resources by changing IDs.
- Logout revokes the server session, not merely local token storage.
- No privileged secret appears in the JS bundle, source maps, logs or network responses.
- S3 uploads remain private and cannot overwrite unauthorized objects.
- Realtime connections reject missing/expired tokens and unauthorized room joins.
