"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  IoArrowBack,
  IoArrowForward,
  IoChatbubbleOutline,
  IoCheckmarkCircle,
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

  return (
    (Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, 5), 60)
      : 15) * 1000
  );
}

function formatStoryTime(value) {
  if (!value) return "Just now";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function threadComments(comments = []) {
  const byParent = new Map();

  for (const comment of comments) {
    const parentId =
      comment?.parentId && typeof comment.parentId === "object"
        ? comment.parentId._id
        : comment?.parentId;

    const key = String(parentId || "root");

    if (!byParent.has(key)) {
      byParent.set(key, []);
    }

    byParent.get(key).push(comment);
  }

  const visit = (parentId, depth = 0, seen = new Set()) => {
    const result = [];
    const children = byParent.get(String(parentId || "root")) || [];

    for (const comment of children) {
      const id = String(comment?._id || "");

      if (!id || seen.has(id)) continue;

      const nextSeen = new Set(seen);
      nextSeen.add(id);

      result.push({ comment, depth });
      result.push(...visit(id, depth + 1, nextSeen));
    }

    return result;
  };

  return visit("root");
}

export default function StoryModal({
  storyGroup,
  initialIndex = 0,
  onClose,
  onStoryUpdate,
}) {
  const router = useRouter();

  const stories = useMemo(
    () => (Array.isArray(storyGroup?.stories) ? storyGroup.stories : []),
    [storyGroup]
  );

  const safeInitialIndex = useMemo(() => {
    if (!stories.length) return 0;

    return Math.min(
      Math.max(Number(initialIndex) || 0, 0),
      stories.length - 1
    );
  }, [initialIndex, stories.length]);

  const [storyIndex, setStoryIndex] = useState(safeInitialIndex);
  const [remainingMs, setRemainingMs] = useState(() =>
    getDurationMs(stories[safeInitialIndex])
  );

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
  const storyStartedAtRef = useRef(null);

  const story = stories[storyIndex];
  const username = story?.userId?.username || "Zenigram user";

  const durationMs = getDurationMs(story);

  const progress =
    durationMs > 0
      ? Math.min(
          100,
          Math.max(0, ((durationMs - remainingMs) / durationMs) * 100)
        )
      : 0;

  const showRewardNotice = useCallback((notice) => {
    if (rewardTimerRef.current) {
      window.clearTimeout(rewardTimerRef.current);
    }

    setRewardNotice(notice);

    rewardTimerRef.current = window.setTimeout(() => {
      setRewardNotice(null);
      rewardTimerRef.current = null;
    }, 3200);
  }, []);

  const resetStoryState = useCallback((nextStory) => {
    setRemainingMs(getDurationMs(nextStory));
    setFlipped(false);
    setDetailTab("comments");
    setComments([]);
    setCommentText("");
    setReplyToComment(null);
    setSocialMessage("");
    setShareError("");
    setShareQuery("");
    setShareUsers([]);
    setLikeBurst(false);
    setCommentMentionQuery("");
    setCommentMentionResults([]);
    storyStartedAtRef.current = null;
  }, []);

  const moveToStory = useCallback(
    (nextIndex) => {
      if (!stories.length) {
        onClose?.();
        return;
      }

      if (nextIndex >= stories.length) {
        onClose?.();
        return;
      }

      const safeIndex = Math.max(0, nextIndex);
      const nextStory = stories[safeIndex];

      setStoryIndex(safeIndex);
      resetStoryState(nextStory);
    },
    [onClose, resetStoryState, stories]
  );

  /*
   * Keep internal state synchronized if the parent changes the story group
   * or initial story while this modal is already mounted.
   */
  useEffect(() => {
    setStoryIndex(safeInitialIndex);
    resetStoryState(stories[safeInitialIndex]);
  }, [safeInitialIndex, resetStoryState, stories]);

  /*
   * Story timer.
   *
   * The previous implementation recreated a timeout every 100ms because
   * remainingMs was in the effect dependency list. Using a timestamp avoids
   * constantly resetting the timeout and gives smoother, more predictable
   * progress.
   */
  useEffect(() => {
    if (!story?._id || flipped) {
      storyStartedAtRef.current = null;
      return undefined;
    }

    const now = performance.now();

    if (storyStartedAtRef.current === null) {
      storyStartedAtRef.current = now;
    }

    const startedAt = storyStartedAtRef.current;
    const initialRemaining = remainingMs;

    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const nextRemaining = Math.max(0, initialRemaining - elapsed);

      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(interval);
        moveToStory(storyIndex + 1);
      }
    }, 100);

    return () => {
      window.clearInterval(interval);
    };
  }, [flipped, moveToStory, remainingMs, story?._id, storyIndex]);

  /*
   * Load views and comments for the active story.
   */
  useEffect(() => {
    if (!story?._id) return undefined;

    let cancelled = false;

    const load = async () => {
      try {
        const [engagementResponse, commentsResponse] = await Promise.all([
          fetch(`/api/stories/${story._id}/engagement`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "view",
            }),
          }),
          fetch(`/api/stories/${story._id}/comments`, {
            cache: "no-store",
          }),
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

          setComments(
            Array.isArray(data.comments) ? data.comments : []
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error(
            "Unable to load story interactions:",
            error
          );
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [onStoryUpdate, showRewardNotice, story?._id]);

  /*
   * User search for story sharing.
   */
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
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          setShareUsers([]);
          return;
        }

        const data = await response.json();

        setShareUsers(
          Array.isArray(data.users) ? data.users.slice(0, 8) : []
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          setShareUsers([]);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [shareQuery]);

  /*
   * User search for @mentions.
   */
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
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          setCommentMentionResults([]);
          return;
        }

        const data = await response.json();

        setCommentMentionResults(
          Array.isArray(data.users) ? data.users.slice(0, 5) : []
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          setCommentMentionResults([]);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [commentMentionQuery]);

  /*
   * Cleanup timers.
   */
  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }

      if (likeTimerRef.current) {
        window.clearTimeout(likeTimerRef.current);
      }

      if (rewardTimerRef.current) {
        window.clearTimeout(rewardTimerRef.current);
      }
    };
  }, []);

  const toggleLike = useCallback(async () => {
    if (!story?._id) return;

    setLikeBurst(true);

    if (likeTimerRef.current) {
      window.clearTimeout(likeTimerRef.current);
    }

    likeTimerRef.current = window.setTimeout(() => {
      setLikeBurst(false);
      likeTimerRef.current = null;
    }, 850);

    try {
      const response = await fetch(
        `/api/stories/${story._id}/engagement`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "like",
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Unable to update story like");
      }

      const data = await response.json();

      onStoryUpdate?.(story._id, data);
    } catch (error) {
      console.error("Unable to update story like:", error);
    }
  }, [onStoryUpdate, story?._id]);

  const handleStoryTap = useCallback(() => {
    if (flipped || !story?._id) return;

    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;

      void toggleLike();
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      moveToStory(storyIndex + 1);
    }, 250);
  }, [flipped, moveToStory, story?._id, storyIndex, toggleLike]);

  const handleStoryKeyDown = useCallback(
    (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleStoryTap();
      }
    },
    [handleStoryTap]
  );

  const flipToDetails = useCallback(
    (event) => {
      event.stopPropagation();

      setFlipped(true);
      setRemainingMs(durationMs);
      storyStartedAtRef.current = null;
    },
    [durationMs]
  );

  const returnToStory = useCallback(
    (event) => {
      event.stopPropagation();

      setFlipped(false);
      setRemainingMs(durationMs);
      storyStartedAtRef.current = null;
    },
    [durationMs]
  );

  const updateCommentText = useCallback((value) => {
    setCommentText(value);

    const match = value.match(
      /(?:^|\s)@([a-zA-Z0-9_.]*)$/
    );

    setCommentMentionQuery(match?.[1] || "");
  }, []);

  const selectCommentMention = useCallback((name) => {
    setCommentText((current) =>
      current.replace(
        /@([a-zA-Z0-9_.]*)$/,
        `@${name} `
      )
    );

    setCommentMentionQuery("");
    setCommentMentionResults([]);
  }, []);

  const submitComment = useCallback(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (commentBusy || !story?._id) return;

      const text = commentText.trim();

      if (!text) return;

      setCommentBusy(true);
      setSocialMessage("");

      try {
        const response = await fetch(
          `/api/stories/${story._id}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              parentId: replyToComment?._id,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              data.message ||
              "Unable to add comment"
          );
        }

        if (data.comment) {
          setComments((current) => [
            ...current,
            data.comment,
          ]);
        }

        setCommentText("");
        setReplyToComment(null);
        setCommentMentionQuery("");
        setCommentMentionResults([]);

        onStoryUpdate?.(story._id, {
          commentsCount:
            Number(story.commentsCount || 0) + 1,
        });
      } catch (error) {
        setSocialMessage(
          error?.message || "Unable to add comment"
        );
      } finally {
        setCommentBusy(false);
      }
    },
    [
      commentBusy,
      commentText,
      onStoryUpdate,
      replyToComment?._id,
      story?._id,
      story?.commentsCount,
    ]
  );

  const likeComment = useCallback(
    async (comment) => {
      if (!story?._id || !comment?._id) return;

      try {
        const response = await fetch(
          `/api/stories/${story._id}/comments`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "like",
              commentId: comment._id,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to like comment"
          );
        }

        if (data.comment) {
          setComments((current) =>
            current.map((item) =>
              item._id === comment._id
                ? { ...item, ...data.comment }
                : item
            )
          );
        }
      } catch (error) {
        setSocialMessage(
          error?.message || "Unable to like comment"
        );
      }
    },
    [story?._id]
  );

  const openReply = useCallback((comment) => {
    setReplyToComment(comment);
    setCommentText(
      `@${comment?.user?.username || ""} `
    );
  }, []);

  const shareToUser = useCallback(
    async (recipient) => {
      if (!story?._id || !recipient?._id || shareBusyId) {
        return;
      }

      setShareBusyId(recipient._id);
      setShareError("");
      setSocialMessage("");

      try {
        const conversationResponse = await fetch(
          "/api/conversations",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipientId: recipient._id,
            }),
          }
        );

        const conversationData =
          await conversationResponse.json();

        if (
          !conversationResponse.ok ||
          !conversationData.conversation?._id
        ) {
          throw new Error(
            conversationData.error ||
              conversationData.message ||
              "Unable to open conversation"
          );
        }

        const shareUrl =
          `${window.location.origin}/stories-globe` +
          `?story=${encodeURIComponent(story._id)}`;

        const messageResponse = await fetch(
          `/api/conversations/${conversationData.conversation._id}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: shareUrl,
            }),
          }
        );

        const messageData =
          await messageResponse.json();

        if (!messageResponse.ok) {
          throw new Error(
            messageData.error ||
              messageData.message ||
              "Unable to send story"
          );
        }

        setShareQuery("");
        setShareUsers([]);
        setSocialMessage(
          `Story sent to @${recipient.username}`
        );
      } catch (error) {
        setShareError(
          error?.message || "Unable to share story"
        );
      } finally {
        setShareBusyId("");
      }
    },
    [shareBusyId, story?._id]
  );

  const nativeShare = useCallback(async () => {
    if (!story?._id) return;

    try {
      const shareUrl =
        `${window.location.origin}/stories-globe` +
        `?story=${encodeURIComponent(story._id)}`;

      if (navigator.share) {
        await navigator.share({
          title: `Zenigram story by @${username}`,
          text: `View @${username}'s story on Zenigram`,
          url: shareUrl,
        });

        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setSocialMessage(
          "Story link copied to clipboard"
        );
      } else {
        setSocialMessage(
          "Sharing is not supported on this device"
        );
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        setSocialMessage(
          "Unable to share story link"
        );
      }
    }
  }, [story?._id, username]);

  const startConversation = useCallback(
    async (event) => {
      event.stopPropagation();

      const recipientId = story?.userId?._id;

      if (!recipientId) return;

      try {
        const response = await fetch(
          "/api/conversations",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              recipientId,
              eventId: story?.event?._id,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok || !data.conversation?._id) {
          throw new Error(
            data.error ||
              data.message ||
              "Unable to start conversation"
          );
        }

        router.push(
          `/messages?conversation=${encodeURIComponent(
            data.conversation._id
          )}`
        );
      } catch (error) {
        setSocialMessage(
          error?.message ||
            "Unable to start conversation"
        );
      }
    },
    [router, story?.event?._id, story?.userId?._id]
  );

  if (!story) return null;

  const commentsThread = threadComments(comments);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 px-2 py-4 backdrop-blur-xl sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Story by @${username}`}
    >
      <AnimatePresence>
        {rewardNotice && (
          <motion.div
            initial={{
              opacity: 0,
              y: -22,
              scale: 0.96,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: -16,
            }}
            className="absolute left-1/2 top-4 z-[120] w-[min(90vw,360px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md"
          >
            <div className="flex items-start gap-2">
              {rewardNotice.type === "reward" ? (
                <IoSparkles className="shrink-0 text-lg text-yellow-400" />
              ) : (
                <IoCheckmarkCircle className="shrink-0 text-lg text-emerald-400" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">
                  {rewardNotice.title}
                </p>

                {rewardNotice.points ? (
                  <p className="text-xs text-cyan-200">
                    +{rewardNotice.points} points
                  </p>
                ) : null}

                {rewardNotice.description ? (
                  <p className="text-xs text-white/70">
                    {rewardNotice.description}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative h-[min(86dvh,780px)] w-[min(94vw,440px)] [perspective:1600px]">
        {/* Progress */}
        <div className="absolute -top-11 left-0 right-0 z-30">
          <div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[.18em] text-white/50">
            {storyIndex + 1} / {stories.length}
          </div>

          <div className="flex gap-1.5">
            {stories.map((item, index) => (
              <div
                key={item._id}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
              >
                <div
                  className="h-full rounded-full bg-cyan-300 transition-[width]"
                  style={{
                    width: `${
                      index < storyIndex
                        ? 100
                        : index === storyIndex
                          ? progress
                          : 0
                    }%`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Header */}
        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between">
          <Link
            href={`/profile/${encodeURIComponent(username)}`}
            className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 pr-3 backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={story.userId?.profilePic || "/user.svg"}
              alt=""
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 shrink-0 rounded-full border border-cyan-300/60 object-cover"
            />

            <span className="truncate text-sm font-semibold">
              @{username}
            </span>

            <span className="hidden shrink-0 text-xs text-white/45 sm:inline">
              {formatStoryTime(story.createdAt)}
            </span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 active:scale-90"
          >
            <IoClose className="text-lg" />
          </button>
        </div>

        {/* Story card */}
        <motion.div
          animate={{
            rotateY: flipped ? 180 : 0,
          }}
          transition={{
            duration: 0.52,
            ease: "easeInOut",
          }}
          className="relative h-full w-full [transform-style:preserve-3d]"
        >
          {/* Front */}
          <section className="absolute inset-0 overflow-hidden rounded-[24px] border border-cyan-300/15 bg-black shadow-2xl [backface-visibility:hidden]">
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
                alt=""
                fill
                priority
                unoptimized
                className="object-contain"
              />
            )}

            <div className="pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/85 via-transparent to-black/20" />

            {/* Story information */}
            <div className="absolute bottom-16 left-4 right-4 z-30 space-y-2">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-black/45 px-2.5 py-1 text-emerald-300">
                  <IoShieldCheckmark className="text-xs" />
                  Verified
                </span>
              </div>

              {story.caption ? (
                <p className="max-w-[95%] rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm leading-5 text-white/90 backdrop-blur-md">
                  {story.caption}
                </p>
              ) : null}
            </div>

            {/* Like animation */}
            <AnimatePresence>
              {likeBurst && (
                <motion.div
                  initial={{
                    opacity: 0,
                    scale: 0.3,
                  }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    scale: [0.3, 1.15, 1.35, 1.8],
                    y: [0, -4, -8, -24],
                  }}
                  transition={{
                    duration: 0.8,
                  }}
                  className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 text-6xl"
                >
                  <IoHeart className="text-red-500" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Details button */}
            <button
              type="button"
              onClick={flipToDetails}
              className="absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-cyan-200/20 bg-black/55 px-3 py-2 text-xs font-semibold text-cyan-200 active:scale-90"
            >
              <IoSparkles className="text-sm" />
              Details
            </button>

            {/* Interaction hint */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[30] hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur-sm sm:block">
              Tap to advance • Double-tap to like
            </div>

            {/* Tap layer */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Advance story"
              onClick={handleStoryTap}
              onKeyDown={handleStoryKeyDown}
              className="absolute inset-0 z-[25] cursor-pointer outline-none"
            />
          </section>

          {/* Details */}
          <section className="absolute inset-0 flex flex-col overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#061018] p-4 text-white shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:24px_24px]" />

            {/* Details header */}
            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-cyan-300/70">
                  Story details
                </p>

                <h2 className="mt-1 truncate text-lg font-bold">
                  @{username}
                </h2>
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={startConversation}
                  aria-label={`Message @${username}`}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90"
                >
                  <IoPaperPlaneOutline className="text-lg" />
                </button>

                <button
                  type="button"
                  onClick={returnToStory}
                  aria-label="Return to story"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90"
                >
                  <IoClose className="text-lg" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="relative z-10 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs">
              {["comments", "share", "activity"].map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setDetailTab(tab)}
                    className={`rounded-lg px-3 py-2 font-semibold capitalize transition-all ${
                      detailTab === tab
                        ? "bg-cyan-500/30 text-cyan-200"
                        : "bg-transparent text-white/50 active:scale-95"
                    }`}
                  >
                    {tab}
                  </button>
                )
              )}
            </div>

            {/* Tab content */}
            <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {detailTab === "comments" && (
                <div className="space-y-3">
                  {/* Comment form */}
                  <form
                    onSubmit={submitComment}
                    className="relative rounded-2xl border border-white/10 bg-black/25 p-1"
                  >
                    {replyToComment && (
                      <div className="mb-1 flex items-center justify-between rounded-xl bg-cyan-300/5 px-3 py-1.5 text-[10px] text-cyan-200">
                        <span>
                          Replying to @
                          {replyToComment.user?.username ||
                            "User"}
                        </span>

                        <button
                          type="button"
                          aria-label="Cancel reply"
                          onClick={() =>
                            setReplyToComment(null)
                          }
                          className="active:scale-90"
                        >
                          <IoClose />
                        </button>
                      </div>
                    )}

                    {commentMentionResults.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#071019] shadow-2xl">
                        {commentMentionResults.map(
                          (user) => (
                            <button
                              key={user._id}
                              type="button"
                              onClick={() =>
                                selectCommentMention(
                                  user.username
                                )
                              }
                              className="block w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5 active:bg-white/10"
                            >
                              @{user.username}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <input
                        value={commentText}
                        onChange={(event) =>
                          updateCommentText(
                            event.target.value
                          )
                        }
                        placeholder="Write something thoughtful…"
                        aria-label="Write a comment"
                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-white/40 outline-none"
                      />

                      <button
                        type="submit"
                        disabled={
                          commentBusy ||
                          !commentText.trim()
                        }
                        aria-label="Post comment"
                        className="shrink-0 rounded-full bg-cyan-500/30 px-3 py-2 text-xs font-semibold text-cyan-300 disabled:opacity-50 active:scale-90"
                      >
                        <IoPaperPlaneOutline className="text-sm" />
                      </button>
                    </div>
                  </form>

                  {socialMessage && (
                    <p className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">
                      {socialMessage}
                    </p>
                  )}

                  {commentsThread.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                      <IoChatbubbleOutline className="mx-auto text-2xl text-white/20" />

                      <p className="mt-2 text-xs text-white/40">
                        No comments yet. Be the first!
                      </p>
                    </div>
                  ) : (
                    commentsThread.map(
                      ({ comment: item, depth }) => (
                        <div
                          key={item._id}
                          style={{
                            marginLeft: `${Math.min(
                              depth,
                              6
                            ) * 12}px`,
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-cyan-200">
                                @
                                {item.user?.username ||
                                  "User"}
                              </p>

                              <p className="mt-1 text-xs text-white/80">
                                {item.text}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                likeComment(item)
                              }
                              aria-label={
                                item.likedByMe
                                  ? "Unlike comment"
                                  : "Like comment"
                              }
                              className="shrink-0 active:scale-90"
                            >
                              <IoHeart
                                className={`text-sm ${
                                  item.likedByMe
                                    ? "text-red-500"
                                    : "text-white/30"
                                }`}
                              />
                            </button>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <p className="text-[9px] text-white/40">
                              {formatStoryTime(
                                item.createdAt
                              )}
                            </p>

                            <button
                              type="button"
                              onClick={() =>
                                openReply(item)
                              }
                              className="text-[9px] text-cyan-300/60 active:scale-90"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                      )
                    )
                  )}
                </div>
              )}

              {detailTab === "share" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={nativeShare}
                    className="flex w-full items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-left active:scale-[.99]"
                  >
                    <span className="text-2xl">
                      <IoShareOutline />
                    </span>

                    <span className="flex-1">
                      <p className="text-xs font-semibold text-white">
                        Share via native
                      </p>

                      <p className="text-[10px] text-white/60">
                        Use your device&apos;s native share
                      </p>
                    </span>
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-white/65">
                      Send to a Zenigram user
                    </p>

                    <input
                      value={shareQuery}
                      onChange={(event) =>
                        setShareQuery(
                          event.target.value
                        )
                      }
                      placeholder="Enter username…"
                      aria-label="Search users to share with"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-white/40 outline-none"
                    />

                    {shareUsers.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {shareUsers.map((user) => (
                          <button
                            key={user._id}
                            type="button"
                            onClick={() =>
                              shareToUser(user)
                            }
                            disabled={
                              shareBusyId === user._id
                            }
                            className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-white disabled:opacity-50 active:scale-[.98]"
                          >
                            <Image
                              src={
                                user.profilePic ||
                                "/user.svg"
                              }
                              alt=""
                              width={24}
                              height={24}
                              unoptimized
                              className="h-6 w-6 rounded-full object-cover"
                            />

                            <span className="flex-1">
                              @{user.username}
                            </span>

                            {shareBusyId ===
                            user._id ? (
                              <span className="text-[10px] text-cyan-300">
                                Sending…
                              </span>
                            ) : (
                              <IoArrowForward className="shrink-0 text-white/40" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {shareError && (
                      <p className="mt-2 rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-200">
                        {shareError}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {detailTab === "activity" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                    <IoEye className="text-2xl text-cyan-200" />

                    <p className="mt-3 text-2xl font-bold">
                      {story.views || 0}
                    </p>

                    <p className="text-[10px] text-white/50">
                      Views
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                    <IoHeart className="text-2xl text-red-400" />

                    <p className="mt-3 text-2xl font-bold">
                      {story.likes || 0}
                    </p>

                    <p className="text-[10px] text-white/50">
                      Likes
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                    <IoChatbubbleOutline className="text-2xl text-blue-400" />

                    <p className="mt-3 text-2xl font-bold">
                      {story.commentsCount || 0}
                    </p>

                    <p className="text-[10px] text-white/50">
                      Comments
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[.025] p-4">
                    <IoShareOutline className="text-2xl text-green-400" />

                    <p className="mt-3 text-2xl font-bold">
                      {story.shares || 0}
                    </p>

                    <p className="text-[10px] text-white/50">
                      Shares
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Details footer */}
            <div className="relative z-10 mt-3 flex items-center justify-between border-t border-white/10 pt-3">
              <p className="text-[10px] text-white/30">
                Story expires in 24 hours
              </p>

              <button
                type="button"
                onClick={returnToStory}
                aria-label="Return to story"
                className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90"
              >
                <IoReturnDownBack className="text-lg" />
              </button>
            </div>
          </section>
        </motion.div>

        {/* Previous / next controls */}
        {!flipped && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                moveToStory(storyIndex - 1);
              }}
              disabled={storyIndex === 0}
              aria-label="Previous story"
              className="absolute left-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 disabled:opacity-30 active:scale-90"
            >
              <IoArrowBack className="text-lg" />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                moveToStory(storyIndex + 1);
              }}
              disabled={
                storyIndex === stories.length - 1
              }
              aria-label="Next story"
              className="absolute right-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 disabled:opacity-30 active:scale-90"
            >
              <IoArrowForward className="text-lg" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}