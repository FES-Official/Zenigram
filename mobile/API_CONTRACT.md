# Zenigram Mobile API and Authentication Contract

## Why a separate mobile contract is required

The current Next.js application uses NextAuth v4 JWT sessions delivered through browser cookies. Native iOS and Android clients must not copy browser cookies, share the NextAuth signing secret, or treat a client-side "logged in" flag as authorization.

The current mobile sign-in screen calls POST /api/mobile/auth/login, but this route is not present in the inspected Next.js API tree yet. The mobile app is therefore a UI/client foundation, not a working authenticated app.

## Required authentication design

Implement server-side endpoints before connecting protected screens:

| Endpoint | Purpose |
| --- | --- |
| POST /api/mobile/auth/login | Verify credentials and issue a short-lived access token plus rotating refresh token |
| POST /api/mobile/auth/refresh | Rotate refresh token, invalidate its previous value, and issue a new access token |
| POST /api/mobile/auth/logout | Revoke the current refresh-token family/device session |
| POST /api/mobile/auth/logout-all | Revoke all sessions for the authenticated account |
| GET /api/mobile/auth/session | Return the authenticated user's current account/session state |

Security requirements:

- Generate opaque, high-entropy refresh tokens; store only a cryptographic hash server-side.
- Use short-lived, audience-scoped access tokens and validate signature, issuer, audience, expiry, account status, and revocation/session version on every protected request.
- Rotate refresh tokens on every refresh. Detect reuse of an already-rotated token and revoke its token family.
- Store device/session metadata and support per-device revocation.
- Apply rate limits to login, refresh, verification, and recovery endpoints; use generic credential errors.
- Keep all signing keys, token hashes, AWS credentials, and provider secrets server-side in Vercel environment variables.
- Store access and refresh tokens in iOS Keychain / Android Keystore through Expo SecureStore. Never store tokens in AsyncStorage or logs.
- Add Google and Apple OAuth using native-compatible authorization-code + PKCE flows. Do not ship provider client secrets.
- Check account status and authorization on the server; hiding a button in the app is not access control.
- Define refresh behavior for clock skew, offline mode, expired sessions, concurrent refresh requests, and revoked accounts.

## Protected API integration

The mobile Axios client sends Authorization: Bearer access-token. Add a shared server helper that validates this token and resolves the same user identity used by existing web routes. Update route handlers to accept either a valid web session or a valid mobile bearer token without weakening authorization checks.

Do not globally bypass CSRF or cookie protections. Keep browser and mobile authentication paths explicit and test both.

## Existing feature API families to audit

| Feature | Existing route family |
| --- | --- |
| Feed/posts | /api/posts, /api/post, /api/userPosts |
| Feed preferences | /api/feed-preferences |
| Clips | /api/clips |
| Media | /api/media/upload, /api/story-upload |
| Stories / globe | /api/stories, /api/story-globe |
| Messaging | /api/conversations, /api/messages |
| Profiles / social graph | /api/profile, /api/profile-update, /api/user, /api/users |
| Search / notifications | /api/search, /api/notifications |
| Saved content | /api/saved-collections and saved-content routes |
| Safety / privacy | /api/content-audience, /api/reports, account and block/privacy routes |
| Missions / progression | /api/missions, /api/badges, /api/support, /api/trails |

For each route, record HTTP methods, request/response schema, pagination cursor, auth method, authorization rules, idempotency behavior, rate limit, and error format before writing its mobile service.

## Media upload requirements

Continue to use private S3. The mobile app must request a short-lived signed upload instruction from the Next.js API, upload directly to S3, and submit the resulting object key to the authorized feature endpoint. Never embed AWS credentials or make the bucket public.

Support cancellation, retries, byte-based progress, multipart completion/abort, content-type and size validation, and cleanup of incomplete uploads. Verify signed-read URL expiry and refresh behavior in native image/video components.

## Realtime requirements

The custom server.js Socket.IO process is not run by a standard Vercel Next.js Function deployment. Before enabling mobile realtime in production, provide a separately hosted persistent Socket.IO gateway or a supported managed realtime service. Authenticate socket handshakes with the mobile access token, authorize every room/action, and retain polling fallback for reconnect/offline cases.

## Acceptance tests

- A web NextAuth session continues to work unchanged.
- Mobile bearer tokens work without browser cookies.
- Invalid, expired, wrong-audience, revoked, and replayed refresh tokens are rejected.
- A user cannot read or mutate another user's private resources by changing IDs.
- Logout revokes the server session, not merely local token storage.
- No privileged secret appears in the JS bundle, source maps, logs, or network responses.
- S3 uploads remain private and cannot overwrite unauthorized objects.
- Realtime connections reject missing/expired tokens and unauthorized room joins.
