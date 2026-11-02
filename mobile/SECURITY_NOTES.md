# Mobile Foundation Security Notes

- The browser session mechanism from NextAuth is not reused by the native client.
- Access and refresh credentials are stored with Expo SecureStore, not AsyncStorage.
- AWS credentials are never included in the application bundle. Media access must use the existing server-side authorization and short-lived S3 URLs.
- The lockfile overrides decode-uri-component to 0.5.1, which includes the fixes for advisories affecting releases through 0.5.0.
- The current Expo SDK 57 dependency audit reports remaining high-severity issues in the Expo CLI / Zod build-tool dependency chain, plus moderate and low transitive findings. npm's suggested full fix upgrades Expo to SDK 58 (a major SDK and React Native change). NativeWind 4.2.7 currently documents SDK 57 as its tested Expo target, so this foundation does not force an unverified SDK 58 / styling-toolchain upgrade.
- deepmerge's current advisory has no patched release listed. Keep it within the Expo tooling dependency tree, do not use it to merge attacker-controlled data, and re-evaluate when the upstream package publishes a fix.
- Re-run npm audit and Expo doctor before every store release. Resolve the Expo SDK 58 toolchain findings once the NativeWind / native package compatibility matrix is confirmed.
