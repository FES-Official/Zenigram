# Mobile Foundation Security Notes

- The browser session mechanism from NextAuth is not reused by the native client. The mobile app has separate short-lived access tokens and rotating refresh tokens.
- ZENIGRAM_MOBILE_AUTH_SECRET is server-only, must be at least 32 bytes, and must be configured separately from NEXTAUTH_SECRET. Never expose it through Expo EXPO_PUBLIC variables or commit it to source control.
- The server stores only SHA-256 hashes of refresh-token secrets in the existing DynamoDB table. Access-token checks also verify the associated device session and session family for expiry/revocation.
- Configure DynamoDB TTL on expiresAt to clean up expired records. Application checks, not TTL timing, enforce token expiry.
- Expo SecureStore is used for access tokens, refresh tokens, and the locally cached profile; AsyncStorage is not used for credentials.
- The shared request-auth helper supports bearer tokens only on explicitly converted route handlers. It does not globally alter all API routes or bypass web cookie/CSRF behavior.
- Login/refresh rate limiting and abuse monitoring are still required before public release.
- AWS credentials are never included in the application bundle. Media access continues through server-side authorization and short-lived S3 upload/read URLs.
- The lockfile overrides decode-uri-component to 0.5.1, which includes the fixes for advisories affecting releases through 0.5.0.
- The current Expo SDK 57 dependency audit reports remaining high-severity issues in the Expo CLI / Zod build-tool dependency chain, plus moderate and low transitive findings. npm's suggested full fix upgrades Expo to SDK 58 (a major SDK and React Native change). NativeWind 4.2.7 currently documents SDK 57 as its tested Expo target, so this foundation does not force an unverified SDK 58 / styling-toolchain upgrade.
- deepmerge's current advisory has no patched release listed. Keep it within the Expo tooling dependency tree, do not use it to merge attacker-controlled data, and re-evaluate when the upstream package publishes a fix.
- Re-run npm audit and Expo doctor before every store release. Resolve the Expo SDK 58 toolchain findings once the NativeWind / native package compatibility matrix is confirmed.
