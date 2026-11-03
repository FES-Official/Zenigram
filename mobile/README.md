# Zenigram Mobile (React Native for iOS and Android)

This directory contains the native iOS and Android client. The existing Next.js application remains the web client and server-side API during the migration.

## Product direction

Build Zenigram as a polished, independent native social application—not a WebView wrapper. Preserve the web product's feature set while adapting navigation, gestures, media capture, video playback, uploads, accessibility, and interaction patterns to iOS and Android.

The visual system follows Zenigram's dark-first black-cherry / burgundy / crimson identity, with accessible contrast and platform-appropriate safe areas, keyboard behavior, and navigation.

## Current implementation slice

- Native sign-in calls the new mobile credential endpoint.
- Separate mobile access/refresh sessions are issued by Next.js and persisted with Expo SecureStore.
- The mobile client automatically rotates an expiring/expired access session after a 401 and retries the original request once.
- Home loads the existing ranked feed, stories tray, post interactions and Feed Control Center.
- Native post creation supports multiple photos, captions, topics, audience selection and private S3 uploads.
- Stories include image creation with explicit location permission, viewer/engagement, comments and Stories Globe discovery.
- Clips include native vertical playback, engagement, comments and a native video upload flow with resumable multipart S3 transfers.
- Messaging includes a native inbox and text conversation screen; REST refresh is available while persistent Socket.IO is pending.
- Profile includes account/progression, profile picture editing, bio/website and hidden-account settings.
- Notifications can be viewed and marked read in the native client.
- The web app remains in place and its browser NextAuth session is kept separate.

See CONVERSION_STATUS.md for the live completion list and API_CONTRACT.md for server environment and security requirements.

## Non-negotiable migration rules

- Preserve the existing web app; do not replace or move its Next.js routes.
- Reuse the existing DynamoDB records, private S3 bucket, and server-side business rules.
- Never put AWS access keys, DynamoDB credentials, or privileged secrets in the mobile bundle.
- Keep mobile screens native: React Native views, navigation, gestures, media pickers, and video playback. Do not use a WebView as the application shell.
- Port and test shared pure business logic (especially feed preferences/ranking) rather than rewriting it from memory.
- Do not expose the existing NextAuth JWT or its signing secret to the mobile client.
- Treat feature placeholders as unfinished work; never claim a feature is integrated until its API contract, error states, and device tests are complete.

## Backend compatibility findings

The web APIs originally used getServerSession(authOptions) and browser cookies. A shared server request-auth helper now supports a separate native bearer token on the explicitly converted endpoints, including posts/feed, feed preferences, current user profile/profile updates, media upload, stories, clips, conversations/messages and notifications.

Other route families still need to be audited and converted explicitly. Do not globally bypass cookie/CSRF protections. See API_CONTRACT.md.

## Feature parity checklist

- [ ] Credentials and Google/Apple sign-in, sign-up, email/phone verification, logout, session restore
- [x] Home feed and five feed modes; source weights, topic weights, topic mute/unmute
- [ ] Posts: native photo creation, likes, comments/replies and saves are connected; shares, editing/deletion, richer layouts and full audience parity remain.
- [ ] Stories: image composer, explicit location tagging, viewer/engagement, comments and Stories Globe are connected; full story editor parity, video stories and story event parity remain.
- [ ] Clips: native playback, likes/views/saves/interest feedback, comments and resumable video publishing are connected; multi-asset timeline, trimming, filters and text overlays remain.
- [ ] Messaging: native inbox and text chat/read receipts are connected; groups, drawing/media messages, reactions, edits/deletes and persistent real-time updates remain.
- [ ] Profiles: profile view, picture/bio/website editing and hidden-account toggle are connected; followers/following, full privacy, blocking/unblocking and Z+ security remain.
- [ ] Notifications list/read state is connected; search, saved collections, missions/supporter milestones and professional dashboard remain.
- [ ] Reports, account controls, legal/privacy screens and accessibility

## Local development

From this directory:

    npm ci
    cp .env.example .env
    npx expo start

Set EXPO_PUBLIC_API_URL in mobile/.env to the HTTPS origin of the Next.js API. Only public API base URLs and public OAuth client identifiers belong in the mobile app. ZENIGRAM_MOBILE_AUTH_SECRET and all other server secrets stay in Vercel/server environment variables.

For a physical phone against a local dev server, use the development computer's LAN IP and port; the phone's localhost is the phone itself.

Before native builds, run:

    npx expo-doctor
    npx tsc --noEmit

Do not submit to either store until the security gates and feature parity checklist are satisfied.
