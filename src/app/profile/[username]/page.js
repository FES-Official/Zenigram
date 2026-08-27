"use client";

import React, { useEffect, useState } from "react";
import "@/app/globals.css";

import LogoutBtn from "../../../../components/logoutBtn";
import SupportButton from "../../../../components/supportbtn";
import Navbar from "../../../../components/navbar";
import PostGrid from "../../../../components/postGrid";
import StoryModal from "../../../../components/story-globe/StoryModal";

import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";

const DEFAULT_AVATAR = "/user.svg";

const PROFILE_ENDPOINT = "/api/profile";

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

const fetchJSON = async (url, body, signal) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });

  const rawText = await response.text();

  let data = null;

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(
        `Invalid response from ${url}. Expected JSON but received something else.`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`,
    );
  }

  return data;
};

const getId = (value) => {
  if (!value) return "";

  if (typeof value === "object") {
    return String(value._id || value.id || "");
  }

  return String(value);
};

const sameId = (first, second) => {
  if (!first || !second) return false;
  return getId(first) === getId(second);
};

const hasUserId = (users = [], userId) => {
  if (!userId || !Array.isArray(users)) return false;

  return users.some((item) => sameId(item, userId));
};

const getUsername = (usernameParam) => {
  const username = Array.isArray(usernameParam)
    ? usernameParam[0]
    : usernameParam;

  return String(username || "")
    .trim()
    .toLowerCase();
};

const getWebsiteUrl = (website) => {
  if (!website) return "";

  const value = website.trim();

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://${value}`;
};

/* -------------------------------------------------------
   Profile
------------------------------------------------------- */

