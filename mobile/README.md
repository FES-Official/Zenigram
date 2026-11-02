# Zenigram Mobile (React Native for iOS and Android)

This directory contains the native iOS and Android client. The existing Next.js application remains the web client and server-side API during the migration.

## Product direction

Build Zenigram as a polished, independent native social application—not a WebView wrapper. Preserve the web product's feature set while adapting navigation, gestures, media capture, video playback, uploads, accessibility, and interaction patterns to iOS and Android.

The visual system follows Zenigram's dark-first black-cherry / burgundy / crimson identity, with accessible contrast and platform-appropriate safe areas, keyboard behavior, and navigation.

## Non-negotiable migration rules

- Preserve the existing web app; do not replace or move its Next.js routes.
- Reuse the existing DynamoDB records, private S3 bucket, and server-side business rules.
- Never put AWS access keys, DynamoDB credentials, or privileged secrets in the mobile bundle.
- Keep mobile screens native: React Native views, navigation, gestures, media pickers, and video playback. Do not use a WebView as the application shell.
- Port and test shared pure business logic (especially feed preferences/ranking) rather than rewriting it from memory.
- Do not expose the existing NextAuth JWT or its signing secret to the mobile client.
- Treat feature placeholders as unfinished work; never claim a feature is integrated until its API contract, error states, and device tests are complete.

## Current backend compatibility findings

The current Next.js APIs authenticate with getServerSession(authOptions), which relies on NextAuth browser cookies. A native app cannot safely depend on browser cookie behavior. Before mobile sign-in can be production-ready, add a mobile authentication contract (short-lived access token + rotating refresh token, revocation, expiry, device/session management, and rate limiting) and a server-side request authenticator used by mobile API requests.

Existing endpoints worth reusing after that authentication layer is added:

- GET/POST /api/posts — feed retrieval and post creation
- GET/POST /api/clips — clips feed and publishing
- GET/PUT/PATCH /api/feed-preferences — user-controlled feed
- POST /api/media/upload — signed S3 uploads and multipart video uploads
- GET/POST /api/conversations and message routes — messaging
- Stories, notifications, profile, search, saved content, audience/privacy and story-globe API routes

Every endpoint must be audited for cookie-only assumptions, browser APIs, CSRF behavior, pagination, response consistency, authorization, and mobile-safe rate limits before mobile calls it. See API_CONTRACT.md.

## Feature parity checklist

- [ ] Credentials and Google/Apple sign-in, sign-up, email/phone verification, logout, session restore
- [ ] Home feed, five feed modes, topic/source weights, mute creator/topic, "why am I seeing this?"
- [ ] Posts, multi-image layouts, topics, audience controls, likes, comments, shares, saves
- [ ] Stories, story editor, location tagging, story viewer, story events, Stories Globe
- [ ] Clips, native video playback, clip creation/editor, timeline/text overlays, upload progress
- [ ] Messaging, groups, drawing messages, reactions, edits/deletes, real-time updates and polling fallback
- [ ] Profiles, followers/following, privacy, blocking/unblocking, hidden accounts and Z+ security
- [ ] Notifications, search, saved collections, missions/supporter milestones, professional dashboard
- [ ] Reports, account controls, legal/privacy screens and accessibility

## Delivery sequence

1. Audit route contracts and feature inventory against the current main branch.
2. Stabilize the Expo + TypeScript + NativeWind foundation and shared design system.
3. Implement mobile auth/session APIs and native authentication screens.
4. Implement feed, profiles, posts, stories and clips in vertical slices.
5. Implement messaging, notifications, privacy/security and remaining features.
6. Add automated tests, iOS Simulator and Android device QA, accessibility/performance checks.
7. Configure EAS production builds, Android App Bundle signing, iOS signing/TestFlight, store listings and staged releases.

## Local development

From the mobile directory, install dependencies, copy .env.example to .env, then run npx expo start.

Set EXPO_PUBLIC_API_URL to the HTTPS base URL of the Next.js API. Only public API base URLs and public OAuth client identifiers belong in the mobile app. Server secrets remain in Vercel/server environment variables.

Before native builds, run npx expo-doctor and npx tsc --noEmit.

Do not submit to either store until the security gates and feature parity checklist are satisfied.
