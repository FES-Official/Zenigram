"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IoArrowBack,
  IoArrowForward,
  IoChatbubbleOutline,
  IoClose,
  IoEye,
  IoHeart,
  IoPaperPlaneOutline,
  IoReturnDownBack,
  IoShareOutline,
  IoShieldCheckmark,
  IoSparkles,
} from "react-icons/io5";

function getDurationMs(story) {
  const seconds = Number(story?.duration);
  return (Number.isFinite(seconds) ? Math.min(Math.max(seconds, 5), 60) : 15) * 1000;
}

function formatStoryTime(value) {
  if (!value) return "Just now";
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Just now";
  }
}

function threadComments(comments) {
  const byParent = new Map();
  comments.forEach((comment) => {
    const key = String(comment.parentId || "root");
    byParent.set(key, [...(byParent.get(key) || []), comment]);
  });

  const visit = (parentId, depth = 0, seen = new Set()) => {
    const result = [];
    for (const comment of byParent.get(String(parentId || "root")) || []) {
      const id = String(comment._id);
      if (seen.has(id)) continue;
      const nextSeen = new Set(seen).add(id);
      result.push({ comment, depth }, ...visit(id, depth + 1, nextSeen));
    }
    return result;
  };

  return visit("root");
}

export default function StoryModal({ storyGroup, initialIndex = 0, onClose, onStoryUpdate }) {
  const router = useRouter();
  const stories = useMemo(() => storyGroup?.stories || [], [storyGroup]);
  const initial = Math.min(Math.max(initialIndex, 0), Math.max(stories.length - 1, 0));

  const [storyIndex, setStoryIndex] = useState(initial);
  const [remainingMs, setRemainingMs] = useState(() => getDurationMs(stories[initial]));
  const [flipped, setFlipped] = useState(false);
  const [detailTab, setDetailTab] = useState("comments");
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [replyToComment, setReplyToComment] = useState(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentMentionQuery, setCommentMentionQuery] = useState("");
  const [commentMentionResults, setCommentMentionResults] = useState([]);
  const [shareQuery, setShareQuery] = useState("");
  const [shareUsers, setShareUsers] = useState([]);
  const [shareBusyId, setShareBusyId] = useState("");
  const [shareError, setShareError] = useState("");
  const [socialMessage, setSocialMessage] = useState("");
  const [likeBurst, setLikeBurst] = useState(false);
  const [rewardNotice, setRewardNotice] = useState(null);

  const tapTimerRef = useRef(null);
  const likeTimerRef = useRef(null);
  const rewardTimerRef = useRef(null);
  const storySurfaceRef = useRef(null);

  const story = stories[storyIndex];
  const username = story?.userId?.username || "Zenigram user";
  const durationMs = getDurationMs(story);
  const progress = Math.min(
    100,
    Math.max(0, ((durationMs - remainingMs) / durationMs) * 100)
  );

  const showRewardNotice = useCallback((notice) => {
    if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current);
    setRewardNotice(notice);
    rewardTimerRef.current = window.setTimeout(() => setRewardNotice(null), 3200);
  }, []);

  const moveToStory = useCallback(
    (nextIndex) => {
      if (!stories.length) return;
      if (nextIndex >= stories.length) return onClose();

      const safeIndex = Math.max(0, nextIndex);
      setStoryIndex(safeIndex);
      setRemainingMs(getDurationMs(stories[safeIndex]));
      setFlipped(false);
      setDetailTab("comments");
      setComments([]);
      setCommentText("");
      setReplyToComment(null);
      setShareQuery("");
      setShareUsers([]);
      setSocialMessage("");
      setShareError("");
      setLikeBurst(false);
    },
    [onClose, stories]
  );

  // Story playback is deliberately paused while details are open.
  useEffect(() => {
    if (!story?._id || flipped) return undefined;

    const interval = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100));
    }, 100);

    const timeout = window.setTimeout(() => {
      moveToStory(storyIndex + 1);
    }, Math.max(remainingMs, 100));

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [flipped, moveToStory, remainingMs, story?._id, storyIndex]);

  // Load views + comments for the active story.
  useEffect(() => {
    if (!story?._id) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const [engagementResponse, commentsResponse] = await Promise.all([
          fetch(`/api/stories/${story._id}/engagement`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "view" }),
          }),
          fetch(`/api/stories/${story._id}/comments`, { cache: "no-store" }),
        ]);

        if (cancelled) return;

        if (engagementResponse.ok) {
          const data = await engagementResponse.json();
          onStoryUpdate?.(story._id, data);
          if (data.lastHoursReward) {
            showRewardNotice({
              type: "reward",
              title: "Last Hours collected",
              points: data.lastHoursReward.points,
            });
          } else if (data.newlyAwardedAchievements?.length) {
            showRewardNotice({
              type: "achievement",
              title: data.newlyAwardedAchievements[0].title,
              description: "Exploration achievement unlocked",
            });
          }
        }

        if (commentsResponse.ok) {
          const data = await commentsResponse.json();
          setComments(Array.isArray(data.comments) ? data.comments : []);
        }
      } catch (error) {
        if (!cancelled) console.error("Unable to load story interactions:", error);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [onStoryUpdate, showRewardNotice, story?._id]);

  // Search users for sharing.
  useEffect(() => {
    const query = shareQuery.trim();
    if (query.length < 2) {
      setShareUsers([]);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = await response.json();
        setShareUsers(Array.isArray(data.users) ? data.users.slice(0, 8) : []);
      } catch (error) {
        if (error.name !== "AbortError") setShareUsers([]);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [shareQuery]);

  // Search users for @mentions in comments.
  useEffect(() => {
    const query = commentMentionQuery.trim();
    if (query.length < 2) {
      setCommentMentionResults([]);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const data = await response.json();
        setCommentMentionResults(
          Array.isArray(data.users) ? data.users.slice(0, 5) : []
        );
      } catch (error) {
        if (error.name !== "AbortError") setCommentMentionResults([]);
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [commentMentionQuery]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      if (likeTimerRef.current) window.clearTimeout(likeTimerRef.current);
      if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current);
    };
  }, []);

  // Double tap is intentionally a like action. The server remains the source of truth.
  const toggleLike = useCallback(async () => {
    if (!story?._id) return;

    setLikeBurst(true);
    if (likeTimerRef.current) window.clearTimeout(likeTimerRef.current);
    likeTimerRef.current = window.setTimeout(() => setLikeBurst(false), 850);

    try {
      const response = await fetch(`/api/stories/${story._id}/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like" }),
      });
      if (response.ok) onStoryUpdate?.(story._id, await response.json());
    } catch (error) {
      console.error("Unable to update story like:", error);
    }
  }, [onStoryUpdate, story?._id]);

  // A short single-tap delay lets touch devices distinguish single and double taps.
  const handleStoryTap = useCallback(() => {
    if (flipped) return;

    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      void toggleLike();
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      moveToStory(storyIndex + 1);
    }, 280);
  }, [flipped, moveToStory, storyIndex, toggleLike]);

  const flipToDetails = (event) => {
    event.stopPropagation();
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
    setFlipped(true);
    setRemainingMs(durationMs);
  };

  const returnToStory = (event) => {
    event.stopPropagation();
    setFlipped(false);
    setRemainingMs(durationMs);
  };

  const updateCommentText = (value) => {
    setCommentText(value);
    setCommentMentionQuery(
      value.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/)?.[1] || ""
    );
  };

  const selectCommentMention = (name) => {
    setCommentText((current) =>
      current.replace(/@([a-zA-Z0-9_.]*)$/, `@${name} `)
    );
    setCommentMentionQuery("");
    setCommentMentionResults([]);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (commentBusy || !story?._id) return;

    const text = commentText.trim();
    if (!text) return;

    setCommentBusy(true);
    setSocialMessage("");

    try {
      const response = await fetch(`/api/stories/${story._id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          parentId: replyToComment?._id || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || "Unable to add comment");
      }

      setComments((current) => [...current, data.comment]);
      setCommentText("");
      setReplyToComment(null);
      onStoryUpdate?.(story._id, {
        commentsCount: Math.max(
          comments.length + 1,
          Number(story.commentsCount || 0) + 1
        ),
      });
    } catch (error) {
      setSocialMessage(error.message || "Unable to add comment");
    } finally {
      setCommentBusy(false);
    }
  };

  const likeComment = async (comment) => {
    try {
      const response = await fetch(`/api/stories/${story._id}/comments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like", commentId: comment._id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to like comment");
      setComments((current) =>
        current.map((item) =>
          item._id === comment._id ? { ...item, ...data.comment } : item
        )
      );
    } catch (error) {
      setSocialMessage(error.message || "Unable to like comment");
    }
  };

  const openReply = (comment) => {
    setReplyToComment(comment);
    setCommentText(`@${comment.user?.username || ""} `);
    setDetailTab("comments");
  };

  const shareToUser = async (recipient) => {
    if (!story?._id || shareBusyId) return;
    setShareBusyId(recipient._id);
    setShareError("");

    try {
      const conversationResponse = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipient._id }),
      });
      const conversationData = await conversationResponse.json();
      if (!conversationResponse.ok || !conversationData.conversation?._id) {
        throw new Error(
          conversationData.error ||
            conversationData.message ||
            "Unable to open conversation"
        );
      }

      const shareUrl = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;
      const messageResponse = await fetch(
        `/api/conversations/${conversationData.conversation._id}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: {
            text: `Shared a Zenigram story from @${username}: ${shareUrl}`,
          },
        }
      );

      // The API expects JSON; keeping this explicit avoids mobile/browser differences.
      const messageData = await messageResponse.json();
      if (!messageResponse.ok) {
        throw new Error(
          messageData.error || messageData.message || "Unable to send story"
        );
      }

      setShareQuery("");
      setSocialMessage(`Story sent to @${recipient.username}`);
    } catch (error) {
      setShareError(error.message || "Unable to share story");
    } finally {
      setShareBusyId("");
    }
  };

  const nativeShare = async () => {
    if (!story?._id) return;
    const shareUrl = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Zenigram story by @${username}`,
          text: `View @${username}'s story on Zenigram`,
          url: shareUrl,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setSocialMessage("Story link copied to clipboard");
      } else {
        setSocialMessage(shareUrl);
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setSocialMessage("Unable to share story link");
      }
    }
  };

  const startConversation = async (event) => {
    event.stopPropagation();
    const recipientId = story.userId?._id;
    if (!recipientId) return;

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientId,
          eventId: story.event?._id,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || data.message || "Unable to start conversation");
      }
      router.push(`/messages?conversation=${data.conversation._id}`);
    } catch (error) {
      setSocialMessage(error.message || "Unable to start conversation");
    }
  };

  if (!story) return null;

  const commentsThread = threadComments(comments);

  return (
    <div className="fixed inset-0 z-[90] flex min-h-[100dvh] items-center justify-center bg-black/90 px-2 py-3 backdrop-blur-xl sm:px-4 sm:py-4">
      <AnimatePresence>
        {rewardNotice && (
          <motion.div
            initial={{ opacity: 0, y: -18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12 }}
            className="absolute left-1/2 top-4 z-[120] w-[min(92vw,370px)] -translate-x-1/2 rounded-2xl border border-cyan-300/25 bg-[#071019]/95 p-4 text-white shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <IoSparkles className="mt-0.5 text-2xl text-cyan-200" />
              <div>
                <p className="font-semibold text-cyan-100">{rewardNotice.title}</p>
                <p className="mt-1 text-sm text-white/55">
                  {rewardNotice.type === "reward"
                    ? `+${rewardNotice.points} points`
                    : rewardNotice.description}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative h-[calc(100dvh-24px)] max-h-[780px] w-[min(96vw,440px)] sm:h-[min(86dvh,780px)]">
        <div className="absolute -top-10 left-0 right-0 z-30">
          <div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-white/50">
            {storyIndex + 1} / {stories.length}
          </div>
          <div className="flex gap-1.5">
            {stories.map((item, index) => (
              <div key={item._id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-linear-to-r from-cyan-400 via-cyan-200 to-white transition-[width] duration-100"
                  style={{
                    width:
                      index < storyIndex
                        ? "100%"
                        : index === storyIndex
                          ? `${progress}%`
                          : "0%",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between gap-2">
          <Link
            href={`/profile/${username}`}
            onClick={(event) => event.stopPropagation()}
            className="flex min-w-0 max-w-[82%] items-center gap-2 rounded-full bg-black/40 pr-3 backdrop-blur-md"
          >
            <Image
              src={story.userId?.profilePic || "/user.svg"}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 shrink-0 rounded-full border border-cyan-300/60 object-cover"
            />
            <span className="truncate text-sm font-semibold">@{username}</span>
            <span className="hidden shrink-0 text-xs text-white/45 xs:inline sm:inline">
              {formatStoryTime(story.createdAt)}
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 active:scale-95"
          >
            <IoClose />
          </button>
        </div>

        {/*
          Important mobile fix:
          do NOT use a preserve-3d container with two backface-hidden faces.
          Mobile Safari/Chrome can rasterize that combination backwards and make
          the details face unreadable. Only one face is mounted at a time below.
        */}
        <div className="relative h-full w-full overflow-hidden rounded-[24px]">
          <AnimatePresence mode="wait" initial={false}>
            {!flipped ? (
              <motion.section
                key={`story-${story._id}`}
                ref={storySurfaceRef}
                initial={{ opacity: 0, scale: 0.985, x: 12 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.985, x: -12 }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className="absolute inset-0 overflow-hidden rounded-[24px] border border-cyan-300/15 bg-black shadow-2xl"
              >
                {story.mediaType === "video" ? (
                  <video
                    key={story._id}
                    src={story.mediaUrl}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Image
                    key={story._id}
                    src={story.mediaUrl}
                    alt={`${username} story`}
                    fill
                    sizes="(max-width: 640px) 96vw, 440px"
                    priority
                    unoptimized
                    className="z-10 object-contain"
                  />
                )}

                <div className="pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/85 via-transparent to-black/20" />

                <div className="absolute bottom-16 left-4 right-4 z-30 space-y-2">
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-black/45 px-2.5 py-1 text-emerald-100 backdrop-blur-md">
                      <IoShieldCheckmark /> {story.realityScore || 0}% {story.realityLabel || "unverified"}
                    </span>
                    {story.event?.title && (
                      <span className="rounded-full border border-cyan-300/20 bg-black/45 px-2.5 py-1 text-cyan-100 backdrop-blur-md">
                        {story.event.title}
                      </span>
                    )}
                  </div>
                  {story.mission?.title && (
                    <p className="text-sm font-semibold">Mission: {story.mission.title}</p>
                  )}
                  {story.caption && (
                    <p className="max-w-[95%] rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm leading-5 text-white/90 backdrop-blur-md">
                      {story.caption}
                    </p>
                  )}
                </div>

                <AnimatePresence>
                  {likeBurst && (
                    <>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.35 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.35, 1.1, 1.3, 1.8], y: [0, -4, -8, -24] }}
                        transition={{ duration: 0.75 }}
                        className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2"
                      >
                        <IoHeart className="h-28 w-28 fill-current text-pink-500 drop-shadow-[0_0_25px_rgba(236,72,153,.75)]" />
                      </motion.div>
                      {[0, 1, 2, 3, 4, 5].map((index) => (
                        <motion.span
                          key={index}
                          initial={{ opacity: 0, scale: 0.4, x: 0, y: 0 }}
                          animate={{
                            opacity: [0, 1, 0],
                            scale: [0.4, 1, 0.7],
                            x: index % 2 ? `${18 + index * 2}vw` : `${-18 - index * 2}vw`,
                            y: `${-12 - index * 3}vh`,
                          }}
                          transition={{ duration: 0.75, delay: index * 0.035 }}
                          className="pointer-events-none absolute left-1/2 top-1/2 z-50"
                        >
                          <IoHeart className="h-5 w-5 fill-current text-pink-300" />
                        </motion.span>
                      ))}
                    </>
                  )}
                </AnimatePresence>

                <button
                  type="button"
                  onClick={flipToDetails}
                  className="absolute bottom-4 right-4 z-40 flex min-h-10 items-center gap-2 rounded-full border border-cyan-200/20 bg-black/60 px-3.5 py-2 text-xs font-semibold text-cyan-100 backdrop-blur-md transition active:scale-95"
                >
                  Details <IoArrowForward />
                </button>

                <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur-md sm:block">
                  Tap = next · Double tap = like
                </div>

                {/* This is the ONLY story gesture surface. It does not exist on details. */}
                <button
                  type="button"
                  onClick={handleStoryTap}
                  aria-label="Next story. Double tap to like."
                  className="absolute inset-0 z-25 h-full w-full cursor-pointer bg-transparent touch-none outline-none"
                />
              </motion.section>
            ) : (
              <motion.section
                key={`details-${story._id}`}
                initial={{ opacity: 0, scale: 0.985, x: 12, rotateY: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0, rotateY: 0 }}
                exit={{ opacity: 0, scale: 0.985, x: -12, rotateY: -8 }}
                transition={{ duration: 0.28, ease: "easeOut" }}
                onClick={(event) => event.stopPropagation()}
                className="absolute inset-0 flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#061018] p-3.5 text-white shadow-2xl sm:p-5"
              >
                <div className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:30px_30px]" />

                <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-300/70">Story details</p>
                    <h2 className="mt-1 truncate text-lg font-bold">@{username}</h2>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button type="button" onClick={startConversation} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 active:scale-95" title="Message creator" aria-label="Message creator"><IoChatbubbleOutline /></button>
                    <button type="button" onClick={nativeShare} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 active:scale-95" title="Share story" aria-label="Share story"><IoShareOutline /></button>
                    <button type="button" onClick={returnToStory} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 active:scale-95" title="Back to story" aria-label="Back to story"><IoReturnDownBack /></button>
                  </div>
                </div>

                <div className="relative z-10 mt-3 grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
                  {["comments", "share", "activity"].map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDetailTab(tab)}
                      className={`rounded-lg px-2 py-2.5 font-semibold capitalize transition active:scale-[0.98] ${detailTab === tab ? "bg-cyan-300/15 text-cyan-100" : "text-white/45"}`}
                    >
                      {tab === "comments" ? `Comments ${comments.length}` : tab}
                    </button>
                  ))}
                </div>

                <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]">
                  {detailTab === "comments" && (
                    <div className="space-y-3 pb-2">
                      <form onSubmit={submitComment} className="relative rounded-2xl border border-white/10 bg-black/25 p-1">
                        {replyToComment && (
                          <div className="mb-1 flex items-center justify-between rounded-xl bg-cyan-300/5 px-3 py-1.5 text-[10px] text-cyan-200">
                            <span>Replying to @{replyToComment.user?.username || "user"}</span>
                            <button type="button" onClick={() => { setReplyToComment(null); setCommentText(""); }}>Cancel</button>
                          </div>
                        )}

                        {commentMentionResults.length > 0 && (
                          <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#071019] shadow-2xl">
                            {commentMentionResults.map((user) => (
                              <button key={user._id} type="button" onClick={() => selectCommentMention(user.username)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs active:bg-white/10">
                                <Image src={user.profilePic || "/user.svg"} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" />
                                @{user.username}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          <input
                            value={commentText}
                            onChange={(event) => updateCommentText(event.target.value)}
                            placeholder="Write something thoughtful…"
                            className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-white/25"
                          />
                          <button type="submit" disabled={commentBusy || !commentText.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/15 text-cyan-100 disabled:opacity-30" aria-label="Post comment">
                            <IoPaperPlaneOutline />
                          </button>
                        </div>
                      </form>

                      {socialMessage && <p className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">{socialMessage}</p>}

                      {commentsThread.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                          <IoChatbubbleOutline className="mx-auto text-2xl text-white/20" />
                          <p className="mt-2 text-sm text-white/45">Start the conversation.</p>
                        </div>
                      ) : (
                        commentsThread.map(({ comment, depth }) => (
                          <motion.div key={comment._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border border-white/8 bg-white/[.025] p-3 ${depth ? "ml-4 border-l-cyan-300/20" : ""}`}>
                            <div className="flex items-start gap-2">
                              <Image src={comment.user?.profilePic || "/user.svg"} alt="" width={30} height={30} unoptimized className="h-7 w-7 shrink-0 rounded-full object-cover" />
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-cyan-100">@{comment.user?.username || "user"}</p>
                                <p className="mt-1 break-words text-sm leading-5 text-white/75">{comment.text}</p>
                                <div className="mt-2 flex items-center gap-3 text-[10px] text-white/35">
                                  <button type="button" onClick={() => void likeComment(comment)} className={comment.viewerLiked ? "text-pink-300" : "hover:text-pink-200"}><IoHeart className="inline" /> {comment.likes?.length || 0}</button>
                                  <button type="button" onClick={() => openReply(comment)} className="hover:text-cyan-200">Reply</button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  )}

                  {detailTab === "share" && (
                    <div className="space-y-3 pb-2">
                      <button type="button" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-left active:scale-[0.99]">
                        <span className="grid h-10 w-10 place-items-center rounded-full bg-cyan-300/10 text-cyan-100"><IoShareOutline /></span>
                        <span><span className="block text-sm font-semibold">Share story</span><span className="text-xs text-white/40">Use your phone's share menu</span></span>
                      </button>

                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="mb-2 text-xs font-semibold text-white/65">Send to a Zenigram user</p>
                        <input value={shareQuery} onChange={(event) => setShareQuery(event.target.value)} placeholder="Search username…" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-white/25" />
                        <div className="mt-2 space-y-1">
                          {shareUsers.map((user) => (
                            <button key={user._id} type="button" disabled={Boolean(shareBusyId)} onClick={() => void shareToUser(user)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-white/10 disabled:opacity-50">
                              <Image src={user.profilePic || "/user.svg"} alt="" width={34} height={34} unoptimized className="h-8 w-8 rounded-full object-cover" />
                              <span className="min-w-0 flex-1 truncate text-sm">@{user.username}</span>
                              <IoPaperPlaneOutline className="text-cyan-200" />
                            </button>
                          ))}
                        </div>
                        {shareError && <p className="mt-2 text-xs text-rose-300">{shareError}</p>}
                      </div>
                    </div>
                  )}

                  {detailTab === "activity" && (
                    <div className="grid grid-cols-2 gap-2 pb-2">
                      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoEye className="text-cyan-200" /><p className="mt-3 text-xl font-bold">{story.viewsCount || story.views || 0}</p><p className="text-xs text-white/40">Views</p></div>
                      <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoHeart className="text-pink-300" /><p className="mt-3 text-xl font-bold">{story.likesCount || story.likes?.length || 0}</p><p className="text-xs text-white/40">Likes</p></div>
                      <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoShieldCheckmark className="text-emerald-300" /><p className="mt-2 text-xs uppercase tracking-wider text-white/35">Story location</p><p className="mt-1 break-all font-mono text-xs text-white/65">{Number.isFinite(Number(story.latitude)) ? Number(story.latitude).toFixed(6) : "—"}, {Number.isFinite(Number(story.longitude)) ? Number(story.longitude).toFixed(6) : "—"}</p></div>
                    </div>
                  )}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {!flipped && storyIndex > 0 && (
          <button type="button" onClick={(event) => { event.stopPropagation(); moveToStory(storyIndex - 1); }} aria-label="Previous story" className="absolute left-2 top-1/2 z-40 hidden h-12 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur-md sm:grid">
            <IoArrowBack />
          </button>
        )}
        {!flipped && storyIndex < stories.length - 1 && (
          <button type="button" onClick={(event) => { event.stopPropagation(); moveToStory(storyIndex + 1); }} aria-label="Next story" className="absolute right-2 top-1/2 z-40 hidden h-12 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur-md sm:grid">
            <IoArrowForward />
          </button>
        )}
      </div>
    </div>
  );
}
