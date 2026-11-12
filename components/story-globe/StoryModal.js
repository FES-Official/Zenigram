
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
  IoCopyOutline,
  IoEye,
  IoHeart,
  IoPaperPlaneOutline,
  IoReturnDownBack,
  IoShareOutline,
  IoShieldCheckmark,
  IoSparkles,
} from "react-icons/io5";

/* =========================================================
   HELPERS
========================================================= */

function getDurationMs(story) {
  const seconds = Number(story?.duration);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 15000;
  }

  return Math.min(Math.max(seconds, 5), 60) * 1000;
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

function formatRelativeCount(value) {
  const count = Number(value);

  if (!Number.isFinite(count) || count <= 0) {
    return "0";
  }

  if (count < 1000) {
    return String(Math.floor(count));
  }

  if (count < 1000000) {
    return `${(count / 1000).toFixed(
      count < 10000 ? 1 : 0
    )}K`;
  }

  if (count < 1000000000) {
    return `${(count / 1000000).toFixed(
      count < 10000000 ? 1 : 0
    )}M`;
  }

  return `${(count / 1000000000).toFixed(1)}B`;
}

function getUserName(user) {
  return (
    user?.username ||
    user?.name ||
    "Zenigram user"
  );
}

function getId(value) {
  if (value && typeof value === "object") {
    return String(value._id || value.id || "");
  }

  return String(value || "");
}

function flattenComments(comments = []) {
  if (!Array.isArray(comments)) return [];

  const byParent = new Map();

  for (const item of comments) {
    if (!item?._id) continue;

    const parentId = getId(item.parentId);
    const key = parentId || "root";

    if (!byParent.has(key)) {
      byParent.set(key, []);
    }

    byParent.get(key).push(item);
  }

  const result = [];
  const visited = new Set();

  const stack = (byParent.get("root") || [])
    .slice()
    .reverse()
    .map((comment) => ({
      comment,
      depth: 0,
    }));

  while (stack.length) {
    const current = stack.pop();
    const id = getId(current.comment._id);

    if (!id || visited.has(id)) continue;

    visited.add(id);

    result.push(current);

    const children = byParent.get(id) || [];

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        comment: children[i],
        depth: current.depth + 1,
      });
    }
  }

  return result;
}

async function readResponse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/* =========================================================
   STORY MODAL
========================================================= */

