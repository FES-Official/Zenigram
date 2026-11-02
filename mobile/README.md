# Zenigram Mobile (React Native)

This directory is the native Android client. The existing Next.js application remains the web client and backend during the migration.

## Non-negotiable migration rules

- Preserve the existing web app; do not replace or move its Next.js routes.
- Reuse the existing DynamoDB records, private S3 bucket, and server-side business rules.
- Never put AWS access keys, DynamoDB credentials, or privileged secrets in the mobile bundle.
- Keep mobile screens native: React Native views, navigation, gestures, media pickers, and video playback. Do not use a WebView as the application shell.
- Port and test shared pure business logic (especially feed preferences/ranking) rather than rewriting it from memory.
- Do not expose the existing NextAuth JWT or its signing secret to the mobile client.

## Current backend compatibility findings

The current web APIs authenticate with `getServerSession(authOptions)`, which relies on NextAuth browser cookies. A native app cannot safely depend on browser cookie behavior. Before mobile sign-in can be production-ready, add a mobile authentication contract (short-lived access token + rotating refresh token, revocation, expiry, device/session management, and rate limiting) and a server-side request authenticator used by mobile API requests.

Existing endpoints worth reusing after that authentication layer is added:

- `GET/POST /api/posts` — feed retrieval and post creation
- `GET/POST /api/clips` — clips feed and publishing
- `GET/PUT/PATCH /api/feed-preferences` — user-controlled feed
- `POST /api/media/upload` — signed S3 uploads and multipart video uploads
- `GET/POST /api/conversations` and message routes — messaging
- stories, notifications, profile, search, saved content, audience/privacy and story-globe API routes

Every endpoint must be audited for cookie-only assumptions, browser APIs, CSRF behavior, pagination, and response consistency before mobile calls it.

## Feature parity checklist

- [ ] Credentials and Google sign-in, sign-up, email/phone verification, logout, session restore
- [ ] Home feed, five feed modes, topic/source weights, mute creator/topic, "why am I seeing this?"
- [ ] Posts, multi-image layouts, topics, audience controls, likes, comments, shares, saves
- [ ] Stories, story editor, location tagging, story viewer, story events, Stories Globe
- [ ] Clips, native video playback, clip creation/editor, timeline/text overlays, upload progress
- [ ] Messaging, groups, drawing messages, reactions, edits/deletes, real-time updates and polling fallback
- [ ] Profiles, followers/following, privacy, blocking/unblocking, hidden accounts and Z+ security
- [ ] Notifications, search, saved collections, missions/supporter milestones, professional dashboard
- [ ] Reports, account controls, legal/privacy screens and accessibility

## Mobile UX direction

A native, dark-first interface using Zenigram's black-cherry / burgundy / crimson identity, with clear contrast and accessible text sizes. Use native bottom tabs, gesture-aware navigation, skeleton loading, optimistic interactions with rollback, pull-to-refresh, infinite lists, cached media, and explicit upload state.

## Delivery sequence

1. Audit route contracts and feature inventory against the current `main` branch.
2. Build the Expo + TypeScript + NativeWind foundation and design system.
3. Implement mobile auth/session APIs and native authentication screens.
4. Implement feed, profiles, posts, stories and clips in vertical slices.
5. Implement messaging, notifications, privacy/security and remaining features.
6. Add automated tests, Android device QA, accessibility/performance checks.
7. Configure EAS production builds, Android App Bundle signing, Play Console listing and release testing.

## Environment

Create a local `.env` from `.env.example`. Only public API base URLs and public OAuth client identifiers belong in the mobile app. Server secrets remain in Vercel/server environment variables.
