# Mobile Conversion Status (baseline audit)

Audit source: repository main, inspected 2026-11-03. Work branch: mobile/ios-android-conversion.

## What already exists

- Expo Router app shell with five bottom tabs: Home, Clips, Create, Messages, Profile.
- Dark burgundy/crimson theme tokens and shared Screen component.
- Native sign-in UI.
- Axios API client that attaches a bearer token when one exists.
- Expo SecureStore helpers for access token, refresh token, and user profile.
- Expo app identifiers configured for Android and iOS.

## What is not complete

- The mobile login screen calls /api/mobile/auth/login, but that endpoint does not exist in the inspected Next.js API routes. Refresh, logout, and authenticated session endpoints are also not implemented.
- The current five feature tabs are explanatory placeholders; they do not yet load or mutate production Zenigram data.
- No feature-parity screens or end-to-end mobile API integration have been verified.
- No iOS Simulator / physical iPhone / Android device QA or production store build has been verified.
- The existing Socket.IO custom server is not automatically available from a Vercel Next.js Function deployment.

## Baseline audit observations

- The web application currently exposes API families for posts, clips, feed preferences, media, stories, messaging, profiles, search, notifications, saved content, privacy/audience controls, reports, missions and progression.
- The feed ranking implementation and saved user preferences are existing product logic and must be preserved; port pure logic with parity tests rather than approximating it.
- AWS access and all privileged operations must remain server-side. Mobile media uploads should use short-lived signed upload instructions and private S3 objects.

## Current gate

Do not publish or call the mobile app feature-complete yet. First implement and test the native authentication contract in API_CONTRACT.md, then integrate one feature at a time against the existing backend.

## Definition of done

A feature is complete only when its native screen, API service, loading/empty/error/offline states, server authorization, analytics/privacy behavior, accessibility, automated tests, and iOS + Android device behavior have been checked.
