# Zenigram Mobile

Native iOS and Android client for the existing Zenigram platform.

- Keep the current Next.js web application and its Vercel deployment intact.
- Build the mobile app as an independent Expo / React Native application.
- Use the existing Next.js API and AWS services as the source of truth.
- Reuse business rules and API contracts, not browser components or DOM code.
- Preserve the dark black-cherry / crimson identity with native navigation, gestures, safe areas and accessibility.

## Stack

Expo SDK 57 / React Native 0.86, TypeScript, Expo Router, NativeWind 4.2.7, TanStack Query, Axios and Expo SecureStore. NativeWind 4.2.7 documents Expo SDK 57 compatibility. Keep Expo and native module versions aligned with Expo SDK compatibility checks.

## Setup

1. Run from the mobile directory.
2. Copy .env.example to .env.
3. Set EXPO_PUBLIC_API_URL to the HTTPS origin of the deployed Next.js backend.
4. Run npm install and npx expo install --fix.
5. Run npx expo-doctor and npm run typecheck.
6. Run npm start.

Use native development builds for camera, notifications, media, upload and authentication testing. Expo Go is not a substitute for release validation.

## Authentication status

The web app uses NextAuth v4 browser sessions. The mobile client must not reuse browser cookies, embed AWS credentials, or store bearer tokens in AsyncStorage.

The client expects backend-issued access/refresh tokens:
- POST /api/mobile/auth/login
- POST /api/mobile/auth/refresh
- POST¶»§q«^