# Zenigram Mobile Migration Inventory

This inventory is derived from the current main branch source and README. The native app is additive; do not remove web features during conversion.

| Capability | Existing backend/source | Native target |
| --- | --- | --- |
| Email/password, Google auth, email/phone verification | NextAuth v4, registration, Resend/Twilio routes | Native login, Google/Apple OAuth, OTP, access/refresh tokens |
| Feed and ranking | /api/posts, /api/feed-preferences, src/app/lib/feedRanking.js | Paginated feed; preserve modes, weights, explanations, topic/creator controls |
| Posts | /api/posts, comments, likes, saves, shares, audience routes | Composer, post detail, reactions, comments and audience selector |
| Stories | /api/stories, /api/story-upload, engagement/comments | Native capture/editor/viewer, expiry, reactions, replies and audience |
| Stories Globe | /api/story-globe, src/app/lib/storyGlobeStore.js | Native map with location permission and privacy gates |
| Clips | /api/clips and clip comments/share/save routes | Native video player/editor; timeline, trims, filters, layers, captions/topics |
| S3 media | /api/media/upload, src/app/lib/s3Storage.js, directS3Upload.js | Signed single/multipart uploads, cancellation, progress, private signed reads |
| Messaging | /api/conversations, message/read routes, server.js Socket.IO | Conversations, chat, read state, attachments and authenticated realtime |
| Profiles/social graph | profile, user, search,¶»§q«^