export default function StoryModal({
  storyGroup,
  initialIndex = 0,
  onClose,
  onStoryUpdate,
}) {
  const router = useRouter();

  /* ---------------------------------------------------------
     STORY DATA
  --------------------------------------------------------- */

  const stories = useMemo(
    () =>
      Array.isArray(storyGroup?.stories)
        ? storyGroup.stories
        : [],
    [storyGroup?.stories]
  );

  const safeInitialIndex = stories.length
    ? Math.min(
        Math.max(Number(initialIndex) || 0, 0),
        stories.length - 1
      )
    : 0;

  const groupKey = useMemo(
    () =>
      String(
        storyGroup?._id ||
          getId(storyGroup?.userId) ||
          stories.map((item) => item?._id).join(",")
      ),
    [storyGroup?._id, storyGroup?.userId, stories]
  );

  const [storyIndex, setStoryIndex] = useState(
    safeInitialIndex
  );

  const story = stories[storyIndex];

  const storyId = story?._id || null;

  const username = getUserName(story?.userId);

  const duration = getDurationMs(story);

  /* ---------------------------------------------------------
     STATE
  --------------------------------------------------------- */

  const [remainingMs, setRemainingMs] = useState(
    () => getDurationMs(stories[safeInitialIndex])
  );

  const [flipped, setFlipped] = useState(false);

  const [detailTab, setDetailTab] = useState("comments");

  const [comments, setComments] = useState([]);

  const [comment, setComment] = useState("");

  const [reply, setReply] = useState(null);

  const [commentBusy, setCommentBusy] = useState(false);

  const [mentionQuery, setMentionQuery] = useState("");

  const [mentionResults, setMentionResults] = useState([]);

  const [shareQuery, setShareQuery] = useState("");

  const [shareUsers, setShareUsers] = useState([]);

  const [shareBusy, setShareBusy] = useState("");

  const [socialMessage, setSocialMessage] = useState("");

  const [shareError, setShareError] = useState("");

  const [likeBurst, setLikeBurst] = useState(false);

  const [rewardNotice, setRewardNotice] = useState(null);

  const [mediaError, setMediaError] = useState(false);

  const [mediaFallbackTried, setMediaFallbackTried] =
    useState(false);

  const [mediaSrc, setMediaSrc] = useState("");

  /* ---------------------------------------------------------
     REFS
  --------------------------------------------------------- */

  const modalRef = useRef(null);

  const closeButtonRef = useRef(null);

  const videoRef = useRef(null);

  const remainingMsRef = useRef(remainingMs);

  const activeStoryIdRef = useRef(storyId);

  const onStoryUpdateRef = useRef(onStoryUpdate);

  const tapTimerRef = useRef(null);

  const likeTimerRef = useRef(null);

  const rewardTimerRef = useRef(null);

  const timerAnimationRef = useRef(null);

  const timerStartedAtRef = useRef(null);

  const touchStartRef = useRef(null);

  const swipeHandledRef = useRef(false);

  const advanceLockRef = useRef(false);

  const previousFocusRef = useRef(null);

  remainingMsRef.current = remainingMs;

  activeStoryIdRef.current = storyId;

  onStoryUpdateRef.current = onStoryUpdate;

  /* ---------------------------------------------------------
     MEDIA URL
  --------------------------------------------------------- */

  const storyMediaUrl = storyId
    ? `/api/story-globe/story-media?storyId=${encodeURIComponent(
        storyId
      )}`
    : story?.mediaUrl || "";

  /* ---------------------------------------------------------
     TIMER CLEANUP
  --------------------------------------------------------- */

  const clearTapTimer = useCallback(() => {
    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
    }
  }, []);

  const stopStoryTimer = useCallback(() => {
    if (timerAnimationRef.current !== null) {
      window.cancelAnimationFrame(
        timerAnimationRef.current
      );

      timerAnimationRef.current = null;
    }

    timerStartedAtRef.current = null;
  }, []);

  /* ---------------------------------------------------------
     REWARD NOTIFICATION
  --------------------------------------------------------- */

  const showRewardNotice = useCallback((notice) => {
    if (rewardTimerRef.current !== null) {
      window.clearTimeout(rewardTimerRef.current);
    }

    setRewardNotice(notice);

    rewardTimerRef.current = window.setTimeout(() => {
      setRewardNotice(null);
      rewardTimerRef.current = null;
    }, 3200);
  }, []);

  /* ---------------------------------------------------------
     STORY RESET
  --------------------------------------------------------- */

  const resetStoryState = useCallback((nextStory) => {
    const nextDuration = getDurationMs(nextStory);

    setRemainingMs(nextDuration);

    remainingMsRef.current = nextDuration;

    setFlipped(false);

    setDetailTab("comments");

    setComments([]);

    setComment("");

    setReply(null);

    setCommentBusy(false);

    setMentionQuery("");

    setMentionResults([]);

    setShareQuery("");

    setShareUsers([]);

    setShareBusy("");

    setSocialMessage("");

    setShareError("");

    setLikeBurst(false);

    setRewardNotice(null);

    setMediaError(false);

    setMediaFallbackTried(false);

    setMediaSrc("");

    timerStartedAtRef.current = null;

    advanceLockRef.current = false;
  }, []);

  /* ---------------------------------------------------------
     STORY NAVIGATION
  --------------------------------------------------------- */

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

      clearTapTimer();

      stopStoryTimer();

      advanceLockRef.current = false;

      setStoryIndex(safeIndex);

      resetStoryState(stories[safeIndex]);
    },
    [
      stories,
      onClose,
      clearTapTimer,
      stopStoryTimer,
      resetStoryState,
    ]
  );

  const advanceStory = useCallback(() => {
    if (advanceLockRef.current) return;

    advanceLockRef.current = true;

    moveToStory(storyIndex + 1);
  }, [moveToStory, storyIndex]);

  const goToPreviousStory = useCallback(() => {
    if (storyIndex <= 0) return;

    moveToStory(storyIndex - 1);
  }, [moveToStory, storyIndex]);

  /* ---------------------------------------------------------
     SYNC STORY GROUP
  --------------------------------------------------------- */

  useEffect(() => {
    if (!stories.length) return;

    setStoryIndex(safeInitialIndex);

    resetStoryState(stories[safeInitialIndex]);
  }, [groupKey, safeInitialIndex, resetStoryState]);

  /* ---------------------------------------------------------
     INITIAL MEDIA SOURCE
  --------------------------------------------------------- */

  useEffect(() => {
    if (!storyId) return;

    setMediaSrc(storyMediaUrl);
    setMediaError(false);
    setMediaFallbackTried(false);
  }, [storyId, storyMediaUrl]);

  /* ---------------------------------------------------------
     MEDIA ERROR FALLBACK
  --------------------------------------------------------- */

  const handleMediaError = useCallback(
    (event) => {
      const fallbackUrl = story?.mediaUrl;

      if (
        !mediaFallbackTried &&
        fallbackUrl &&
        mediaSrc !== fallbackUrl
      ) {
        setMediaFallbackTried(true);
        setMediaSrc(fallbackUrl);
        return;
      }

      setMediaError(true);
    },
    [story?.mediaUrl, mediaFallbackTried, mediaSrc]
  );

  /* ---------------------------------------------------------
     VIDEO PLAYBACK
  --------------------------------------------------------- */

  useEffect(() => {
    const video = videoRef.current;

    if (!video) return;

    if (flipped || document.hidden) {
      video.pause();
      return;
    }

    const playVideo = async () => {
      try {
        await video.play();
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.warn(
            "Story autoplay unavailable:",
            error
          );
        }
      }
    };

    void playVideo();

    return () => {
      video.pause();
    };
  }, [flipped, storyId, mediaSrc]);

  /* ---------------------------------------------------------
     STORY TIMER
  --------------------------------------------------------- */

  useEffect(() => {
    if (!storyId || flipped) {
      stopStoryTimer();
      return;
    }

    let lastTime = null;

    const startFrom =
      remainingMsRef.current > 0
        ? remainingMsRef.current
        : duration;

    let currentRemaining = startFrom;

    const tick = (now) => {
      if (document.hidden) {
        lastTime = null;

        timerAnimationRef.current =
          window.requestAnimationFrame(tick);

        return;
      }

      if (lastTime === null) {
        lastTime = now;
      }

      const elapsed = Math.max(0, now - lastTime);

      lastTime = now;

      currentRemaining = Math.max(
        0,
        currentRemaining - elapsed
      );

      remainingMsRef.current = currentRemaining;

      setRemainingMs(currentRemaining);

      if (currentRemaining <= 0) {
        timerAnimationRef.current = null;

        advanceStory();

        return;
      }

      timerAnimationRef.current =
        window.requestAnimationFrame(tick);
    };

    timerAnimationRef.current =
      window.requestAnimationFrame(tick);

    return () => {
      stopStoryTimer();
    };
  }, [
    storyId,
    flipped,
    duration,
    advanceStory,
    stopStoryTimer,
  ]);

  /* ---------------------------------------------------------
     VIDEO ENDED
  --------------------------------------------------------- */

  const handleVideoEnded = useCallback(() => {
    if (!flipped) {
      advanceStory();
    }
  }, [flipped, advanceStory]);

  /* ---------------------------------------------------------
     VISIBILITY CHANGE
  --------------------------------------------------------- */

  useEffect(() => {
    const handleVisibilityChange = () => {
      const video = videoRef.current;

      if (document.hidden) {
        video?.pause();
      } else if (!flipped && video) {
        video.play().catch(() => {});
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [flipped, storyId]);

  /* ---------------------------------------------------------
     LOAD STORY ENGAGEMENT AND COMMENTS
  --------------------------------------------------------- */

  useEffect(() => {
    if (!storyId) return;

    const controller = new AbortController();

    let cancelled = false;

    const loadStoryData = async () => {
      try {
        const [engagementResponse, commentsResponse] =
          await Promise.all([
            fetch(
              `/api/stories/${storyId}/engagement`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  action: "view",
                }),
                signal: controller.signal,
              }
            ),

            fetch(
              `/api/stories/${storyId}/comments`,
              {
                cache: "no-store",
                signal: controller.signal,
              }
            ),
          ]);

        if (
          cancelled ||
          activeStoryIdRef.current !== storyId
        ) {
          return;
        }

        if (engagementResponse.ok) {
          const data = await readResponse(
            engagementResponse
          );

          if (
            cancelled ||
            activeStoryIdRef.current !== storyId
          ) {
            return;
          }

          onStoryUpdateRef.current?.(
            storyId,
            data
          );

          if (data.lastHoursReward) {
            showRewardNotice({
              type: "reward",
              title: "Last Hours collected",
              points: data.lastHoursReward.points,
            });
          } else if (
            data.newlyAwardedAchievements?.length
          ) {
            showRewardNotice({
              type: "achievement",
              title:
                data.newlyAwardedAchievements[0].title,
              description:
                "Exploration achievement unlocked",
            });
          }
        }

        if (commentsResponse.ok) {
          const data = await readResponse(
            commentsResponse
          );

          if (
            cancelled ||
            activeStoryIdRef.current !== storyId
          ) {
            return;
          }

          setComments(
            Array.isArray(data.comments)
              ? data.comments
              : []
          );
        }
      } catch (error) {
        if (
          error?.name !== "AbortError" &&
          !cancelled
        ) {
          console.error(
            "Unable to load story interactions:",
            error
          );
        }
      }
    };

    void loadStoryData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [storyId, showRewardNotice]);

  /* ---------------------------------------------------------
     USER MENTION SEARCH
  --------------------------------------------------------- */

  useEffect(() => {
    const query = mentionQuery.trim();

    if (query.length < 2) {
      setMentionResults([]);
      return;
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!response.ok) {
          setMentionResults([]);
          return;
        }

        const data = await readResponse(response);

        if (!controller.signal.aborted) {
          setMentionResults(
            Array.isArray(data.users)
              ? data.users.slice(0, 5)
              : []
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          setMentionResults([]);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [mentionQuery]);

  /* ---------------------------------------------------------
     SHARE USER SEARCH
  --------------------------------------------------------- */

  useEffect(() => {
    const query = shareQuery.trim();

    if (query.length < 2) {
      setShareUsers([]);
      return;
    }

    const controller = new AbortController();

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );

        if (!response.ok) {
          setShareUsers([]);
          return;
        }

        const data = await readResponse(response);

        if (!controller.signal.aborted) {
          setShareUsers(
            Array.isArray(data.users)
              ? data.users.slice(0, 8)
              : []
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          setShareUsers([]);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [shareQuery]);

  /* ---------------------------------------------------------
     MODAL FOCUS AND BODY SCROLL
  --------------------------------------------------------- */

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    modalRef.current?.focus();

    return () => {
      document.body.style.overflow =
        previousOverflow;

      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === "function"
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, []);

  /* ---------------------------------------------------------
     KEYBOARD NAVIGATION AND FOCUS TRAP
  --------------------------------------------------------- */

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key === "Tab") {
        const modal = modalRef.current;

        if (!modal) return;

        const focusable = Array.from(
          modal.querySelectorAll(
            'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter(
          (element) =>
            element.offsetWidth > 0 ||
            element.offsetHeight > 0
        );

        if (!focusable.length) {
          event.preventDefault();
          modal.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (
          event.shiftKey &&
          document.activeElement === first
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last
        ) {
          event.preventDefault();
          first.focus();
        }

        return;
      }

      if (
        flipped ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveToStory(storyIndex + 1);
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveToStory(storyIndex - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [flipped, onClose, moveToStory, storyIndex]);

  /* ---------------------------------------------------------
     FINAL CLEANUP
  --------------------------------------------------------- */

  useEffect(() => {
    return () => {
      clearTapTimer();
      stopStoryTimer();

      if (likeTimerRef.current !== null) {
        window.clearTimeout(likeTimerRef.current);
      }

      if (rewardTimerRef.current !== null) {
        window.clearTimeout(rewardTimerRef.current);
      }
    };
  }, [clearTapTimer, stopStoryTimer]);

  /* ---------------------------------------------------------
     STORY PROGRESS
  --------------------------------------------------------- */

  const progress =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((duration - remainingMs) / duration) * 100
          )
        )
      : 0;

  /* ---------------------------------------------------------
     LIKE STORY
  --------------------------------------------------------- */

  const likeStory = useCallback(async () => {
    if (!storyId) return;

    const currentStoryId = storyId;

    setLikeBurst(true);
    setSocialMessage("");

    if (likeTimerRef.current !== null) {
      window.clearTimeout(likeTimerRef.current);
    }

    likeTimerRef.current = window.setTimeout(() => {
      setLikeBurst(false);
      likeTimerRef.current = null;
    }, 850);

    try {
      const response = await fetch(
        `/api/stories/${currentStoryId}/engagement`,
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

      const data = await readResponse(response);

      if (!response.ok) {
        throw new Error(
          data.error ||
            data.message ||
            "Unable to update story like"
        );
      }

      if (
        activeStoryIdRef.current !== currentStoryId
      ) {
        return;
      }

      onStoryUpdateRef.current?.(
        currentStoryId,
        data
      );
    } catch (error) {
      if (
        activeStoryIdRef.current === currentStoryId
      ) {
        setSocialMessage(
          error?.message ||
            "Unable to update story like"
        );
      }
    }
  }, [storyId]);

  /* ---------------------------------------------------------
     STORY TAP / DOUBLE TAP
  --------------------------------------------------------- */

  const handleStoryTap = useCallback(() => {
    if (flipped || !storyId) return;

    if (swipeHandledRef.current) {
      swipeHandledRef.current = false;
      return;
    }

    if (tapTimerRef.current !== null) {
      clearTapTimer();
      void likeStory();
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      advanceStory();
    }, 240);
  }, [
    flipped,
    storyId,
    clearTapTimer,
    likeStory,
    advanceStory,
  ]);

  const handleStoryKeyDown = useCallback(
    (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();
        handleStoryTap();
      }
    },
    [handleStoryTap]
  );

  /* ---------------------------------------------------------
     FLIP TO DETAILS
  --------------------------------------------------------- */

  const flipToDetails = useCallback(
    (event) => {
      event?.stopPropagation();

      clearTapTimer();

      setFlipped(true);
    },
    [clearTapTimer]
  );

  /* ---------------------------------------------------------
     RETURN TO STORY
  --------------------------------------------------------- */

  const returnToStory = useCallback(
    (event) => {
      event?.stopPropagation();

      setFlipped(false);
    },
    []
  );

  /* ---------------------------------------------------------
     SWIPE NAVIGATION
  --------------------------------------------------------- */

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === "mouse") return;

    touchStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };
  }, []);

  const handlePointerUp = useCallback(
    (event) => {
      const start = touchStartRef.current;

      touchStartRef.current = null;

      if (!start || flipped) return;

      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;

      if (
        Math.abs(dx) < 55 ||
        Math.abs(dx) < Math.abs(dy)
      ) {
        return;
      }

      clearTapTimer();

      swipeHandledRef.current = true;

      if (dx < 0) {
        moveToStory(storyIndex + 1);
      } else {
        moveToStory(storyIndex - 1);
      }
    },
    [
      flipped,
      clearTapTimer,
      moveToStory,
      storyIndex,
    ]
  );

  /* ---------------------------------------------------------
     COMMENT TEXT AND MENTIONS
  --------------------------------------------------------- */

  const updateCommentText = useCallback((value) => {
    setComment(value);

    const match = value.match(
      /(?:^|\s)@([a-zA-Z0-9_.]*)$/
    );

    setMentionQuery(match?.[1] || "");
  }, []);

  const selectMention = useCallback((name) => {
    setComment((current) =>
      current.replace(
        /@([a-zA-Z0-9_.]*)$/,
        `@${name} `
      )
    );

    setMentionQuery("");
    setMentionResults([]);
  }, []);

  /* ---------------------------------------------------------
     SUBMIT COMMENT
  --------------------------------------------------------- */

  const submitComment = useCallback(
    async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (commentBusy || !storyId) return;

      const text = comment.trim();

      if (!text) return;

      const currentStoryId = storyId;

      setCommentBusy(true);
      setSocialMessage("");

      try {
        const response = await fetch(
          `/api/stories/${currentStoryId}/comments`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              parentId: reply?._id || null,
            }),
          }
        );

        const data = await readResponse(response);

        if (!response.ok) {
          throw new Error(
            data.error ||
              data.message ||
              "Unable to add comment"
          );
        }

        if (
          activeStoryIdRef.current !== currentStoryId
        ) {
          return;
        }

        if (data.comment) {
          setComments((current) => {
            const exists = current.some(
              (item) =>
                item._id === data.comment._id
            );

            return exists
              ? current
              : [...current, data.comment];
          });
        }

        setComment("");
        setReply(null);
        setMentionQuery("");
        setMentionResults([]);

        setSocialMessage("Comment posted");

        onStoryUpdateRef.current?.(
          currentStoryId,
          {
            commentsCount:
              data.commentsCount ??
              Number(story?.commentsCount || 0) + 1,
          }
        );
      } catch (error) {
        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setSocialMessage(
            error?.message || "Unable to add comment"
          );
        }
      } finally {
        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setCommentBusy(false);
        }
      }
    },
    [
      commentBusy,
      comment,
      storyId,
      reply?._id,
      story?.commentsCount,
    ]
  );

  /* ---------------------------------------------------------
     LIKE COMMENT
  --------------------------------------------------------- */

  const likeComment = useCallback(
    async (item) => {
      if (!storyId || !item?._id) return;

      const currentStoryId = storyId;

      try {
        const response = await fetch(
          `/api/stories/${currentStoryId}/comments`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "like",
              commentId: item._id,
            }),
          }
        );

        const data = await readResponse(response);

        if (!response.ok) {
          throw new Error(
            data.error || "Unable to like comment"
          );
        }

        if (
          activeStoryIdRef.current !== currentStoryId
        ) {
          return;
        }

        if (data.comment) {
          setComments((current) =>
            current.map((entry) =>
              entry._id === item._id
                ? {
                    ...entry,
                    ...data.comment,
                  }
                : entry
            )
          );
        }
      } catch (error) {
        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setSocialMessage(
            error?.message || "Unable to like comment"
          );
        }
      }
    },
    [storyId]
  );

  /* ---------------------------------------------------------
     OPEN REPLY
  --------------------------------------------------------- */

  const openReply = useCallback((item) => {
    const replyUser = getUserName(item?.user);

    setReply(item);

    setComment(`@${replyUser} `);

    setMentionQuery("");

    setMentionResults([]);

    setDetailTab("comments");
  }, []);

  /* ---------------------------------------------------------
     STORY SHARE URL
  --------------------------------------------------------- */

  const createStoryShareUrl = useCallback(() => {
    if (typeof window === "undefined" || !storyId) {
      return "";
    }

    return `${window.location.origin}/stories-globe?story=${encodeURIComponent(
      storyId
    )}`;
  }, [storyId]);

  /* ---------------------------------------------------------
     SHARE COUNT UPDATE
  --------------------------------------------------------- */

  const incrementShareCount = useCallback(() => {
    if (!storyId) return;

    const currentStoryId = storyId;

    onStoryUpdateRef.current?.(currentStoryId, {
      sharesCount:
        Number(story?.sharesCount || story?.shares || 0) + 1,
    });
  }, [
    storyId,
    story?.sharesCount,
    story?.shares,
  ]);

  /* ---------------------------------------------------------
     SHARE TO USER
  --------------------------------------------------------- */

  const shareToUser = useCallback(
    async (recipient) => {
      if (
        !storyId ||
        !recipient?._id ||
        shareBusy
      ) {
        return;
      }

      const currentStoryId = storyId;

      setShareBusy(recipient._id);

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
          await readResponse(conversationResponse);

        const conversationId =
          conversationData.conversation?._id;

        if (
          !conversationResponse.ok ||
          !conversationId
        ) {
          throw new Error(
            conversationData.error ||
              conversationData.message ||
              "Unable to open conversation"
          );
        }

        const shareUrl = createStoryShareUrl();

        const messageResponse = await fetch(
          `/api/conversations/${encodeURIComponent(
            conversationId
          )}/messages`,
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

        const messageData = await readResponse(
          messageResponse
        );

        if (!messageResponse.ok) {
          throw new Error(
            messageData.error ||
              messageData.message ||
              "Unable to send story"
          );
        }

        if (
          activeStoryIdRef.current !== currentStoryId
        ) {
          return;
        }

        setShareQuery("");
        setShareUsers([]);

        setSocialMessage(
          `Story sent to @${recipient.username || "user"}`
        );

        incrementShareCount();
      } catch (error) {
        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setShareError(
            error?.message || "Unable to share story"
          );
        }
      } finally {
        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setShareBusy("");
        }
      }
    },
    [
      storyId,
      shareBusy,
      createStoryShareUrl,
      incrementShareCount,
    ]
  );

  /* ---------------------------------------------------------
     NATIVE SHARE
  --------------------------------------------------------- */

  const nativeShare = useCallback(async () => {
    if (!storyId) return;

    const currentStoryId = storyId;
    const shareUrl = createStoryShareUrl();

    if (!shareUrl) return;

    try {
      if (navigator.share) {
        await navigator.share({
          title: `Zenigram story by @${username}`,
          text: `View @${username}'s story on Zenigram`,
          url: shareUrl,
        });

        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          incrementShareCount();
        }

        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);

        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setSocialMessage(
            "Story link copied to clipboard"
          );
        }

        return;
      }

      setSocialMessage(
        "Sharing is not supported on this device"
      );
    } catch (error) {
      if (error?.name !== "AbortError") {
        if (
          activeStoryIdRef.current === currentStoryId
        ) {
          setSocialMessage(
            "Unable to share story link"
          );
        }
      }
    }
  }, [
    storyId,
    username,
    createStoryShareUrl,
    incrementShareCount,
  ]);

  /* ---------------------------------------------------------
     COPY STORY LINK
  --------------------------------------------------------- */

  const copyStoryLink = useCallback(async () => {
    if (!storyId) return;

    const currentStoryId = storyId;
    const shareUrl = createStoryShareUrl();

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard is not supported");
      }

      await navigator.clipboard.writeText(shareUrl);

      if (
        activeStoryIdRef.current === currentStoryId
      ) {
        setSocialMessage("Story link copied");
      }
    } catch {
      if (
        activeStoryIdRef.current === currentStoryId
      ) {
        setSocialMessage("Unable to copy story link");
      }
    }
  }, [storyId, createStoryShareUrl]);

  /* ---------------------------------------------------------
     START CONVERSATION
  --------------------------------------------------------- */

  const startConversation = useCallback(
    async (event) => {
      event.stopPropagation();

      const recipientId = getId(story?.userId);

      if (!recipientId) {
        setSocialMessage(
          "Unable to identify this user"
        );
        return;
      }

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
              eventId: story?.event?._id || null,
            }),
          }
        );

        const data = await readResponse(response);

        if (
          !response.ok ||
          !data.conversation?._id
        ) {
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
    [
      router,
      story?.userId,
      story?.event?._id,
    ]
  );

  /* ---------------------------------------------------------
     COMMENTS DATA
  --------------------------------------------------------- */

  const commentsThread = useMemo(
    () => flattenComments(comments),
    [comments]
  );

  const viewsCount =
    story?.viewsCount ?? story?.views ?? 0;

  const likesCount =
    story?.likesCount ?? story?.likes ?? 0;

  const commentsCount =
    story?.commentsCount ?? comments.length;

  const sharesCount =
    story?.sharesCount ?? story?.shares ?? 0;

  /* ---------------------------------------------------------
     EMPTY STATE
  --------------------------------------------------------- */

  if (!story) {
    return null;
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div
      ref={modalRef}
      tabIndex={-1}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 px-2 py-4 backdrop-blur-2xl sm:px-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Story by @${username}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      {/* =====================================================
         REWARD NOTIFICATION
      ===================================================== */}

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
            className="absolute left-1/2 top-4 z-[120] w-[min(90vw,380px)] -translate-x-1/2 rounded-2xl border border-red-400/20 bg-[#100708]/90 px-4 py-3 shadow-2xl shadow-red-950/30 backdrop-blur-xl"
          >
            <div className="flex items-start gap-2">
              {rewardNotice.type === "reward" ? (
                <IoSparkles className="shrink-0 text-lg text-yellow-300" />
              ) : (
                <IoCheckmarkCircle className="shrink-0 text-lg text-emerald-300" />
              )}

              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">
                  {rewardNotice.title}
                </p>

                {rewardNotice.points ? (
                  <p className="text-xs text-red-300">
                    +{rewardNotice.points} points
                  </p>
                ) : null}

                {rewardNotice.description ? (
                  <p className="text-xs text-white/65">
                    {rewardNotice.description}
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* =====================================================
         STORY CONTAINER
      ===================================================== */}

      <div className="relative h-[min(86dvh,780px)] w-[min(94vw,460px)] [perspective:1600px]">

        {/* ===================================================
           PROGRESS BARS
        =================================================== */}

        <div className="absolute -top-11 left-0 right-0 z-30">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.18em]">
            <span className="text-red-300/70">
              ZENIGRAM
            </span>

            <span className="text-white/45">
              {storyIndex + 1} / {stories.length}
            </span>
          </div>

          <div className="flex gap-1.5">
            {stories.map((item, index) => (
              <div
                key={item?._id || index}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-red-500 via-rose-400 to-red-300"
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

        {/* ===================================================
           STORY HEADER
        =================================================== */}

        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between gap-3">
          <Link
            href={`/profile/${encodeURIComponent(username)}`}
            className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/50 pr-3 backdrop-blur-md"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={
                story.userId?.profilePic ||
                "/user.svg"
              }
              alt=""
              width={34}
              height={34}
              unoptimized
              className="h-[34px] w-[34px] shrink-0 rounded-full border border-red-300/50 object-cover"
            />

            <span className="truncate text-sm font-semibold text-white">
              @{username}
            </span>

            <span className="hidden shrink-0 text-xs text-white/45 sm:inline">
              {formatStoryTime(story.createdAt)}
            </span>
          </Link>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 transition active:scale-90"
          >
            <IoClose className="text-lg" />
          </button>
        </div>

        {/* ===================================================
           FLIP CONTAINER
        =================================================== */}

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

          {/* =================================================
             STORY FRONT
          ================================================= */}

          <section
            className="absolute inset-0 overflow-hidden rounded-[26px] border border-red-400/15 bg-[#080507] shadow-2xl shadow-black [backface-visibility:hidden]"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              touchStartRef.current = null;
            }}
          >

            {/* MEDIA */}

            {mediaError ? (
              <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top,_rgba(239,68,68,.14),_transparent_42%),#080507] p-8 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-red-300/20 bg-red-300/10">
                    <IoSparkles className="text-2xl text-red-300" />
                  </div>

                  <h2 className="mt-4 text-base font-semibold text-white">
                    This story could not be displayed
                  </h2>

                  <p className="mt-1 text-xs text-white/45">
                    The media may have expired or is
                    temporarily unavailable.
                  </p>
                </div>
              </div>
            ) : story.mediaType === "video" ? (
              <video
                ref={videoRef}
                key={storyId}
                src={mediaSrc || storyMediaUrl}
                autoPlay
                muted
                playsInline
                preload="metadata"
                controls={false}
                onEnded={handleVideoEnded}
                onError={handleMediaError}
                className="h-full w-full object-contain"
              />
            ) : (
              <Image
                key={storyId}
                src={mediaSrc || storyMediaUrl}
                alt={story.caption || "Story media"}
                fill
                unoptimized
                sizes="(max-width: 640px) 94vw, 460px"
                priority
                onError={handleMediaError}
                className="object-contain"
              />
            )}

            {/* GRADIENT */}

            <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/90 via-transparent to-black/25" />

            {/* TOP BADGES */}

            <div className="absolute left-4 right-4 top-4 z-30 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 backdrop-blur-md">
                <IoShieldCheckmark className="text-xs" />
                Z+ Protected
              </span>

              {story.event?.name ? (
                <span className="max-w-[55%] truncate rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] text-white/65 backdrop-blur-md">
                  {story.event.name}
                </span>
              ) : null}
            </div>

            {/* STORY CONTENT */}

            <div className="absolute bottom-16 left-4 right-4 z-30 space-y-2">
              {story.location?.name ||
              story.locationName ? (
                <div className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur-md">
                  <span className="truncate">
                    {story.location?.name ||
                      story.locationName}
                  </span>
                </div>
              ) : null}

              {story.caption ? (
                <p className="max-w-[95%] rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm leading-5 text-white/90 backdrop-blur-md">
                  {story.caption}
                </p>
              ) : null}

              {socialMessage ? (
                <p className="max-w-[95%] rounded-xl border border-red-300/10 bg-red-300/5 px-3 py-2 text-[11px] text-red-100">
                  {socialMessage}
                </p>
              ) : null}
            </div>

            {/* LIKE ANIMATION */}

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
                  <IoHeart className="text-red-500 drop-shadow-[0_0_24px_rgba(239,68,68,.6)]" />
                </motion.div>
              )}
            </AnimatePresence>

            {/* DETAILS BUTTON */}

            <button
              type="button"
              onClick={flipToDetails}
              className="absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-red-200/15 bg-black/60 px-3 py-2 text-xs font-semibold text-red-200 backdrop-blur-md transition hover:bg-black/75 active:scale-90"
            >
              <IoSparkles className="text-sm" />
              Details
            </button>

            {/* HELP TEXT */}

            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[30] hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/50 backdrop-blur-sm sm:block">
              Tap to advance • Double-tap to like •
              Swipe to navigate
            </div>

            {/* TAP AREA */}

            <div
              role="button"
              tabIndex={0}
              aria-label="Advance story"
              onClick={handleStoryTap}
              onKeyDown={handleStoryKeyDown}
              className="absolute inset-0 z-[25] cursor-pointer outline-none"
            />
          </section>

          {/* =================================================
             STORY DETAILS BACK
          ================================================= */}

          <section
            className="absolute inset-0 flex flex-col overflow-hidden rounded-[26px] border border-red-400/20 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,.11),_transparent_34%),#0b080a] p-4 text-white shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
          >

            {/* GRID BACKGROUND */}

            <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(239,68,68,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,.08)_1px,transparent_1px)] [background-size:24px_24px]" />

            {/* DETAILS HEADER */}

            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[.22em] text-red-300/70">
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
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 active:scale-90"
                >
                  <IoPaperPlaneOutline className="text-lg" />
                </button>

                <button
                  type="button"
                  onClick={returnToStory}
                  aria-label="Return to story"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 active:scale-90"
                >
                  <IoClose className="text-lg" />
                </button>
              </div>
            </div>

            {/* TABS */}

            <div
              className="relative z-10 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs"
              role="tablist"
              aria-label="Story details tabs"
            >
              {["comments", "share", "activity"].map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === tab}
                    onClick={() => setDetailTab(tab)}
                    className={`rounded-lg px-3 py-2 font-semibold capitalize transition-all ${
                      detailTab === tab
                        ? "bg-red-500/20 text-red-200 shadow-[inset_0_0_0_1px_rgba(248,113,113,.15)]"
                        : "text-white/50 hover:bg-white/5 hover:text-white/75"
                    }`}
                  >
                    {tab}
                  </button>
                )
              )}
            </div>

            {/* =================================================
               TAB CONTENT
            ================================================= */}

            <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto pr-1">

              {/* =============================================
                 COMMENTS
              ============================================= */}

              {detailTab === "comments" && (
                <div className="space-y-3">

                  {/* COMMENT FORM */}

                  <form
                    onSubmit={submitComment}
                    className="relative rounded-2xl border border-white/10 bg-black/25 p-1"
                  >
                    {reply && (
                      <div className="mb-1 flex items-center justify-between rounded-xl bg-red-300/5 px-3 py-1.5 text-[10px] text-red-200">
                        <span>
                          Replying to @
                          {getUserName(reply.user)}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            setReply(null);
                            setComment("");
                          }}
                          aria-label="Cancel reply"
                        >
                          <IoClose />
                        </button>
                      </div>
                    )}

                    {/* MENTION RESULTS */}

                    {mentionResults.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#0d090b] shadow-2xl">
                        {mentionResults.map((user) => (
                          <button
                            key={user._id}
                            type="button"
                            onClick={() =>
                              selectMention(user.username)
                            }
                            className="block w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                          >
                            @{user.username}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <input
                        value={comment}
                        onChange={(event) =>
                          updateCommentText(
                            event.target.value
                          )
                        }
                        placeholder="Write something thoughtful…"
                        aria-label="Write a comment"
                        maxLength={500}
                        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-white/40 outline-none"
                      />

                      <button
                        type="submit"
                        disabled={
                          commentBusy ||
                          !comment.trim()
                        }
                        aria-label="Post comment"
                        className="shrink-0 rounded-full bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50 active:scale-90"
                      >
                        {commentBusy ? (
                          "…"
                        ) : (
                          <IoPaperPlaneOutline className="text-sm" />
                        )}
                      </button>
                    </div>
                  </form>

                  {/* COMMENT MESSAGE */}

                  {socialMessage && (
                    <p className="rounded-xl border border-red-300/10 bg-red-300/5 px-3 py-2 text-xs text-red-100">
                      {socialMessage}
                    </p>
                  )}

                  {/* COMMENT LIST */}

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
                            marginLeft: `${
                              Math.min(depth, 6) * 12
                            }px`,
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-red-200">
                                @{getUserName(item.user)}
                              </p>

                              <p className="mt-1 break-words text-xs text-white/80">
                                {item.text}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => likeComment(item)}
                              aria-label={
                                item.likedByMe
                                  ? "Unlike comment"
                                  : "Like comment"
                              }
                              className="shrink-0 rounded-full p-1 transition hover:bg-white/5 active:scale-90"
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

                          <div className="mt-2 flex items-center justify-between gap-3">
                            <p className="text-[9px] text-white/40">
                              {formatStoryTime(
                                item.createdAt
                              )}
                            </p>

                            <button
                              type="button"
                              onClick={() => openReply(item)}
                              className="text-[9px] text-red-300/70 hover:text-red-200"
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

              {/* =============================================
                 SHARE
              ============================================= */}

              {detailTab === "share" && (
                <div className="space-y-3">

                  {/* NATIVE SHARE */}

                  <button
                    type="button"
                    onClick={nativeShare}
                    className="flex w-full items-center gap-3 rounded-2xl border border-red-300/15 bg-red-300/5 p-3 text-left transition hover:bg-red-300/10 active:scale-[.99]"
                  >
                    <span className="text-2xl">
                      <IoShareOutline />
                    </span>

                    <span className="flex-1">
                      <p className="text-xs font-semibold text-white">
                        Share story
                      </p>

                      <p className="text-[10px] text-white/60">
                        Use your device share or copy the link
                      </p>
                    </span>

                    <IoArrowForward className="text-white/35" />
                  </button>

                  {/* COPY LINK */}

                  <button
                    type="button"
                    onClick={copyStoryLink}
                    className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[.025] p-3 text-left transition hover:bg-white/5 active:scale-[.99]"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-white/5">
                      <IoCopyOutline className="text-base" />
                    </span>

                    <span className="flex-1">
                      <p className="text-xs font-semibold text-white">
                        Copy link
                      </p>

                      <p className="text-[10px] text-white/60">
                        Copy this story’s direct Zenigram link
                      </p>
                    </span>
                  </button>

                  {/* SEND TO USER */}

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-white/65">
                      Send to a Zenigram user
                    </p>

                    <input
                      value={shareQuery}
                      onChange={(event) =>
                        setShareQuery(event.target.value)
                      }
                      placeholder="Enter username…"
                      aria-label="Search users to share with"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-red-300/30"
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
                            disabled={Boolean(shareBusy)}
                            className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 disabled:opacity-50 active:scale-[.98]"
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

                            <span className="flex-1 truncate">
                              @{user.username}
                            </span>

                            {shareBusy === user._id ? (
                              <span className="text-[10px] text-red-300">
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

                  {socialMessage && (
                    <p className="rounded-xl border border-red-300/10 bg-red-300/5 px-3 py-2 text-xs text-red-100">
                      {socialMessage}
                    </p>
                  )}
                </div>
              )}

              {/* =============================================
                 ACTIVITY
              ============================================= */}

              {detailTab === "activity" && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [IoEye, viewsCount, "Views"],
                    [IoHeart, likesCount, "Likes"],
                    [
                      IoChatbubbleOutline,
                      commentsCount,
                      "Comments",
                    ],
                    [
                      IoShareOutline,
                      sharesCount,
                      "Shares",
                    ],
                  ].map(([Icon, value, label]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-white/10 bg-white/[.025] p-4"
                    >
                      <Icon className="text-2xl text-red-200" />

                      <p className="mt-3 text-2xl font-bold">
                        {formatRelativeCount(value)}
                      </p>

                      <p className="text-[10px] text-white/50">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* =================================================
               DETAILS FOOTER
            ================================================= */}

            <div className="relative z-10 mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div className="min-w-0">
                <p className="text-[10px] text-white/30">
                  Stories expire in 24 hours
                </p>

                <p className="mt-0.5 text-[9px] text-white/20">
                  Use Z+ controls to keep your audience in control.
                </p>
              </div>

              <button
                type="button"
                onClick={returnToStory}
                aria-label="Return to story"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 active:scale-90"
              >
                <IoReturnDownBack className="text-lg" />
              </button>
            </div>
          </section>
        </motion.div>

        {/* ===================================================
           STORY NAVIGATION
        =================================================== */}

        {!flipped && (
          <>
            <button
              type="button"
              onClick={goToPreviousStory}
              disabled={storyIndex === 0}
              aria-label="Previous story"
              className="absolute left-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition hover:bg-black/80 disabled:opacity-30 active:scale-90"
            >
              <IoArrowBack className="text-lg" />
            </button>

            <button
              type="button"
              onClick={advanceStory}
              disabled={storyIndex === stories.length - 1}
              aria-label="Next story"
              className="absolute right-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition hover:bg-black/80 disabled:opacity-30 active:scale-90"
            >
              <IoArrowForward className="text-lg" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
