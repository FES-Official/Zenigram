
"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";

import Navbar from "../../../components/navbar";
import ClipReelPlayer from "../../../components/ClipReelPlayer";
import ClipCommentsDialog from "../../../components/ClipCommentsDialog";
import ClipShareDialog from "../../../components/ClipShareDialog";
import ClipOptions from "../../../components/ClipOptions";

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const formatCount = (value = 0) => {
  const number = Number(value) || 0;

  if (number >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(
      number >= 10_000_000 ? 0 : 1
    )}M`;
  }

  if (number >= 1_000) {
    return `${(number / 1_000).toFixed(
      number >= 10_000 ? 0 : 1
    )}K`;
  }

  return number.toString();
};

const getLikesCount = (clip) =>
  Number(clip.likesCount ?? clip.likes?.length ?? 0);

const getViewsCount = (clip) =>
  Number(clip.viewsCount ?? clip.views?.length ?? 0);

const getClipId = (clip) => String(clip?._id ?? "");

async function parseResponse(response, fallbackMessage) {
  let data = {};

  try {
    data = await response.json();
  } catch {
    throw new Error(
      response.ok ? "Invalid server response" : fallbackMessage
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.message || data?.error || fallbackMessage
    );
  }

  return data;
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

// --------------------------------------------------
// Icons
// --------------------------------------------------

function HeartIcon({ filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      className="h-7 w-7"
      aria-hidden="true"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
      aria-hidden="true"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-7 w-7"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4.5A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <path d="M2.1 12s3.6-6 9.9-6 9.9 6 9.9 6-3.6 6-9.9 6S2.1 12 2.1 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-7 w-7"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

// --------------------------------------------------
// Reusable UI
// --------------------------------------------------

function ReelAction({
  icon,
  label,
  active = false,
  onClick,
  disabled = false,
  ariaLabel,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-pressed={active}
      className="group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`grid h-12 w-12 place-items-center rounded-full border shadow-lg backdrop-blur-md transition duration-200 group-hover:scale-105 group-active:scale-90 ${
          active
            ? "border-red-400/50 bg-red-600 text-white"
            : "border-white/10 bg-black/40 text-white group-hover:bg-white/20"
        }`}
      >
        {icon}
      </span>

      <span className="max-w-16 text-center text-[11px] font-bold text-white drop-shadow-lg">
        {label}
      </span>
    </button>
  );
}

// --------------------------------------------------
// Main Page
// --------------------------------------------------

export default function ClipsPage() {
  const { data: session, status: sessionStatus } = useSession();

  const currentUserId = String(session?.user?.id || "");

  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeClipId, setActiveClipId] = useState(null);
  const [muted, setMuted] = useState(true);

  const [commentsClip, setCommentsClip] = useState(null);
  const [sharingClip, setSharingClip] = useState(null);
  const [optionsClip, setOptionsClip] = useState(null);

  const [updatingClips, setUpdatingClips] = useState(
    () => new Set()
  );

  const feedRef = useRef(null);
  const requestLocksRef = useRef(new Set());
  const viewedClipsRef = useRef(new Set());
  const noticeTimerRef = useRef(null);
  const clipsRef = useRef([]);

  // Keep the latest clips available to async callbacks.
  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  // --------------------------------------------------
  // Notifications
  // --------------------------------------------------

  const showNotice = useCallback((message, duration = 2200) => {
    setNotice(message);

    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }

    noticeTimerRef.current = window.setTimeout(() => {
      setNotice("");
      noticeTimerRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  // --------------------------------------------------
  // Clip loading
  // --------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    async function loadClips() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/clips", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await parseResponse(
          response,
          "Failed to load clips"
        );

        const loadedClips = Array.isArray(data.clips)
          ? data.clips
          : [];

        if (controller.signal.aborted) return;

        setClips(loadedClips);

        const requestedId = new URLSearchParams(
          window.location.search
        ).get("clip");

        const requestedClip = loadedClips.find(
          (clip) => getClipId(clip) === requestedId
        );

        setActiveClipId(
          getClipId(requestedClip) ||
            getClipId(loadedClips[0]) ||
            null
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Failed to load clips");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadClips();

    return () => controller.abort();
  }, []);

  // --------------------------------------------------
  // Scroll to requested clip
  // --------------------------------------------------

  useEffect(() => {
    if (!activeClipId || !feedRef.current) return;

    const requestedId = new URLSearchParams(
      window.location.search
    ).get("clip");

    if (requestedId !== String(activeClipId)) return;

    const frame = window.requestAnimationFrame(() => {
      const element = Array.from(
        feedRef.current?.querySelectorAll("[data-clip-id]") || []
      ).find(
        (item) => item.getAttribute("data-clip-id") === String(activeClipId)
      );

      element?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeClipId, clips.length]);

  // --------------------------------------------------
  // Active clip detection
  // --------------------------------------------------

  useEffect(() => {
    const container = feedRef.current;

    if (!container || clips.length === 0) return;

    const elements = container.querySelectorAll("[data-clip-id]");

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) => b.intersectionRatio - a.intersectionRatio
          )[0];

        if (visible && visible.intersectionRatio >= 0.6) {
          setActiveClipId(
            visible.target.getAttribute("data-clip-id")
          );
        }
      },
      {
        root: container,
        threshold: [0.4, 0.6, 0.8, 1],
      }
    );

    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [clips]);

  // --------------------------------------------------
  // Keyboard navigation
  // --------------------------------------------------

  useEffect(() => {
    const handleKeys = (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isTypingTarget(event.target) ||
        commentsClip ||
        sharingClip ||
        optionsClip ||
        !["ArrowDown", "ArrowUp"].includes(event.key) ||
        !feedRef.current
      ) {
        return;
      }

      const currentIndex = clips.findIndex(
        (clip) => getClipId(clip) === String(activeClipId)
      );

      const index = Math.max(0, currentIndex);
      const direction = event.key === "ArrowDown" ? 1 : -1;

      const nextIndex = Math.min(
        clips.length - 1,
        Math.max(0, index + direction)
      );

      const nextClip = clips[nextIndex];

      if (!nextClip) return;

      event.preventDefault();

      const element = Array.from(
        feedRef.current.querySelectorAll("[data-clip-id]")
      ).find(
        (item) =>
          item.getAttribute("data-clip-id") ===
          getClipId(nextClip)
      );

      element?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    window.addEventListener("keydown", handleKeys);

    return () => {
      window.removeEventListener("keydown", handleKeys);
    };
  }, [
    activeClipId,
    clips,
    commentsClip,
    sharingClip,
    optionsClip,
  ]);

  // --------------------------------------------------
  // API update helper
  // --------------------------------------------------

  const updateClip = useCallback(async (clipId, action) => {
    const id = String(clipId);
    const requestKey = `${id}-${action}`;

    if (requestLocksRef.current.has(requestKey)) {
      return null;
    }

    requestLocksRef.current.add(requestKey);

    setUpdatingClips((current) => {
      const next = new Set(current);
      next.add(requestKey);
      return next;
    });

    try {
      const response = await fetch(
        `/api/clips/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const data = await parseResponse(
        response,
        "Unable to update clip"
      );

      setClips((current) =>
        current.map((clip) =>
          getClipId(clip) !== id
            ? clip
            : {
                ...clip,
                viewerLiked: data.liked ?? clip.viewerLiked,
                likesCount:
                  data.likesCount ?? getLikesCount(clip),
                viewsCount:
                  data.viewsCount ?? getViewsCount(clip),
                shares: data.shares ?? clip.shares,
                viewerPreference:
                  data.preference ?? clip.viewerPreference,
                viewerSaved: data.saved ?? clip.viewerSaved,
                viewerViewed: action === "view"
                  ? true
                  : clip.viewerViewed,
              }
        )
      );

      return data;
    } finally {
      requestLocksRef.current.delete(requestKey);

      setUpdatingClips((current) => {
        const next = new Set(current);
        next.delete(requestKey);
        return next;
      });
    }
  }, []);

  // --------------------------------------------------
  // View tracking
  // --------------------------------------------------

  const markAsViewed = useCallback(
    async (clipId) => {
      const id = String(clipId);

      if (viewedClipsRef.current.has(id)) return;

      const clip = clipsRef.current.find(
        (item) => getClipId(item) === id
      );

      if (!clip || clip.viewerViewed) {
        viewedClipsRef.current.add(id);
        return;
      }

      viewedClipsRef.current.add(id);

      setClips((current) =>
        current.map((item) =>
          getClipId(item) === id
            ? { ...item, viewerViewed: true }
            : item
        )
      );

      try {
        await updateClip(id, "view");
      } catch {
        viewedClipsRef.current.delete(id);

        setClips((current) =>
          current.map((item) =>
            getClipId(item) === id
              ? { ...item, viewerViewed: false }
              : item
          )
        );
      }
    },
    [updateClip]
  );

  // --------------------------------------------------
  // Likes
  // --------------------------------------------------

  const handleLike = useCallback(
    async (clipId) => {
      const id = String(clipId);

      if (requestLocksRef.current.has(`${id}-like`)) return;

      const previousClip = clipsRef.current.find(
        (clip) => getClipId(clip) === id
      );

      if (!previousClip) return;

      const previousLiked = Boolean(previousClip.viewerLiked);
      const previousCount = getLikesCount(previousClip);

      // Optimistic update.
      setClips((current) =>
        current.map((clip) =>
          getClipId(clip) === id
            ? {
                ...clip,
                viewerLiked: !previousLiked,
                likesCount: Math.max(
                  0,
                  previousCount + (previousLiked ? -1 : 1)
                ),
              }
            : clip
        )
      );

      setError("");

      try {
        const data = await updateClip(id, "like");

        if (!data) {
          throw new Error("Like request is already processing");
        }
      } catch (err) {
        setClips((current) =>
          current.map((clip) =>
            getClipId(clip) === id
              ? {
                  ...clip,
                  viewerLiked: previousLiked,
                  likesCount: previousCount,
                }
              : clip
          )
        );

        setError(err.message || "Unable to like clip");
      }
    },
    [updateClip]
  );

  const handleDoubleLike = useCallback(
    (clip) => {
      if (
        !clip.viewerLiked &&
        !requestLocksRef.current.has(
          `${getClipId(clip)}-like`
        )
      ) {
        void handleLike(clip._id);
      }
    },
    [handleLike]
  );

  // --------------------------------------------------
  // Feed preferences
  // --------------------------------------------------

  const handleFeedFeedback = useCallback(
    async (feedback) => {
      if (!currentUserId) {
        setError("Sign in to customize your feed.");
        return;
      }

      try {
        setError("");

        const response = await fetch("/api/feed-preferences", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(feedback),
        });

        await parseResponse(
          response,
          "Unable to update your feed rules"
        );

        const feedResponse = await fetch("/api/clips?limit=80", {
          cache: "no-store",
        });

        const feedData = await parseResponse(
          feedResponse,
          "Your rules were saved, but clips could not refresh"
        );

        const nextClips = Array.isArray(feedData.clips)
          ? feedData.clips
          : [];

        setClips(nextClips);

        setActiveClipId((currentId) =>
          nextClips.some(
            (clip) => getClipId(clip) === String(currentId)
          )
            ? currentId
            : getClipId(nextClips[0]) || null
        );

        setOptionsClip(null);
        showNotice("Your feed rules were updated");
      } catch (err) {
        setError(
          err.message || "Unable to update your feed rules"
        );
      }
    },
    [currentUserId, showNotice]
  );

  // --------------------------------------------------
  // Recommendations
  // --------------------------------------------------

  const handlePreference = useCallback(
    async (action) => {
      const clip = optionsClip;

      if (!clip) return;

      try {
        setError("");

        const response = await fetch(
          `/api/clips/${encodeURIComponent(getClipId(clip))}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          }
        );

        const data = await parseResponse(
          response,
          "Unable to update recommendations"
        );

        if (action === "not_interested") {
          const nextClips = clipsRef.current.filter(
            (item) => getClipId(item) !== getClipId(clip)
          );

          setClips(nextClips);

          if (getClipId(clip) === String(activeClipId)) {
            setActiveClipId(
              getClipId(nextClips[0]) || null
            );
          }
        } else {
          setClips((current) =>
            current.map((item) =>
              getClipId(item) === getClipId(clip)
                ? {
                    ...item,
                    viewerPreference:
                      data.preference || "interested",
                  }
                : item
            )
          );
        }

        setOptionsClip(null);

        showNotice(
          action === "interested"
            ? "We’ll show more clips like this"
            : "We’ll show fewer clips like this"
        );
      } catch (err) {
        setError(
          err.message || "Unable to update recommendations"
        );
      }
    },
    [optionsClip, activeClipId, showNotice]
  );

  // --------------------------------------------------
  // Save clip
  // --------------------------------------------------

  const handleSave = useCallback(async () => {
    const clip = optionsClip;

    if (!clip) return;

    try {
      setError("");

      const data = await updateClip(clip._id, "save");

      if (!data) return;

      setOptionsClip(null);

      showNotice(
        data.saved
          ? "Clip saved"
          : "Clip removed from saved items"
      );
    } catch (err) {
      setError(err.message || "Unable to save clip");
    }
  }, [optionsClip, updateClip, showNotice]);

  // --------------------------------------------------
  // Dialog callbacks
  // --------------------------------------------------

  const handleCommentAdded = useCallback(() => {
    const id = getClipId(commentsClip);

    if (!id) return;

    setClips((current) =>
      current.map((clip) =>
        getClipId(clip) === id
          ? {
              ...clip,
              commentsCount:
                Number(clip.commentsCount || 0) + 1,
            }
          : clip
      )
    );

    setCommentsClip((current) =>
      current
        ? {
            ...current,
            commentsCount:
              Number(current.commentsCount || 0) + 1,
          }
        : null
    );
  }, [commentsClip]);

  const handleShared = useCallback(
    (data) => {
      const id = getClipId(sharingClip);

      if (!id) return;

      setClips((current) =>
        current.map((clip) =>
          getClipId(clip) === id
            ? {
                ...clip,
                shares: Number(
                  data?.shares ?? clip.shares ?? 0
                ),
              }
            : clip
        )
      );

      showNotice("Clip sent in messages", 1800);
    },
    [sharingClip, showNotice]
  );

  // --------------------------------------------------
  // Derived values
  // --------------------------------------------------

  const isDialogOpen = Boolean(
    commentsClip || sharingClip || optionsClip
  );

  const isAuthenticated = sessionStatus === "authenticated";

  // --------------------------------------------------
  // Loading
  // --------------------------------------------------

  if (loading) {
    return (
      <main className="min-h-dvh bg-[#050202] text-white">
        <Navbar />

        <div className="flex min-h-dvh items-center justify-center md:pl-20">
          <div
            className="flex flex-col items-center gap-4"
            role="status"
          >
            <div className="h-11 w-11 animate-spin rounded-full border-2 border-white/15 border-t-red-500" />

            <p className="text-sm text-white/50">
              Loading clips…
            </p>
          </div>
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // Empty state
  // --------------------------------------------------

  if (!clips.length) {
    return (
      <main className="min-h-dvh bg-[radial-gradient(circle_at_50%_20%,rgba(127,29,29,.22),transparent_42%),#050202] text-white">
        <Navbar />

        <div className="flex min-h-dvh items-center justify-center px-5 pb-20 md:pl-24">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md rounded-[2rem] border border-red-500/15 bg-black/55 p-9 text-center shadow-2xl backdrop-blur-xl"
          >
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 text-3xl">
              ▶
            </div>

            <h1 className="text-2xl font-black">
              {error ? "Unable to load clips" : "Clips are waiting"}
            </h1>

            <p className="mt-2 text-sm leading-6 text-white/55">
              {error
                ? "Something went wrong while loading your clips. Please try again."
                : "Short videos and visual stories from the Zenigram community will appear here."}
            </p>

            {error && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-5 rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold hover:bg-white/10"
              >
                Try again
              </button>
            )}

            <Link
              href="/create-clip"
              className="mt-6 inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-bold transition hover:bg-red-500 active:scale-95"
            >
              Create a clip
            </Link>
          </motion.div>
        </div>
      </main>
    );
  }

  // --------------------------------------------------
  // Main feed
  // --------------------------------------------------

  return (
    <main className="h-dvh overflow-hidden bg-[#050202] text-white">
      <Navbar />

      <header className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center bg-gradient-to-b from-black/80 via-black/30 to-transparent px-5 pb-12 pt-4 md:left-20">
        <div className="pointer-events-auto rounded-full border border-white/10 bg-black/25 px-5 py-2 text-sm font-black tracking-wide shadow-xl backdrop-blur-xl">
          Clips
        </div>
      </header>

      {/* Notifications */}

      <AnimatePresence>
        {(error || notice) && (
          <motion.div
            role={error ? "alert" : "status"}
            aria-live={error ? "assertive" : "polite"}
            initial={{
              opacity: 0,
              y: -12,
              x: "-50%",
            }}
            animate={{
              opacity: 1,
              y: 0,
              x: "-50%",
            }}
            exit={{
              opacity: 0,
              y: -8,
              x: "-50%",
            }}
            className={`fixed left-1/2 top-16 z-[70] flex max-w-[calc(100%-2rem)] items-center gap-3 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur-xl ${
              error
                ? "border-red-500/30 bg-red-950/90 text-red-100"
                : "border-white/10 bg-zinc-900/90 text-white"
            }`}
          >
            <span>{error || notice}</span>

            {error && (
              <button
                type="button"
                onClick={() => setError("")}
                className="text-white/55 hover:text-white"
                aria-label="Dismiss error"
              >
                ×
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed */}

      <section
        ref={feedRef}
        aria-label="Clips feed"
        className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-[radial-gradient(circle_at_50%_50%,rgba(127,29,29,.14),transparent_42%),#050202] pb-20 md:pl-20 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {clips.map((clip) => {
          const clipId = getClipId(clip);

          const username =
            clip.user?.username || "user";

          const avatar =
            clip.user?.profilePic || "/user.svg";

          const isActive =
            String(activeClipId) === clipId;

          const likesCount = getLikesCount(clip);

          const viewsCount = getViewsCount(clip);

          const profileHref = clip.user?.username
            ? `/profile/${encodeURIComponent(username)}`
            : null;

          return (
            <article
              key={clipId}
              data-clip-id={clipId}
              aria-label={`Clip by ${username}`}
              className="relative mx-auto flex h-[calc(100dvh-5rem)] w-full snap-start snap-always items-center justify-center overflow-hidden md:h-dvh"
            >
              <motion.div
                animate={{
                  opacity: isActive ? 1 : 0.62,
                  scale: isActive ? 1 : 0.985,
                }}
                transition={{ duration: 0.28 }}
                className="relative h-full w-full overflow-hidden bg-black sm:h-[min(94dvh,900px)] sm:max-w-[500px] sm:rounded-[1.7rem] sm:border sm:border-white/10 sm:shadow-[0_30px_100px_rgba(0,0,0,.65)]"
              >
                <ClipReelPlayer
                  clip={clip}
                  isActive={isActive && !isDialogOpen}
                  muted={muted}
                  onMutedChange={setMuted}
                  onFirstPlay={() => void markAsViewed(clip._id)}
                  onDoubleLike={() => handleDoubleLike(clip)}
                />

                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-36 bg-gradient-to-b from-black/55 to-transparent" />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[48%] bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

                {/* Action buttons */}

                <aside
                  className="absolute bottom-24 right-3 z-40 flex flex-col items-center gap-4 sm:right-4"
                  aria-label="Clip actions"
                >
                  <ReelAction
                    onClick={() => setOptionsClip(clip)}
                    ariaLabel="More clip options"
                    label="More"
                    icon={<MoreIcon />}
                  />

                  <ReelAction
                    active={Boolean(clip.viewerLiked)}
                    disabled={updatingClips.has(
                      `${clipId}-like`
                    )}
                    onClick={() => void handleLike(clip._id)}
                    ariaLabel={
                      clip.viewerLiked
                        ? "Unlike clip"
                        : "Like clip"
                    }
                    label={formatCount(likesCount)}
                    icon={
                      <HeartIcon
                        filled={Boolean(clip.viewerLiked)}
                      />
                    }
                  />

                  <ReelAction
                    onClick={() => setCommentsClip(clip)}
                    ariaLabel="Open clip comments"
                    label={formatCount(
                      clip.commentsCount || 0
                    )}
                    icon={<CommentIcon />}
                  />

                  <ReelAction
                    onClick={() => setSharingClip(clip)}
                    ariaLabel="Share clip in a message"
                    label={formatCount(clip.shares || 0)}
                    icon={<ShareIcon />}
                  />

                  <div className="flex flex-col items-center gap-1.5 text-white">
                    <span className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-black/40 shadow-lg backdrop-blur-md">
                      <EyeIcon />
                    </span>

                    <span className="text-[11px] font-bold drop-shadow-lg">
                      {formatCount(viewsCount)}
                    </span>
                  </div>
                </aside>

                {/* Creator and caption */}

                <div className="absolute bottom-5 left-4 right-20 z-40 sm:bottom-6">
                  {profileHref ? (
                    <Link
                      href={profileHref}
                      className="inline-flex items-center gap-2.5 rounded-full pr-3 transition hover:bg-white/10"
                    >
                      <Image
                        src={avatar}
                        alt={`${username}'s profile`}
                        width={38}
                        height={38}
                        unoptimized
                        className="h-9 w-9 rounded-full border border-white/25 object-cover"
                      />

                      <span className="max-w-44 truncate text-sm font-black drop-shadow-lg">
                        @{username}
                      </span>
                    </Link>
                  ) : (
                    <div className="inline-flex items-center gap-2.5">
                      <Image
                        src={avatar}
                        alt="Default profile"
                        width={38}
                        height={38}
                        unoptimized
                        className="h-9 w-9 rounded-full border border-white/25 object-cover"
                      />

                      <span className="text-sm font-black">
                        @user
                      </span>
                    </div>
                  )}

                  {clip.caption && (
                    <p className="mt-3 line-clamp-3 max-w-sm text-[13px] leading-5 text-white/95 drop-shadow-lg sm:text-sm">
                      {clip.caption}
                    </p>
                  )}

                  <div className="mt-3 inline-flex max-w-[250px] items-center gap-2 rounded-full bg-black/20 px-2.5 py-1.5 text-xs text-white/75 backdrop-blur-sm">
                    <MusicIcon />

                    <span className="truncate">
                      Original audio · @{username}
                    </span>
                  </div>
                </div>
              </motion.div>
            </article>
          );
        })}
      </section>

      {/* Dialogs */}

      <AnimatePresence>
        {commentsClip && (
          <ClipCommentsDialog
            key={`comments-${getClipId(commentsClip)}`}
            clip={commentsClip}
            onClose={() => setCommentsClip(null)}
            onCommentAdded={handleCommentAdded}
          />
        )}

        {sharingClip && (
          <ClipShareDialog
            key={`share-${getClipId(sharingClip)}`}
            clip={sharingClip}
            onClose={() => setSharingClip(null)}
            onShared={handleShared}
          />
        )}

        {optionsClip && (
          <ClipOptions
            key={`options-${getClipId(optionsClip)}`}
            clip={optionsClip}
            currentUserId={currentUserId}
            onClose={() => setOptionsClip(null)}
            onPreference={(action) =>
              void handlePreference(action)
            }
            onFeedFeedback={(feedback) =>
              void handleFeedFeedback(feedback)
            }
            onSave={() => void handleSave()}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
