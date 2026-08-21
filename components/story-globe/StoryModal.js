"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IoArrowBack,
  IoArrowForward,
  IoChatbubbleOutline,
  IoClose,
  IoEye,
  IoFlash,
  IoHeart,
  IoPeopleOutline,
  IoRibbon,
  IoSend,
  IoShieldCheckmark,
} from "react-icons/io5";

function getDurationMs(story) {
  const seconds = Number(story?.duration);
  return (Number.isFinite(seconds) ? Math.min(Math.max(seconds, 5), 60) : 15) * 1000;
}

function formatStoryTime(value) {
  if (!value) return "Just now";

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function threadComments(comments) {
  const ids = new Set(comments.map((comment) => String(comment._id)));
  const roots = comments.filter((comment) => !comment.parentId || !ids.has(String(comment.parentId)));
  const descend = (comment, seen = new Set()) => {
    const id = String(comment._id);
    if (seen.has(id)) return [];
    const nextSeen = new Set(seen).add(id);
    return [comment, ...comments.filter((reply) => String(reply.parentId) === id).flatMap((reply) => descend(reply, nextSeen))];
  };
  return roots.flatMap((comment) => descend(comment));
}

export default function StoryModal({
  storyGroup,
  initialIndex = 0,
  onClose,
  onStoryUpdate,
}) {
  const router = useRouter();
  const stories = useMemo(() => storyGroup?.stories || [], [storyGroup]);
  const safeInitialIndex = Math.min(
    initialIndex,
    Math.max(stories.length - 1, 0),
  );
  const [storyIndex, setStoryIndex] = useState(safeInitialIndex);
  const [remainingMs, setRemainingMs] = useState(() =>
    getDurationMs(stories[safeInitialIndex]),
  );
  const [flipped, setFlipped] = useState(false);
  const [likeBurst, setLikeBurst] = useState(false);
  const [detailTab, setDetailTab] = useState("activity");
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [replyToComment, setReplyToComment] = useState(null);
  const [commentMentionQuery, setCommentMentionQuery] = useState("");
  const [commentMentionResults, setCommentMentionResults] = useState([]);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteResults, setInviteResults] = useState([]);
  const [socialMessage, setSocialMessage] = useState("");
  const [rewardNotice, setRewardNotice] = useState(null);
  const tapTimerRef = useRef(null);
  const rewardTimerRef = useRef(null);

  const story = stories[storyIndex];
  const username = story?.userId?.username || "Linkex user";
  const durationMs = getDurationMs(story);
  const progress = Math.min(
    100,
    Math.max(0, ((durationMs - remainingMs) / durationMs) * 100),
  );

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

  const moveToStory = useCallback(
    (nextIndex) => {
      if (!stories.length) return;

      if (nextIndex >= stories.length) {
        onClose();
        return;
      }

      const safeIndex = Math.max(0, nextIndex);
      setStoryIndex(safeIndex);
      setRemainingMs(getDurationMs(stories[safeIndex]));
      setFlipped(false);
      setDetailTab("activity");
      setLikeBurst(false);
      setSocialMessage("");
    },
    [onClose, stories],
  );

  useEffect(() => {
    if (!story || flipped) return undefined;

    const interval = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - 100));
    }, 100);
    const timeout = window.setTimeout(
      () => moveToStory(storyIndex + 1),
      remainingMs,
    );

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [flipped, moveToStory, remainingMs, story, storyIndex]);

  useEffect(() => {
    if (!story?._id) return;

    const recordView = async () => {
      try {
        const response = await fetch(`/api/stories/${story._id}/engagement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "view" }),
        });
        if (!response.ok) return;
        const data = await response.json();
        onStoryUpdate(story._id, data);

        if (data.lastHoursReward) {
          showRewardNotice({
            type: "last-hours",
            title: "Last hours collected",
            points: data.lastHoursReward.points,
            totalPoints: data.lastHoursReward.totalPoints,
            goal: data.lastHoursReward.goal,
          });
        } else if (data.newlyAwardedAchievements?.length) {
          showRewardNotice({
            type: "achievement",
            title: data.newlyAwardedAchievements[0].title,
            description: "Exploration achievement unlocked",
          });
        }
      } catch (error) {
        console.error("Unable to record story view:", error);
      }
    };

    const loadComments = async () => {
      try {
        const response = await fetch(`/api/stories/${story._id}/comments`);
        if (!response.ok) return;
        const data = await response.json();
        setComments(Array.isArray(data.comments) ? data.comments : []);
      } catch (error) {
        console.error("Unable to load story comments:", error);
      }
    };

    recordView();
    loadComments();
  }, [onStoryUpdate, showRewardNotice, story?._id]);

  useEffect(() => {
    const query = inviteQuery.trim();
    if (query.length < 2) {
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
        );
        const data = await response.json();
        setInviteResults(Array.isArray(data.users) ? data.users : []);
      } catch {
        setInviteResults([]);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [inviteQuery]);

  useEffect(() => {
    if (!commentMentionQuery) {
      setCommentMentionResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(commentMentionQuery)}`, { signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        setCommentMentionResults(Array.isArray(data?.users) ? data.users.slice(0, 5) : []);
      } catch (error) {
        if (error.name !== "AbortError") setCommentMentionResults([]);
      }
    }, 220);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [commentMentionQuery]);

  useEffect(
    () => () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current);
    },
    [],
  );

  const toggleLike = async () => {
    if (!story?._id) return;

    setLikeBurst(true);
    window.setTimeout(() => setLikeBurst(false), 650);

    try {
      const response = await fetch(`/api/stories/${story._id}/engagement`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "like" }),
      });
      if (!response.ok) return;
      onStoryUpdate(story._id, await response.json());
    } catch (error) {
      console.error("Unable to like story:", error);
    }
  };

  const handleStoryTap = () => {
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      toggleLike();
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      setFlipped((current) => !current);
      tapTimerRef.current = null;
    }, 240);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = commentText.trim();
    if (!text) return;

    const response = await fetch(`/api/stories/${story._id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, parentId: replyToComment?._id || null }),
    });
    const data = await response.json();

    if (!response.ok) {
      setSocialMessage(data.error || "Unable to add comment");
      return;
    }

    setComments((current) => [data.comment, ...current]);
    setCommentText("");
    setReplyToComment(null);
  };

  const updateCommentText = (value) => {
    setCommentText(value);
    const match = value.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/);
    setCommentMentionQuery(match?.[1] || "");
  };

  const selectCommentMention = (username) => {
    setCommentText((current) => current.replace(/@([a-zA-Z0-9_.]*)$/, `@${username} `));
    setCommentMentionQuery("");
    setCommentMentionResults([]);
  };

  const likeComment = async (comment) => {
    const response = await fetch(`/api/stories/${story._id}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like", commentId: comment._id }) });
    const data = await response.json();
    if (!response.ok) { setSocialMessage(data.message || "Unable to like comment"); return; }
    setComments((current) => current.map((item) => item._id === comment._id ? { ...item, ...data.comment } : item));
  };

  const startConversation = async (event) => {
    event.stopPropagation();
    const recipientId = story.userId?._id;
    if (!recipientId) return;

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
      setSocialMessage(data.error || "Unable to start conversation");
      return;
    }

    router.push(`/messages?conversation=${data.conversation._id}`);
  };

  const sendInvitation = async (recipientId) => {
    if (!story.event?._id) return;

    const response = await fetch("/api/event-invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: story.event._id,
        recipientId,
      }),
    });
    const data = await response.json();
    setSocialMessage(
      response.ok ? "Invitation sent" : data.error || "Unable to invite user",
    );
  };

  const createdLabel = useMemo(
    () => formatStoryTime(story?.createdAt),
    [story?.createdAt],
  );

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 px-3 py-4 backdrop-blur-md">
      {rewardNotice && (
        <div className="absolute left-1/2 top-6 z-60 w-[min(92vw,360px)] -translate-x-1/2 border border-yellow-300/45 bg-[#081018]/95 p-4 text-white shadow-[0_0_32px_rgba(250,204,21,.25)]">
          <div className="flex items-start gap-3">
            {rewardNotice.type === "last-hours" ? (
              <IoFlash className="mt-0.5 text-2xl text-yellow-300" />
            ) : (
              <IoRibbon className="mt-0.5 text-2xl text-yellow-300" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-yellow-100">
                {rewardNotice.title}
              </p>
              {rewardNotice.type === "last-hours" ? (
                <>
                  <p className="mt-1 text-sm text-white/65">
                    +{rewardNotice.points} Last Hours{" "}
                    {rewardNotice.points === 1 ? "point" : "points"}
                  </p>
                  <div className="mt-3 h-2 bg-white/10">
                    <div
                      className="h-full bg-linear-to-r from-cyan-400 to-yellow-300"
                      style={{
                        width: `${Math.min(
                          100,
                          (rewardNotice.totalPoints / rewardNotice.goal) * 100,
                        )}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-white/40">
                    {rewardNotice.totalPoints}/{rewardNotice.goal}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-white/65">
                  {rewardNotice.description}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="relative h-[min(84dvh,760px)] w-[min(94vw,430px)] perspective-[1400px]">
        <div
          className="absolute -top-14 left-0 right-0"
          role="progressbar"
          aria-label={`Story ${storyIndex + 1} of ${stories.length}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
            {storyIndex + 1} / {stories.length}
          </div>
          <div className="flex gap-1.5">
            {stories.map((item, index) => (
              <span
                key={item._id}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20 shadow-[0_0_8px_rgba(34,211,238,.18)]"
              >
                <span
                  className="block h-full bg-linear-to-r from-cyan-400 to-cyan-100 transition-[width] duration-100"
                  style={{
                    width:
                      index < storyIndex
                        ? "100%"
                        : index === storyIndex
                          ? `${progress}%`
                          : "0%",
                  }}
                />
              </span>
            ))}
          </div>
        </div>

        <div className="absolute -top-8 left-0 right-0 flex items-center justify-between text-white">
          <div className="flex min-w-0 items-center gap-2">
            <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full border border-cyan-300/80 bg-zinc-900">
              {story.userId?.profilePic && (
                <Link href={`/profile/${username}`}>
                  <Image
                    src={story.userId.profilePic}
                    alt=""
                    width={28}
                    height={28}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                </Link>
              )}
            </div>
            <span className="truncate text-sm font-semibold">{username}</span>
            <span className="shrink-0 text-xs text-white/55">
              {createdLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close story"
            title="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-black/55 text-xl hover:bg-white/15"
          >
            <IoClose />
          </button>
        </div>

        <div
          className="relative h-full w-full cursor-pointer transition-transform duration-500 transform-3d"
          style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
          onClick={handleStoryTap}
        >
          <section className="absolute inset-0 overflow-hidden rounded-lg border border-cyan-300/25 bg-black shadow-[0_0_55px_rgba(34,211,238,0.2)] backface-hidden">
            {story.mediaType === "video" ? (
              <video
                src={story.mediaUrl}
                autoPlay
                muted
                playsInline
                className="h-full w-full bg-black object-contain"
              />
            ) : (
              <>
                {/* <Image
                  src={story.mediaUrl}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="430px"
                  unoptimized
                  className="scale-110 object-contain opacity-35 blur-2xl"
                /> */}
                <Image
                  src={story.mediaUrl}
                  alt={`${username} story`}
                  fill
                  sizes="430px"
                  priority
                  unoptimized
                  className="w-full z-1 object-contain"
                />
              </>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-linear-to-t from-black/85 to-transparent" />

            <div className="pointer-events-none absolute bottom-12 left-4 right-4 space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1 border border-emerald-300/35 bg-black/45 px-2 py-1 text-emerald-200">
                  <IoShieldCheckmark />
                  {story.realityScore || 0}%{" "}
                  {story.realityLabel || "unverified"}
                </span>
                {story.event?.title && (
                  <span className="border border-cyan-300/35 bg-black/45 px-2 py-1 text-cyan-100">
                    {story.event.title}
                  </span>
                )}
              </div>
              {story.mission?.title && (
                <p className="text-sm text-white">
                  Mission: {story.mission.title}
                </p>
              )}
              {story.caption && (
                <p className="line-clamp-3 rounded-lg border border-red-500/25 bg-black/55 px-3 py-2 text-sm leading-5 text-white">
                  {story.caption}
                </p>
              )}
            </div>

            {likeBurst && (
              <IoHeart className="pointer-events-none absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 animate-ping text-pink-500" />
            )}

            <div className="pointer-events-none absolute bottom-5 left-0 right-0 text-center text-xs text-white/65">
              Tap for details · Double tap to like
            </div>
          </section>

          <section
            className="absolute inset-0 flex flex-col overflow-hidden rounded-lg border border-cyan-300/30 bg-[#071019] p-5 text-white shadow-[0_0_55px_rgba(34,211,238,0.2)] backface-hidden transform-[rotateY(180deg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-0 opacity-25 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-size-[28px_28px]" />

            <div className="relative z-10 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
                  {story.event?.title || "Story details"}
                </p>
                <p className="mt-1 text-sm text-white/55">
                  Reality score {story.realityScore || 0}%
                </p>
              </div>
              <button
                type="button"
                onClick={startConversation}
                title="Message creator"
                aria-label="Message creator"
                className="grid h-9 w-9 place-items-center border border-cyan-300/35 text-cyan-200 hover:bg-cyan-300/10"
              >
                <IoChatbubbleOutline />
              </button>
            </div>

            <div className="relative z-10 mt-4 grid grid-cols-3 border border-white/10 bg-black/20 p-1 text-xs">
              {[
                ["activity", "Activity"],
                ["comments", `Comments ${comments.length}`],
                ["invite", "Invite"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDetailTab(id)}
                  className={`px-2 py-2 ${
                    detailTab === id
                      ? "bg-cyan-300/15 text-cyan-200"
                      : "text-white/50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative z-10 mt-4 min-h-0 flex-1 overflow-y-auto">
              {detailTab === "activity" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-white/10 bg-black/25 p-4">
                    <IoEye className="mb-3 text-2xl text-cyan-300" />
                    <p className="text-3xl font-semibold">
                      {story.viewsCount || 0}
                    </p>
                    <p className="text-sm text-white/55">Views</p>
                  </div>
                  <div className="border border-white/10 bg-black/25 p-4">
                    <IoHeart
                      className={`mb-3 text-2xl ${
                        story.viewerLiked ? "text-pink-500" : "text-cyan-300"
                      }`}
                    />
                    <p className="text-3xl font-semibold">
                      {story.likesCount || 0}
                    </p>
                    <p className="text-sm text-white/55">Likes</p>
                  </div>
                  <div className="col-span-2 border border-white/10 bg-black/25 p-4 text-sm">
                    <p className="flex items-center gap-2 text-emerald-200">
                      <IoShieldCheckmark />
                      {story.realityLabel || "unverified"} capture
                    </p>
                    <p className="mt-2 text-white/55">
                      GPS accuracy:{" "}
                      {Number.isFinite(Number(story.locationAccuracy))
                        ? `about ${Math.round(story.locationAccuracy)} meters`
                        : "unknown"}
                    </p>
                    {story.mission?.prompt && (
                      <p className="mt-3 border-t border-white/10 pt-3">
                        {story.mission.prompt}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {detailTab === "comments" && (
                <div className="space-y-3">
                  <form
                    onSubmit={submitComment}
                    className="relative flex border border-white/15"
                  >
                    {commentMentionResults.length > 0 && <div className="absolute bottom-full left-0 right-0 z-20 overflow-hidden border border-white/15 bg-[#071019] shadow-xl">{commentMentionResults.map((user) => <button key={user._id} type="button" onClick={() => selectCommentMention(user.username)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/10"><Image src={user.profilePic || "/user.svg"} alt="" width={22} height={22} unoptimized className="h-6 w-6 rounded-full object-cover" />@{user.username}</button>)}</div>}
                    {replyToComment && <div className="absolute -mt-9 flex w-full justify-between bg-[#071019] px-2 py-1 text-[10px] text-cyan-200"><span>Replying to @{replyToComment.user?.username || "user"}</span><button type="button" onClick={() => { setReplyToComment(null); setCommentText(""); }}>×</button></div>}
                    <input
                      value={commentText}
                      onChange={(event) => updateCommentText(event.target.value)}
                      placeholder="Add a comment..."
                      className="min-w-0 flex-1 bg-black/30 px-3 py-2 text-sm outline-none"
                    />
                    <button
                      type="submit"
                      title="Send comment"
                      aria-label="Send comment"
                      className="grid w-10 place-items-center text-cyan-200"
                    >
                      <IoSend />
                    </button>
                  </form>
                  {comments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-white/40">
                      No comments yet.
                    </p>
                  ) : (
                    threadComments(comments).map((comment) => (
                      <div
                        key={comment._id}
                        className={`border-b border-white/10 pb-3 text-sm ${comment.parentId ? "ml-5 border-l border-cyan-500/30 pl-3" : ""}`}
                      >
                        <p className="font-semibold text-cyan-100">
                          {comment.user?.username || "User"}
                        </p>
                        <p className="mt-1 text-white/75">{comment.text}</p>
                        <div className="mt-2 flex gap-3 text-[11px] text-white/45"><button type="button" onClick={() => void likeComment(comment)} className={comment.viewerLiked ? "text-pink-300" : ""}>♥ {comment.likes?.length || 0}</button><button type="button" onClick={() => { setReplyToComment(comment); setCommentText(`@${comment.user?.username || ""} `); }}>Reply</button></div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === "invite" && (
                <div className="space-y-3">
                  {story.event?._id ? (
                    <>
                      <div className="flex items-center gap-2 text-sm text-cyan-100">
                        <IoPeopleOutline />
                        Invite someone to this live event
                      </div>
                      <input
                        value={inviteQuery}
                        onChange={(event) => setInviteQuery(event.target.value)}
                        placeholder="Search username..."
                        className="w-full border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none"
                      />
                      {(inviteQuery.trim().length >= 2
                        ? inviteResults
                        : []
                      ).map((user) => (
                        <button
                          key={user._id}
                          type="button"
                          onClick={() => sendInvitation(user._id)}
                          className="flex w-full items-center justify-between border-b border-white/10 py-2 text-left"
                        >
                          <span>{user.username}</span>
                          <IoSend className="text-cyan-300" />
                        </button>
                      ))}
                    </>
                  ) : (
                    <p className="py-8 text-center text-sm text-white/40">
                      This story is not attached to an active event.
                    </p>
                  )}
                </div>
              )}
            </div>

            {socialMessage && (
              <p className="relative z-10 mt-3 text-center text-xs text-cyan-200">
                {socialMessage}
              </p>
            )}

            <button
              type="button"
              onClick={() => setFlipped(false)}
              className="relative z-10 bottom-30 text-cyan-500 font-bold text-l mt-3"
            >
              Return to story
            </button>
          </section>
        </div>

        {storyIndex > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              moveToStory(storyIndex - 1);
            }}
            aria-label="Previous story"
            title="Previous story"
            className="absolute -left-12 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-cyan-500/40 sm:grid"
          >
            <IoArrowBack />
          </button>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            moveToStory(storyIndex + 1);
          }}
          aria-label="Next story"
          title="Next story"
          className="absolute -right-12 top-1/2 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-cyan-500/40 sm:grid"
        >
          <IoArrowForward />
        </button>
      </div>
    </div>
  );
}