export default function Profile() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();

  const username = params?.username;
  const sessionId = session?.user?.id;

  const [activeTab, setActiveTab] = useState("posts");

  const [user, setUser] = useState(null);
  const [userPosts, setUserPosts] = useState([]);
  const [userStories, setUserStories] = useState([]);
  const [userClips, setUserClips] = useState([]);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [deletingClipId, setDeletingClipId] = useState("");

  const [isRequested, setIsRequested] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contentError, setContentError] = useState("");
  const [connectionModal, setConnectionModal] = useState(null);

  /* -------------------------------------------------------
     Authentication
  ------------------------------------------------------- */

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  /* -------------------------------------------------------
     Fetch profile
  ------------------------------------------------------- */

  useEffect(() => {
    if (status !== "authenticated" || !username) {
      return;
    }

    const controller = new AbortController();

    const loadProfile = async () => {
      try {
        setLoading(true);
        setError("");
        setIsRequested(false);
        setUserPosts([]);
        setUserStories([]);
        setUserClips([]);

        const requestedUsername = getUsername(username);

        if (!requestedUsername) {
          throw new Error("Invalid username.");
        }

        /*
         * Profile API
         */
        const profileResponse = await fetchJSON(
          PROFILE_ENDPOINT,
          {
            username: requestedUsername,
          },
          controller.signal,
        );

        /*
         * Supports either:
         *
         * { _id, username, ... }
         *
         * or:
         *
         * { user: { _id, username, ... } }
         */
        const userData = profileResponse?.user || profileResponse;

        if (!userData?._id) {
          throw new Error("User not found.");
        }

        const ownProfile = sameId(sessionId, userData._id);

        const alreadySupporting = Boolean(userData.viewerSupportsProfile) || hasUserId(userData.supporters, sessionId);

        const contentIsHidden =
          Boolean(userData.ishidden) && !ownProfile && !alreadySupporting;

        /*
         * Set user immediately so the header can render.
         */
        setUser(userData);
        setUserStories(Array.isArray(userData.stories) ? userData.stories : []);
        setUserClips(Array.isArray(userData.clips) ? userData.clips : []);

        /*
         * Canonical username redirect.
         *
         * This avoids the redirect loop in the original code
         * when the database username contains capital letters.
         */
        const canonicalUsername = String(userData.username || "").trim();

        if (
          canonicalUsername &&
          requestedUsername !== canonicalUsername.toLowerCase()
        ) {
          router.replace(`/profile/${encodeURIComponent(canonicalUsername)}`);
        }

        /*
         * Only fetch posts if this viewer is actually allowed
         * to see the profile.
         *
         * Do not fetch private posts and merely blur them.
         */
        if (!contentIsHidden) {
          const postsResponse = await fetchJSON(
            "/api/userPosts",
            {
              userId: userData._id,
            },
            controller.signal,
          );

          const posts = Array.isArray(postsResponse)
            ? postsResponse
            : Array.isArray(postsResponse?.posts)
              ? postsResponse.posts
              : [];

          setUserPosts(posts);
        }

        /*
         * Check pending support request only when necessary.
         */
        if (userData.ishidden && !ownProfile && !alreadySupporting) {
          const requestData = await fetchJSON(
            "/api/check-request",
            {
              targetUserId: userData._id,
            },
            controller.signal,
          );

          setIsRequested(Boolean(requestData?.requested));
        }
      } catch (err) {
        if (err.name === "AbortError") return;

        console.error("Profile loading error:", err);

        setError(
          err instanceof Error ? err.message : "Unable to load this profile.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      controller.abort();
    };
  }, [username, sessionId, status, router]);

  /* -------------------------------------------------------
     Loading
  ------------------------------------------------------- */

  if (status === "loading" || loading) {
    return <ProfileSkeleton />;
  }

  /* -------------------------------------------------------
     Error
  ------------------------------------------------------- */

  if (error) {
    return (
      <div className="min-h-screen bg-[#050505] text-white">
        <Navbar />

        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-md rounded-3xl border border-red-500/20 bg-white/4 p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-2xl">
              !
            </div>

            <h1 className="text-xl font-semibold">Unable to load profile</h1>

            <p className="mt-3 text-sm leading-6 text-neutral-400">{error}</p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Try again
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  /* -------------------------------------------------------
     Derived values
  ------------------------------------------------------- */

  const isOwnProfile = sameId(sessionId, user._id);

  const isSupporting = Boolean(user.viewerSupportsProfile) || hasUserId(user.supporters, sessionId);

  const isHiddenContent =
    Boolean(user.ishidden) && !isOwnProfile && !isSupporting;

  const postCount =
    Array.isArray(user.posts) && user.posts.length
      ? user.posts.length
      : userPosts.length;

  const websiteUrl = getWebsiteUrl(user.website);

  const deleteProfileClip = async (clipId) => {
    if (!isOwnProfile || deletingClipId) return;
    if (!window.confirm("Delete this clip permanently? Its uploaded media and comments will also be removed.")) return;
    setDeletingClipId(clipId);
    setContentError("");
    try {
      const response = await fetch(`/api/clips/${clipId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to delete clip");
      setUserClips((current) => current.filter((clip) => clip._id !== clipId));
    } catch (requestError) {
      setContentError(requestError.message || "Unable to delete clip");
    } finally {
      setDeletingClipId("");
    }
  };

  const storyGroup = {
    user,
    stories: userStories,
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050505] text-white">
      {/* Background decoration */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-red-900/20 blur-[140px]" />

        <div className="absolute -right-40 top-60 h-[500px] w-[500px] rounded-full bg-red-700/10 blur-[150px]" />
      </div>

      <Navbar />

      <div className="fixed right-4 top-4 z-50">
        <LogoutBtn />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-3 pb-16 pt-24 sm:px-6">
        {/* ===================================================
            PROFILE CARD
        =================================================== */}

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.035] shadow-2xl backdrop-blur-xl">
          {/* Cover */}
          <div className="relative h-36 overflow-hidden sm:h-48">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.5),rgba(127,29,29,0.25)_35%,rgba(0,0,0,0.9)_100%)]" />

            <div className="absolute inset-0 opacity-30">
              <div className="absolute right-12 top-8 h-24 w-24 rounded-full border border-white/20" />
              <div className="absolute right-20 top-16 h-32 w-32 rounded-full border border-white/10" />
            </div>

            {user.ishidden && (
              <div className="absolute right-5 top-5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs font-medium text-neutral-200 backdrop-blur-md">
                Private profile
              </div>
            )}
          </div>

          {/* Profile information */}
          <div className="px-5 pb-7 sm:px-8">
            <div className="-mt-14 flex flex-col gap-5 sm:-mt-16">
              {/* Avatar / actions */}
              <div className="flex items-end justify-between gap-4">
                <div className="relative">
                  <div className="rounded-full bg-black p-1.5 shadow-xl">
                    <Image
                      src={user.profilePic || DEFAULT_AVATAR}
                      alt={`${user.username}'s profile`}
                      width={144}
                      height={144}
                      priority
                      className="h-28 w-28 rounded-full bg-neutral-900 object-cover sm:h-36 sm:w-36"
                    />
                  </div>

                  <div className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-[3px] border-[#090909] bg-green-500 sm:h-6 sm:w-6" />
                </div>

                <div className="mb-2">
                  {isOwnProfile ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Link
                        href="/professional-dashboard"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-linear-to-r from-red-700 to-red-500 px-4 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition hover:-translate-y-0.5"
                      >
                        Professional dashboard
                      </Link>
                      <Link
                        href="/profile/edit-account"
                        className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 px-5 text-sm font-semibold text-white transition hover:border-red-500/40 hover:bg-red-500/10"
                      >
                        Edit profile
                      </Link>
                    </div>
                  ) : (
                    <SupportButton
                      targetUserId={user._id}
                      isHiddenAccount={Boolean(user.ishidden)}
                      initialSupported={isSupporting}
                      initialRequested={isRequested}
                    />
                  )}
                </div>
              </div>

              {/* Username */}
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {user.fullname || user.username}
                  </h1>

                  {user.verified && (
                    <span
                      title="Verified"
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[11px] font-bold"
                    >
                      ✓
                    </span>
                  )}
                </div>

                <p className="mt-1 text-sm text-neutral-400">
                  @{user.username}
                </p>
              </div>

              {/* Bio */}
              <div className="max-w-2xl">
                <p className="whitespace-pre-line text-sm leading-6 text-neutral-300 sm:text-base">
                  {user.bio?.trim() ||
                    (isOwnProfile
                      ? "You haven't added a bio yet. Tell people something about yourself."
                      : "This user hasn't added a bio yet.")}
                </p>

                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex max-w-full items-center gap-2 truncate text-sm font-medium text-red-400 transition hover:text-red-300"
                  >
                    <span>↗</span>
                    <span className="truncate">{user.website}</span>
                  </a>
                )}

                {!isOwnProfile && user.mutualSupporters?.length > 0 && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-red-500/15 bg-red-950/20 px-3 py-2.5">
                    <div className="flex -space-x-2">
                      {user.mutualSupporters.map((mutual) => (
                        <Image
                          key={mutual._id}
                          src={mutual.profilePic || DEFAULT_AVATAR}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 rounded-full border-2 border-[#130608] object-cover"
                        />
                      ))}
                    </div>
                    <p className="min-w-0 text-xs text-neutral-400">
                      Supported by{" "}
                      <span className="font-semibold text-neutral-200">
                        {user.mutualSupporters
                          .map((mutual) => mutual.username)
                          .join(", ")}
                      </span>
                      {user.mutualSupportersCount > user.mutualSupporters.length
                        ? ` and ${user.mutualSupportersCount - user.mutualSupporters.length} more`
                        : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-5 sm:grid-cols-4 sm:max-w-xl sm:gap-3">
                <Stat label="Posts" value={postCount} />

                <Stat
                  label="Supporters"
                  value={user.supporters?.length ?? 0}
                  locked={!user.connectionsVisible}
                  onClick={() =>
                    user.connectionsVisible && setConnectionModal("supporters")
                  }
                />

                <Stat
                  label="Supporting"
                  value={user.supporting?.length ?? 0}
                  locked={!user.connectionsVisible}
                  onClick={() =>
                    user.connectionsVisible && setConnectionModal("supporting")
                  }
                />
                <Stat
                  label="Close ones"
                  value={user.closeOnes?.length ?? 0}
                  locked={!user.connectionsVisible}
                  onClick={() =>
                    user.connectionsVisible && setConnectionModal("close")
                  }
                />
              </div>
            </div>
          </div>
        </section>

        {/* ===================================================
            CONTENT
        =================================================== */}

        <section className="mt-5 rounded-[28px] border border-white/10 bg-white/2.5 backdrop-blur-xl">
          {/* Tabs */}
          <div
            role="tablist"
            className="flex border-b border-white/10 px-2 sm:px-6"
          >
            {[
              {
                id: "posts",
                label: "Posts",
              },
              {
                id: "stories",
                label: "Stories",
              },
              {
                id: "clips",
                label: "Clips",
              },
            ].map((tab) => {
              const selected = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-1 px-3 py-4 text-sm font-semibold transition sm:flex-none sm:px-7 ${
                    selected
                      ? "text-white"
                      : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {tab.label}

                  {selected && (
                    <span className="absolute bottom-0 left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="relative min-h-72">
            {isHiddenContent ? (
              <PrivateProfile />
            ) : (
              <>
                {activeTab === "posts" && (
                  <>
                    {userPosts.length > 0 ? (
                      <div className="p-2 sm:p-4">
                        <PostGrid posts={userPosts} />
                      </div>
                    ) : (
                      <EmptyState
                        title="No posts yet"
                        description={
                          isOwnProfile
                            ? "Your posts will appear here."
                            : `${user.username} hasn't shared any posts yet.`
                        }
                      />
                    )}
                  </>
                )}

                {activeTab === "stories" && (
                  userStories.length ? (
                    <div className="p-3 sm:p-5">
                      <button type="button" onClick={() => setStoryViewerOpen(true)} className="group relative aspect-9/16 w-28 overflow-hidden rounded-2xl border border-red-500/30 bg-black shadow-lg sm:w-36" aria-label={`Watch ${user.username}'s active stories`}>
                        <Image src={userStories[0].mediaUrl} alt="Active story" fill unoptimized className="object-cover transition duration-500 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-transparent" />
                        <div className="absolute inset-x-2 bottom-2 text-left">
                          <p className="text-xs font-bold">Active stories</p>
                          <p className="text-[10px] text-white/65">{userStories.length} live now</p>
                        </div>
                        <span className="absolute right-2 top-2 grid h-7 min-w-7 place-items-center rounded-full bg-red-600 px-1.5 text-[10px] font-black">{userStories.length}</span>
                      </button>
                    </div>
                  ) : (
                    <EmptyState title="No active stories" description="Active stories shared during the last 24 hours will appear here." />
                  )
                )}

                {activeTab === "clips" && (
                  userClips.length ? (
                    <div className="p-2 sm:p-4">
                      {contentError && <p className="mb-3 rounded-xl border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm text-red-200">{contentError}</p>}
                      <ClipProfileGrid clips={userClips} isOwnProfile={isOwnProfile} deletingClipId={deletingClipId} onDelete={deleteProfileClip} />
                    </div>
                  ) : (
                    <EmptyState title="No clips yet" description={isOwnProfile ? "Clips you create will appear here." : `${user.username} hasn't uploaded any clips yet.`} />
                  )
                )}
              </>
            )}
          </div>
        </section>
      </main>
      <AnimatePresence>
        {connectionModal && (
          <ConnectionModal
            title={connectionModal === "supporters" ? "Supporters" : connectionModal === "supporting" ? "Supporting" : "Close ones"}
            users={
              connectionModal === "supporters"
                ? user.supporterProfiles || []
                : connectionModal === "supporting"
                  ? user.supportingProfiles || []
                  : user.closeProfiles || []
            }
            onClose={() => setConnectionModal(null)}
          />
        )}
        {storyViewerOpen && userStories.length > 0 && (
          <StoryModal
            storyGroup={storyGroup}
            initialIndex={0}
            onClose={() => setStoryViewerOpen(false)}
            onStoryUpdate={(storyId, updates) => {
              setUserStories((current) => current.map((story) => story._id === storyId ? {
                ...story,
                likesCount: updates.likesCount ?? story.likesCount,
                viewsCount: updates.viewsCount ?? story.viewsCount,
                viewerLiked: updates.viewerLiked ?? story.viewerLiked,
              } : story));
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* -------------------------------------------------------
   Stat
------------------------------------------------------- */

function Stat({ label, value = 0, onClick, locked = false }) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      disabled={locked || undefined}
      title={locked ? "Hidden accounts keep connections private" : undefined}
      className="rounded-2xl border border-white/6 bg-white/[0.035] px-2 py-3 text-center transition hover:bg-white/6 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <p className="text-lg font-bold text-white sm:text-xl">
        {Number(value).toLocaleString()}
      </p>

      <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider text-neutral-500 sm:text-xs">
        {locked ? "Locked" : label}
      </span>
    </Component>
  );
}

function ConnectionModal({ title, users, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-90 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.section
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.97 }}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[75vh] w-full max-w-md overflow-hidden rounded-[28px] border border-red-500/20 bg-[#110506] shadow-[0_30px_100px_rgba(127,29,29,.35)]"
      >
        <header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-lg font-black">{title}</h2>
            <p className="text-xs text-neutral-500">{users.length} people</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close connections"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-neutral-300 hover:bg-white/15"
          >
            ×
          </button>
        </header>
        <div className="max-h-[60vh] space-y-1 overflow-y-auto p-3">
          {users.length ? (
            users.map((person) => (
              <Link
                key={person._id}
                href={`/profile/${encodeURIComponent(person.username)}`}
                onClick={onClose}
                className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-red-950/30"
              >
                <Image
                  src={person.profilePic || DEFAULT_AVATAR}
                  alt={`${person.username}'s profile`}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10"
                />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{person.username}</strong>
                  <span className="block truncate text-xs text-neutral-500">
                    {person.fullname || (person.ishidden ? "Hidden account" : "Zanigram creator")}
                  </span>
                </span>
                <span className="text-red-400">›</span>
              </Link>
            ))
          ) : (
            <p className="px-4 py-12 text-center text-sm text-neutral-500">
              No people to show yet.
            </p>
          )}
        </div>
      </motion.section>
    </motion.div>
  );
}

/* -------------------------------------------------------
   Private profile
------------------------------------------------------- */

function PrivateProfile() {
  return (
    <div className="flex min-h-[360px] items-center justify-center px-5 py-14 text-center">
      <div className="max-w-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-2xl shadow-lg">
          🔒
        </div>

        <h2 className="mt-5 text-xl font-bold">This profile is Hidden</h2>

        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Support this user to view their posts and other content.
        </p>
      </div>
    </div>
  );
}

function ClipProfileGrid({ clips, isOwnProfile, deletingClipId, onDelete }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
      {clips.map((clip) => {
        const media = clip.mediaItems?.[0] || (clip.mediaUrl ? { url: clip.mediaUrl, type: clip.mediaType } : null);
        return (
          <article key={clip._id} className="group relative aspect-9/16 overflow-hidden rounded-lg bg-black sm:rounded-2xl">
            <Link href={`/clips?clip=${encodeURIComponent(clip._id)}`} aria-label="Watch clip" className="absolute inset-0">
              {media?.type === "video" ? (
                <video src={media.url} muted playsInline preload="metadata" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : media?.url ? (
                <Image src={media.url} alt={clip.caption || "Clip"} fill unoptimized className="object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="grid h-full place-items-center text-white/30">▶</div>
              )}
              <div className="absolute inset-0 bg-linear-to-t from-black/85 via-transparent to-black/15" />
              <div className="absolute inset-x-2 bottom-2 flex items-center justify-between text-[10px] font-bold text-white sm:text-xs">
                <span>▶ {Number(clip.views?.length || clip.viewsCount || 0).toLocaleString()}</span>
                <span>♥ {Number(clip.likes?.length || clip.likesCount || 0).toLocaleString()}</span>
              </div>
            </Link>
            {isOwnProfile && (
              <button
                type="button"
                onClick={() => onDelete(clip._id)}
                disabled={Boolean(deletingClipId)}
                aria-label="Delete clip"
                className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-black/65 text-sm text-white opacity-100 shadow-lg backdrop-blur transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-50"
              >
                {deletingClipId === clip._id ? "…" : "×"}
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------
   Empty state
------------------------------------------------------- */

function EmptyState({ title, description }) {
  return (
    <div className="flex min-h-80 items-center justify-center px-4 py-12 text-center">
      <div>
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/4 text-xl">
          ◫
        </div>

        <h3 className="font-semibold text-white">{title}</h3>

        <p className="mt-1 max-w-xs text-sm leading-6 text-neutral-500">
          {description}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Skeleton
------------------------------------------------------- */

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-[#050505]">
      <div className="mx-auto w-full max-w-5xl animate-pulse px-3 pb-16 pt-24 sm:px-6">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/3">
          <div className="h-36 bg-neutral-900 sm:h-48" />

          <div className="px-5 pb-7 sm:px-8">
            <div className="-mt-14">
              <div className="h-28 w-28 rounded-full border-[6px] border-[#050505] bg-neutral-800 sm:h-36 sm:w-36" />
            </div>

            <div className="mt-5 h-7 w-48 rounded-lg bg-neutral-800" />

            <div className="mt-2 h-4 w-28 rounded bg-neutral-800" />

            <div className="mt-6 space-y-2">
              <div className="h-4 w-full max-w-lg rounded bg-neutral-900" />
              <div className="h-4 w-3/4 max-w-md rounded bg-neutral-900" />
            </div>

            <div className="mt-6 grid max-w-lg grid-cols-3 gap-3 border-t border-white/10 pt-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-16 rounded-2xl bg-neutral-900" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-[28px] border border-white/10 bg-white/3 p-4">
          <div className="mb-5 flex gap-4">
            <div className="h-5 w-16 rounded bg-neutral-800" />
            <div className="h-5 w-16 rounded bg-neutral-800" />
            <div className="h-5 w-16 rounded bg-neutral-800" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="aspect-square rounded-lg bg-neutral-900"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
