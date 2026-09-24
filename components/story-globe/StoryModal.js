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

function getDurationMs(story) {
  const seconds = Number(story?.duration);

  const safeSeconds = Number.isFinite(seconds)
    ? Math.min(Math.max(seconds, 5), 60)
    : 15;

  return safeSeconds * 1000;
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
  const count = Number(value || 0);

  if (count < 1000) {
    return String(count);
  }

  if (count < 1_000_000) {
    return `${(
      count / 1000
    ).toFixed(count < 10_000 ? 1 : 0)}K`;
  }

  if (count < 1_000_000_000) {
    return `${(
      count / 1_000_000
    ).toFixed(count < 10_000_000 ? 1 : 0)}M`;
  }

  return `${(count / 1_000_000_000).toFixed(1)}B`;
}

function flattenComments(comments = []) {
  const byParent = new Map();

  for (const item of comments) {
    const rawParentId = item?.parentId;

    const parentId =
      rawParentId && typeof rawParentId === "object"
        ? rawParentId._id
        : rawParentId;

    const key = String(parentId || "root");

    if (!byParent.has(key)) {
      byParent.set(key, []);
    }

    byParent.get(key).push(item);
  }

  const visit = (
    parentId,
    depth = 0,
    path = new Set()
  ) => {
    const result = [];

    const children =
      byParent.get(String(parentId || "root")) || [];

    for (const item of children) {
      const id = String(item?._id || "");

      if (!id || path.has(id)) {
        continue;
      }

      const nextPath = new Set(path);
      nextPath.add(id);

      result.push({
        comment: item,
        depth,
      });

      result.push(
        ...visit(id, depth + 1, nextPath)
      );
    }

    return result;
  };

  return visit("root");
}

function getUserName(user) {
  return (
    user?.username ||
    user?.name ||
    "Zenigram user"
  );
}

export default function StoryModal({
  storyGroup,
  initialIndex = 0,
  onClose,
  onStoryUpdate,
}) {
  const router = useRouter();

  const stories = useMemo(
    () =>
      Array.isArray(storyGroup?.stories)
        ? storyGroup.stories
        : [],
    [storyGroup]
  );

  const safeInitialIndex = useMemo(() => {
    if (!stories.length) {
      return 0;
    }

    return Math.min(
      Math.max(Number(initialIndex) || 0, 0),
      stories.length - 1
    );
  }, [initialIndex, stories.length]);

  const [storyIndex, setStoryIndex] = useState(
    safeInitialIndex
  );

  const [remainingMs, setRemainingMs] = useState(() =>
    getDurationMs(stories[safeInitialIndex])
  );

  const [flipped, setFlipped] = useState(false);

  const [detailTab, setDetailTab] =
    useState("comments");

  const [comments, setComments] = useState([]);

  const [comment, setComment] = useState("");

  const [reply, setReply] = useState(null);

  const [commentBusy, setCommentBusy] =
    useState(false);

  const [mentionQuery, setMentionQuery] =
    useState("");

  const [mentionResults, setMentionResults] =
    useState([]);

  const [shareQuery, setShareQuery] =
    useState("");

  const [shareUsers, setShareUsers] =
    useState([]);

  const [shareBusy, setShareBusy] = useState("");

  const [socialMessage, setSocialMessage] =
    useState("");

  const [shareError, setShareError] =
    useState("");

  const [likeBurst, setLikeBurst] =
    useState(false);

  const [rewardNotice, setRewardNotice] =
    useState(null);

  const [mediaError, setMediaError] =
    useState(false);

  const tapTimerRef = useRef(null);

  const likeTimerRef = useRef(null);

  const rewardTimerRef = useRef(null);

  const timerAnimationRef = useRef(null);

  const timerStartedAtRef = useRef(null);

  const touchStartRef = useRef(null);

  const swipeHandledRef = useRef(false);

  const videoRef = useRef(null);

  const story = stories[storyIndex];

  const username = getUserName(story?.userId);

  const duration = getDurationMs(story);

  const progress =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            ((duration - remainingMs) /
              duration) *
              100
          )
        )
      : 0;

  const clearTapTimer = useCallback(() => {
    if (!tapTimerRef.current) {
      return;
    }

    window.clearTimeout(tapTimerRef.current);

    tapTimerRef.current = null;
  }, []);

  const showRewardNotice = useCallback(
    (notice) => {
      if (rewardTimerRef.current) {
        window.clearTimeout(
          rewardTimerRef.current
        );
      }

      setRewardNotice(notice);

      rewardTimerRef.current =
        window.setTimeout(() => {
          setRewardNotice(null);
          rewardTimerRef.current = null;
        }, 3200);
    },
    []
  );

  const resetStoryState = useCallback(
    (nextStory) => {
      const nextDuration =
        getDurationMs(nextStory);

      setRemainingMs(nextDuration);

      setFlipped(false);

      setDetailTab("comments");

      setComments([]);

      setComment("");

      setReply(null);

      setMentionQuery("");

      setMentionResults([]);

      setShareQuery("");

      setShareUsers([]);

      setShareBusy("");

      setSocialMessage("");

      setShareError("");

      setLikeBurst(false);

      setMediaError(false);

      timerStartedAtRef.current = null;
    },
    []
  );

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

      const safeIndex = Math.max(
        0,
        nextIndex
      );

      clearTapTimer();

      timerStartedAtRef.current = null;

      setStoryIndex(safeIndex);

      resetStoryState(
        stories[safeIndex]
      );
    },
    [
      clearTapTimer,
      onClose,
      resetStoryState,
      stories,
    ]
  );

  useEffect(() => {
    if (!stories.length) {
      return;
    }

    setStoryIndex(safeInitialIndex);

    resetStoryState(
      stories[safeInitialIndex]
    );
  }, [
    resetStoryState,
    safeInitialIndex,
    stories,
  ]);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (flipped) {
      video.pause();
      return;
    }

    void video.play().catch(() => {});
  }, [flipped, story?._id]);

  useEffect(() => {
    if (!story?._id || flipped) {
      timerStartedAtRef.current = null;

      if (timerAnimationRef.current) {
        window.cancelAnimationFrame(
          timerAnimationRef.current
        );

        timerAnimationRef.current = null;
      }

      return undefined;
    }

    const startFrom =
      remainingMs > 0
        ? remainingMs
        : getDurationMs(story);

    timerStartedAtRef.current =
      performance.now();

    const tick = (now) => {
      const startedAt =
        timerStartedAtRef.current;

      if (startedAt === null) {
        return;
      }

      const elapsed =
        now - startedAt;

      const nextRemaining = Math.max(
        0,
        startFrom - elapsed
      );

      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        timerAnimationRef.current = null;

        moveToStory(
          storyIndex + 1
        );

        return;
      }

      timerAnimationRef.current =
        window.requestAnimationFrame(
          tick
        );
    };

    timerAnimationRef.current =
      window.requestAnimationFrame(tick);

    return () => {
      if (timerAnimationRef.current) {
        window.cancelAnimationFrame(
          timerAnimationRef.current
        );

        timerAnimationRef.current = null;
      }
    };
  }, [
    flipped,
    moveToStory,
    story?._id,
    storyIndex,
  ]);

  useEffect(() => {
    if (!story?._id) {
      return undefined;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const [
          engagementResponse,
          commentsResponse,
        ] = await Promise.all([
          fetch(
            `/api/stories/${story._id}/engagement`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                action: "view",
              }),
            }
          ),

          fetch(
            `/api/stories/${story._id}/comments`,
            {
              cache: "no-store",
            }
          ),
        ]);

        if (cancelled) {
          return;
        }

        if (engagementResponse.ok) {
          const data =
            await engagementResponse.json();

          onStoryUpdate?.(
            story._id,
            data
          );

          if (data.lastHoursReward) {
            showRewardNotice({
              type: "reward",
              title:
                "Last Hours collected",
              points:
                data.lastHoursReward
                  .points,
            });
          } else if (
            data.newlyAwardedAchievements
              ?.length
          ) {
            showRewardNotice({
              type: "achievement",
              title:
                data
                  .newlyAwardedAchievements[0]
                  .title,
              description:
                "Exploration achievement unlocked",
            });
          }
        }

        if (commentsResponse.ok) {
          const data =
            await commentsResponse.json();

          setComments(
            Array.isArray(
              data.comments
            )
              ? data.comments
              : []
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
  }, [
    onStoryUpdate,
    showRewardNotice,
    story?._id,
  ]);

  useEffect(() => {
    const query =
      mentionQuery.trim();

    if (query.length < 2) {
      setMentionResults([]);
      return undefined;
    }

    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        async () => {
          try {
            const response =
              await fetch(
                `/api/search/users?q=${encodeURIComponent(
                  query
                )}`,
                {
                  signal:
                    controller.signal,
                  cache: "no-store",
                }
              );

            if (!response.ok) {
              setMentionResults([]);
              return;
            }

            const data =
              await response.json();

            setMentionResults(
              Array.isArray(data.users)
                ? data.users.slice(
                    0,
                    5
                  )
                : []
            );
          } catch (error) {
            if (
              error?.name !==
              "AbortError"
            ) {
              setMentionResults(
                []
              );
            }
          }
        },
        220
      );

    return () => {
      window.clearTimeout(
        timeout
      );

      controller.abort();
    };
  }, [mentionQuery]);

  useEffect(() => {
    const query =
      shareQuery.trim();

    if (query.length < 2) {
      setShareUsers([]);
      return undefined;
    }

    const controller =
      new AbortController();

    const timeout =
      window.setTimeout(
        async () => {
          try {
            const response =
              await fetch(
                `/api/search/users?q=${encodeURIComponent(
                  query
                )}`,
                {
                  signal:
                    controller.signal,
                  cache: "no-store",
                }
              );

            if (!response.ok) {
              setShareUsers([]);
              return;
            }

            const data =
              await response.json();

            setShareUsers(
              Array.isArray(data.users)
                ? data.users.slice(
                    0,
                    8
                  )
                : []
            );
          } catch (error) {
            if (
              error?.name !==
              "AbortError"
            ) {
              setShareUsers([]);
            }
          }
        },
        220
      );

    return () => {
      window.clearTimeout(
        timeout
      );

      controller.abort();
    };
  }, [shareQuery]);

  useEffect(() => {
    if (
      typeof document ===
      "undefined"
    ) {
      return undefined;
    }

    const previousOverflow =
      document.body.style
        .overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (
      event
    ) => {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }

      if (flipped) {
        return;
      }

      if (
        event.key === "ArrowRight"
      ) {
        event.preventDefault();

        moveToStory(
          storyIndex + 1
        );
      }

      if (
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();

        moveToStory(
          storyIndex - 1
        );
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    flipped,
    moveToStory,
    onClose,
    storyIndex,
  ]);

  useEffect(() => {
    return () => {
      clearTapTimer();

      if (likeTimerRef.current) {
        window.clearTimeout(
          likeTimerRef.current
        );
      }

      if (rewardTimerRef.current) {
        window.clearTimeout(
          rewardTimerRef.current
        );
      }

      if (timerAnimationRef.current) {
        window.cancelAnimationFrame(
          timerAnimationRef.current
        );
      }
    };
  }, [clearTapTimer]);

  const likeStory = useCallback(
    async () => {
      if (!story?._id) {
        return;
      }

      setLikeBurst(true);

      if (likeTimerRef.current) {
        window.clearTimeout(
          likeTimerRef.current
        );
      }

      likeTimerRef.current =
        window.setTimeout(
          () =>
            setLikeBurst(false),
          850
        );

      try {
        const response =
          await fetch(
            `/api/stories/${story._id}/engagement`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                action: "like",
              }),
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
              data.message ||
              "Unable to update story like"
          );
        }

        onStoryUpdate?.(
          story._id,
          data
        );
      } catch (error) {
        setSocialMessage(
          error?.message ||
            "Unable to update story like"
        );
      }
    },
    [
      onStoryUpdate,
      story?._id,
    ]
  );

  const handleStoryTap =
    useCallback(() => {
      if (
        flipped ||
        !story?._id
      ) {
        return;
      }

      if (swipeHandledRef.current) {
        swipeHandledRef.current =
          false;

        return;
      }

      if (tapTimerRef.current) {
        window.clearTimeout(
          tapTimerRef.current
        );

        tapTimerRef.current =
          null;

        void likeStory();

        return;
      }

      tapTimerRef.current =
        window.setTimeout(() => {
          tapTimerRef.current =
            null;

          moveToStory(
            storyIndex + 1
          );
        }, 240);
    }, [
      flipped,
      likeStory,
      moveToStory,
      story?._id,
      storyIndex,
    ]);

  const handleStoryKeyDown =
    useCallback(
      (event) => {
        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "ArrowRight"
        ) {
          event.preventDefault();

          handleStoryTap();
        }
      },
      [handleStoryTap]
    );

  const flipToDetails =
    useCallback(
      (event) => {
        event.stopPropagation();

        clearTapTimer();

        setFlipped(true);

        timerStartedAtRef.current =
          null;
      },
      [clearTapTimer]
    );

  const returnToStory =
    useCallback(
      (event) => {
        event.stopPropagation();

        setFlipped(false);

        setRemainingMs(duration);

        timerStartedAtRef.current =
          null;
      },
      [duration]
    );

  const handlePointerDown =
    useCallback((event) => {
      touchStartRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
    }, []);

  const handlePointerUp =
    useCallback(
      (event) => {
        const start =
          touchStartRef.current;

        touchStartRef.current =
          null;

        if (!start || flipped) {
          return;
        }

        const dx =
          event.clientX -
          start.x;

        const dy =
          event.clientY -
          start.y;

        if (
          Math.abs(dx) < 55 ||
          Math.abs(dx) <
            Math.abs(dy)
        ) {
          return;
        }

        clearTapTimer();

        swipeHandledRef.current =
          true;

        if (dx < 0) {
          moveToStory(
            storyIndex + 1
          );
        } else {
          moveToStory(
            storyIndex - 1
          );
        }
      },
      [
        clearTapTimer,
        flipped,
        moveToStory,
        storyIndex,
      ]
    );

  const updateCommentText =
    useCallback((value) => {
      setComment(value);

      const match =
        value.match(
          /(?:^|\s)@([a-zA-Z0-9_.]*)$/
        );

      setMentionQuery(
        match?.[1] || ""
      );
    }, []);

  const selectMention =
    useCallback((name) => {
      setComment((current) =>
        current.replace(
          /@([a-zA-Z0-9_.]*)$/,
          `@${name} `
        )
      );

      setMentionQuery("");

      setMentionResults([]);
    }, []);

  const submitComment =
    useCallback(
      async (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (
          commentBusy ||
          !story?._id
        ) {
          return;
        }

        const text =
          comment.trim();

        if (!text) {
          return;
        }

        setCommentBusy(true);

        setSocialMessage("");

        try {
          const response =
            await fetch(
              `/api/stories/${story._id}/comments`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(
                  {
                    text,
                    parentId:
                      reply?._id ||
                      null,
                  }
                ),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                data.message ||
                "Unable to add comment"
            );
          }

          if (data.comment) {
            setComments(
              (current) => [
                ...current,
                data.comment,
              ]
            );
          }

          setComment("");

          setReply(null);

          setMentionQuery("");

          setMentionResults([]);

          setSocialMessage(
            "Comment posted"
          );

          onStoryUpdate?.(
            story._id,
            {
              commentsCount:
                data.commentsCount ??
                Number(
                  story.commentsCount ||
                    0
                ) + 1,
            }
          );
        } catch (error) {
          setSocialMessage(
            error?.message ||
              "Unable to add comment"
          );
        } finally {
          setCommentBusy(false);
        }
      },
      [
        comment,
        commentBusy,
        onStoryUpdate,
        reply?._id,
        story?._id,
        story?.commentsCount,
      ]
    );

  const likeComment =
    useCallback(
      async (item) => {
        if (
          !story?._id ||
          !item?._id
        ) {
          return;
        }

        try {
          const response =
            await fetch(
              `/api/stories/${story._id}/comments`,
              {
                method: "PATCH",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(
                  {
                    action: "like",
                    commentId:
                      item._id,
                  }
                ),
              }
            );

          const data =
            await response.json();

          if (!response.ok) {
            throw new Error(
              data.error ||
                "Unable to like comment"
            );
          }

          if (data.comment) {
            setComments(
              (current) =>
                current.map(
                  (entry) =>
                    entry._id ===
                    item._id
                      ? {
                          ...entry,
                          ...data.comment,
                        }
                      : entry
                )
            );
          }
        } catch (error) {
          setSocialMessage(
            error?.message ||
              "Unable to like comment"
          );
        }
      },
      [story?._id]
    );

  const openReply =
    useCallback((item) => {
      const replyUser =
        getUserName(item?.user);

      setReply(item);

      setComment(
        `@${replyUser} `
      );

      setDetailTab("comments");
    }, []);

  const createStoryShareUrl =
    useCallback(
      () =>
        `${window.location.origin}/stories-globe?story=${encodeURIComponent(
          story?._id || ""
        )}`,
      [story?._id]
    );

  const shareToUser =
    useCallback(
      async (recipient) => {
        if (
          !story?._id ||
          !recipient?._id ||
          shareBusy
        ) {
          return;
        }

        setShareBusy(
          recipient._id
        );

        setShareError("");

        setSocialMessage("");

        try {
          const conversationResponse =
            await fetch(
              "/api/conversations",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(
                  {
                    recipientId:
                      recipient._id,
                  }
                ),
              }
            );

          const conversationData =
            await conversationResponse.json();

          if (
            !conversationResponse.ok ||
            !conversationData
              .conversation?._id
          ) {
            throw new Error(
              conversationData.error ||
                conversationData.message ||
                "Unable to open conversation"
            );
          }

          const shareUrl =
            createStoryShareUrl();

          const messageResponse =
            await fetch(
              `/api/conversations/${conversationData.conversation._id}/messages`,
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(
                  {
                    content:
                      shareUrl,
                  }
                ),
              }
            );

          const messageData =
            await messageResponse.json();

          if (
            !messageResponse.ok
          ) {
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

          onStoryUpdate?.(
            story._id,
            {
              sharesCount:
                Number(
                  story.sharesCount ||
                    story.shares ||
                    0
                ) + 1,
            }
          );
        } catch (error) {
          setShareError(
            error?.message ||
              "Unable to share story"
          );
        } finally {
          setShareBusy("");
        }
      },
      [
        createStoryShareUrl,
        onStoryUpdate,
        shareBusy,
        story?._id,
        story?.shares,
        story?.sharesCount,
      ]
    );

  const nativeShare =
    useCallback(async () => {
      if (!story?._id) {
        return;
      }

      const shareUrl =
        createStoryShareUrl();

      try {
        if (navigator.share) {
          await navigator.share({
            title: `Zenigram story by @${username}`,
            text: `View @${username}'s story on Zenigram`,
            url: shareUrl,
          });

          onStoryUpdate?.(
            story._id,
            {
              sharesCount:
                Number(
                  story.sharesCount ||
                    story.shares ||
                    0
                ) + 1,
            }
          );

          return;
        }

        if (
          navigator.clipboard
            ?.writeText
        ) {
          await navigator.clipboard.writeText(
            shareUrl
          );

          setSocialMessage(
            "Story link copied to clipboard"
          );

          onStoryUpdate?.(
            story._id,
            {
              sharesCount:
                Number(
                  story.sharesCount ||
                    story.shares ||
                    0
                ) + 1,
            }
          );

          return;
        }

        setSocialMessage(
          "Sharing is not supported on this device"
        );
      } catch (error) {
        if (
          error?.name !==
          "AbortError"
        ) {
          setSocialMessage(
            "Unable to share story link"
          );
        }
      }
    }, [
      createStoryShareUrl,
      onStoryUpdate,
      story?._id,
      story?.shares,
      story?.sharesCount,
      username,
    ]);

  const copyStoryLink =
    useCallback(async () => {
      if (!story?._id) {
        return;
      }

      const shareUrl =
        createStoryShareUrl();

      try {
        if (
          !navigator.clipboard
            ?.writeText
        ) {
          throw new Error(
            "Clipboard is not supported"
          );
        }

        await navigator.clipboard.writeText(
          shareUrl
        );

        setSocialMessage(
          "Story link copied"
        );
      } catch {
        setSocialMessage(
          "Unable to copy story link"
        );
      }
    }, [
      createStoryShareUrl,
      story?._id,
    ]);

  const startConversation =
    useCallback(
      async (event) => {
        event.stopPropagation();

        const recipientId =
          story?.userId?._id;

        if (!recipientId) {
          return;
        }

        try {
          const response =
            await fetch(
              "/api/conversations",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify(
                  {
                    recipientId,
                    eventId:
                      story?.event?._id,
                  }
                ),
              }
            );

          const data =
            await response.json();

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
        story?.event?._id,
        story?.userId?._id,
      ]
    );

  if (!story) {
    return null;
  }

  const commentsThread =
    flattenComments(comments);

  const viewsCount =
    story.viewsCount ??
    story.views ??
    0;

  const likesCount =
    story.likesCount ??
    story.likes ??
    0;

  const commentsCount =
    story.commentsCount ??
    comments.length;

  const sharesCount =
    story.sharesCount ??
    story.shares ??
    0;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/95 px-2 py-4 backdrop-blur-2xl sm:px-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Story by @${username}`}
      onClick={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose?.();
        }
      }}
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
            className="absolute left-1/2 top-4 z-[120] w-[min(90vw,380px)] -translate-x-1/2 rounded-2xl border border-red-400/20 bg-[#100708]/90 px-4 py-3 shadow-2xl shadow-red-950/30 backdrop-blur-xl"
          >
            <div className="flex items-start gap-2">
              {rewardNotice.type ===
              "reward" ? (
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
                    +{rewardNotice.points}{" "}
                    points
                  </p>
                ) : null}

                {rewardNotice.description ? (
                  <p className="text-xs text-white/65">
                    {
                      rewardNotice.description
                    }
                  </p>
                ) : null}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative h-[min(86dvh,780px)] w-[min(94vw,460px)] [perspective:1600px]">
        {/* Progress bars */}
        <div className="absolute -top-11 left-0 right-0 z-30">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[.18em]">
            <span className="text-red-300/70">
              ZENIGRAM
            </span>

            <span className="text-white/45">
              {storyIndex + 1} /{" "}
              {stories.length}
            </span>
          </div>

          <div className="flex gap-1.5">
            {stories.map(
              (item, index) => (
                <div
                  key={
                    item?._id ||
                    index
                  }
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 via-rose-400 to-red-300 transition-[width]"
                    style={{
                      width: `${
                        index <
                        storyIndex
                          ? 100
                          : index ===
                              storyIndex
                            ? progress
                            : 0
                      }%`,
                    }}
                  />
                </div>
              )
            )}
          </div>
        </div>

        {/* Header */}
        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between gap-3">
          <Link
            href={`/profile/${encodeURIComponent(
              username
            )}`}
            className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/50 pr-3 backdrop-blur-md"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <Image
              src={
                story.userId
                  ?.profilePic ||
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
              {formatStoryTime(
                story.createdAt
              )}
            </span>
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 transition active:scale-90"
          >
            <IoClose className="text-lg" />
          </button>
        </div>

        {/* Flip container */}
        <motion.div
          animate={{
            rotateY: flipped
              ? 180
              : 0,
          }}
          transition={{
            duration: 0.52,
            ease: "easeInOut",
          }}
          className="relative h-full w-full [transform-style:preserve-3d]"
        >
          {/* STORY FRONT */}
          <section
            className="absolute inset-0 overflow-hidden rounded-[26px] border border-red-400/15 bg-[#080507] shadow-2xl shadow-black [backface-visibility:hidden]"
            onPointerDown={
              handlePointerDown
            }
            onPointerUp={
              handlePointerUp
            }
          >
            {/* Media */}
            {mediaError ? (
              <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top,_rgba(239,68,68,.14),_transparent_42%),#080507] p-8 text-center">
                <div>
                  <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-red-300/20 bg-red-300/10">
                    <IoSparkles className="text-2xl text-red-300" />
                  </div>

                  <h2 className="mt-4 text-base font-semibold text-white">
                    This story could not
                    be displayed
                  </h2>

                  <p className="mt-1 text-xs text-white/45">
                    The media may have
                    expired or is
                    temporarily unavailable.
                  </p>
                </div>
              </div>
            ) : story.mediaType ===
              "video" ? (
              <video
                ref={videoRef}
                key={story._id}
                src={story.mediaUrl}
                autoPlay
                muted
                playsInline
                onError={() =>
                  setMediaError(
                    true
                  )
                }
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
                onError={() =>
                  setMediaError(
                    true
                  )
                }
                className="object-contain"
              />
            )}

            {/* Gradient overlay */}
            <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/90 via-transparent to-black/25" />

            {/* Top badges */}
            <div className="absolute left-4 right-4 top-4 z-30 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-black/45 px-2.5 py-1 text-[10px] font-semibold text-emerald-300 backdrop-blur-md">
                <IoShieldCheckmark className="text-xs" />
                Z+ Protected
              </span>

              {story?.event?.name ? (
                <span className="max-w-[55%] truncate rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] text-white/65 backdrop-blur-md">
                  {story.event.name}
                </span>
              ) : null}
            </div>

            {/* Story content */}
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

            {/* Like animation */}
            <AnimatePresence>
              {likeBurst && (
                <motion.div
                  initial={{
                    opacity: 0,
                    scale: 0.3,
                  }}
                  animate={{
                    opacity: [
                      0,
                      1,
                      1,
                      0,
                    ],
                    scale: [
                      0.3,
                      1.15,
                      1.35,
                      1.8,
                    ],
                    y: [
                      0,
                      -4,
                      -8,
                      -24,
                    ],
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

            {/* Details */}
            <button
              type="button"
              onClick={
                flipToDetails
              }
              className="absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-red-200/15 bg-black/60 px-3 py-2 text-xs font-semibold text-red-200 backdrop-blur-md transition hover:bg-black/75 active:scale-90"
            >
              <IoSparkles className="text-sm" />
              Details
            </button>

            {/* Help text */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[30] hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/50 backdrop-blur-sm sm:block">
              Tap to advance • Double-tap
              to like • Swipe to navigate
            </div>

            {/* Tap area */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Advance story"
              onClick={
                handleStoryTap
              }
              onKeyDown={
                handleStoryKeyDown
              }
              className="absolute inset-0 z-[25] cursor-pointer outline-none"
            />
          </section>

          {/* DETAILS BACK */}
          <section className="absolute inset-0 flex flex-col overflow-hidden rounded-[26px] border border-red-400/20 bg-[radial-gradient(circle_at_top,_rgba(239,68,68,.11),_transparent_34%),#0b080a] p-4 text-white shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            {/* Grid background */}
            <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(239,68,68,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(239,68,68,.08)_1px,transparent_1px)] [background-size:24px_24px]" />

            {/* Details header */}
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
                  onClick={
                    startConversation
                  }
                  aria-label={`Message @${username}`}
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 active:scale-90"
                >
                  <IoPaperPlaneOutline className="text-lg" />
                </button>

                <button
                  type="button"
                  onClick={
                    returnToStory
                  }
                  aria-label="Return to story"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 active:scale-90"
                >
                  <IoClose className="text-lg" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div
              className="relative z-10 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs"
              role="tablist"
              aria-label="Story details tabs"
            >
              {[
                "comments",
                "share",
                "activity",
              ].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={
                    detailTab ===
                    tab
                  }
                  onClick={() =>
                    setDetailTab(
                      tab
                    )
                  }
                  className={`rounded-lg px-3 py-2 font-semibold capitalize transition-all ${
                    detailTab ===
                    tab
                      ? "bg-red-500/20 text-red-200 shadow-[inset_0_0_0_1px_rgba(248,113,113,.15)]"
                      : "text-white/50 hover:bg-white/5 hover:text-white/75"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {/* COMMENTS */}
              {detailTab ===
                "comments" && (
                <div className="space-y-3">
                  <form
                    onSubmit={
                      submitComment
                    }
                    className="relative rounded-2xl border border-white/10 bg-black/25 p-1"
                  >
                    {reply && (
                      <div className="mb-1 flex items-center justify-between rounded-xl bg-red-300/5 px-3 py-1.5 text-[10px] text-red-200">
                        <span>
                          Replying to @
                          {getUserName(
                            reply.user
                          )}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setReply(
                              null
                            )
                          }
                          aria-label="Cancel reply"
                        >
                          <IoClose />
                        </button>
                      </div>
                    )}

                    {mentionResults.length >
                      0 && (
                      <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#0d090b] shadow-2xl">
                        {mentionResults.map(
                          (
                            user
                          ) => (
                            <button
                              key={
                                user._id
                              }
                              type="button"
                              onClick={() =>
                                selectMention(
                                  user.username
                                )
                              }
                              className="block w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5"
                            >
                              @
                              {
                                user.username
                              }
                            </button>
                          )
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <input
                        value={
                          comment
                        }
                        onChange={(
                          event
                        ) =>
                          updateCommentText(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder="Write something thoughtful…"
                        aria-label="Write a comment"
                        maxLength={
                          500
                        }
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

                  {socialMessage && (
                    <p className="rounded-xl border border-red-300/10 bg-red-300/5 px-3 py-2 text-xs text-red-100">
                      {socialMessage}
                    </p>
                  )}

                  {commentsThread.length ===
                  0 ? (
                    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
                      <IoChatbubbleOutline className="mx-auto text-2xl text-white/20" />

                      <p className="mt-2 text-xs text-white/40">
                        No comments yet.
                        Be the first!
                      </p>
                    </div>
                  ) : (
                    commentsThread.map(
                      ({
                        comment: item,
                        depth,
                      }) => (
                        <div
                          key={
                            item._id
                          }
                          style={{
                            marginLeft: `${
                              Math.min(
                                depth,
                                6
                              ) * 12
                            }px`,
                          }}
                          className="rounded-2xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-red-200">
                                @
                                {getUserName(
                                  item.user
                                )}
                              </p>

                              <p className="mt-1 break-words text-xs text-white/80">
                                {
                                  item.text
                                }
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                likeComment(
                                  item
                                )
                              }
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
                              onClick={() =>
                                openReply(
                                  item
                                )
                              }
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

              {/* SHARE */}
              {detailTab ===
                "share" && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={
                      nativeShare
                    }
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
                        Use your device
                        share or copy
                        the link
                      </p>
                    </span>

                    <IoArrowForward className="text-white/35" />
                  </button>

                  <button
                    type="button"
                    onClick={
                      copyStoryLink
                    }
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
                        Copy this story’s
                        direct
                        Zenigram link
                      </p>
                    </span>
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                    <p className="mb-2 text-xs font-semibold text-white/65">
                      Send to a Zenigram
                      user
                    </p>

                    <input
                      value={
                        shareQuery
                      }
                      onChange={(
                        event
                      ) =>
                        setShareQuery(
                          event.target
                            .value
                        )
                      }
                      placeholder="Enter username…"
                      aria-label="Search users to share with"
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-white/40 outline-none focus:border-red-300/30"
                    />

                    {shareUsers.length >
                      0 && (
                      <div className="mt-2 space-y-1">
                        {shareUsers.map(
                          (
                            user
                          ) => (
                            <button
                              key={
                                user._id
                              }
                              type="button"
                              onClick={() =>
                                shareToUser(
                                  user
                                )
                              }
                              disabled={Boolean(
                                shareBusy
                              )}
                              className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-white transition hover:bg-white/10 disabled:opacity-50 active:scale-[.98]"
                            >
                              <Image
                                src={
                                  user.profilePic ||
                                  "/user.svg"
                                }
                                alt=""
                                width={
                                  24
                                }
                                height={
                                  24
                                }
                                unoptimized
                                className="h-6 w-6 rounded-full object-cover"
                              />

                              <span className="flex-1 truncate">
                                @
                                {
                                  user.username
                                }
                              </span>

                              {shareBusy ===
                              user._id ? (
                                <span className="text-[10px] text-red-300">
                                  Sending…
                                </span>
                              ) : (
                                <IoArrowForward className="shrink-0 text-white/40" />
                              )}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {shareError && (
                      <p className="mt-2 rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-200">
                        {
                          shareError
                        }
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

              {/* ACTIVITY */}
              {detailTab ===
                "activity" && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    [
                      IoEye,
                      viewsCount,
                      "Views",
                    ],
                    [
                      IoHeart,
                      likesCount,
                      "Likes",
                    ],
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
                  ].map(
                    ([
                      Icon,
                      value,
                      label,
                    ]) => (
                      <div
                        key={
                          label
                        }
                        className="rounded-2xl border border-white/10 bg-white/[.025] p-4"
                      >
                        <Icon className="text-2xl text-red-200" />

                        <p className="mt-3 text-2xl font-bold">
                          {formatRelativeCount(
                            value
                          )}
                        </p>

                        <p className="text-[10px] text-white/50">
                          {
                            label
                          }
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="relative z-10 mt-3 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
              <div className="min-w-0">
                <p className="text-[10px] text-white/30">
                  Stories expire in
                  24 hours
                </p>

                <p className="mt-0.5 text-[9px] text-white/20">
                  Use Z+ controls to keep
                  your audience in control.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  returnToStory
                }
                aria-label="Return to story"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:bg-white/10 active:scale-90"
              >
                <IoReturnDownBack className="text-lg" />
              </button>
            </div>
          </section>
        </motion.div>

        {/* STORY NAVIGATION */}
        {!flipped && (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();

                moveToStory(
                  storyIndex - 1
                );
              }}
              disabled={
                storyIndex === 0
              }
              aria-label="Previous story"
              className="absolute left-2 top-1/2 z-40 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 backdrop-blur-md transition hover:bg-black/80 disabled:opacity-30 active:scale-90"
            >
              <IoArrowBack className="text-lg" />
            </button>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();

                moveToStory(
                  storyIndex + 1
                );
              }}
              disabled={
                storyIndex ===
                stories.length - 1
              }
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
