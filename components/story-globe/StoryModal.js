"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IoArrowBack, IoArrowForward, IoChatbubbleOutline, IoCheckmarkCircle, IoClose, IoEye, IoHeart, IoPaperPlaneOutline, IoReturnDownBack, IoShareOutline, IoShieldCheckmark, IoSparkles } from "react-icons/io5";

function getDurationMs(story) {
  const seconds = Number(story?.duration);
  return (Number.isFinite(seconds) ? Math.min(Math.max(seconds, 5), 60) : 15) * 1000;
}

function formatStoryTime(value) {
  if (!value) return "Just now";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
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
  const story = stories[storyIndex];
  const username = story?.userId?.username || "Zenigram user";
  const durationMs = getDurationMs(story);
  const progress = Math.min(100, Math.max(0, ((durationMs - remainingMs) / durationMs) * 100));

  const showRewardNotice = useCallback((notice) => {
    if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current);
    setRewardNotice(notice);
    rewardTimerRef.current = window.setTimeout(() => setRewardNotice(null), 3200);
  }, []);

  const moveToStory = useCallback((nextIndex) => {
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
    setSocialMessage("");
    setShareError("");
    setLikeBurst(false);
  }, [onClose, stories]);

  useEffect(() => {
    if (!story?._id || flipped) return undefined;
    const interval = window.setInterval(() => setRemainingMs((current) => Math.max(0, current - 100)), 100);
    const timeout = window.setTimeout(() => moveToStory(storyIndex + 1), Math.max(remainingMs, 100));
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [flipped, moveToStory, remainingMs, story?._id, storyIndex]);

  useEffect(() => {
    if (!story?._id) return undefined;
    let cancelled = false;
    const load = async () => {
      try {
        const [engagementResponse, commentsResponse] = await Promise.all([
          fetch(`/api/stories/${story._id}/engagement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view" }) }),
          fetch(`/api/stories/${story._id}/comments`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (engagementResponse.ok) {
          const data = await engagementResponse.json();
          onStoryUpdate(story._id, data);
          if (data.lastHoursReward) showRewardNotice({ type: "reward", title: "Last Hours collected", points: data.lastHoursReward.points });
          else if (data.newlyAwardedAchievements?.length) showRewardNotice({ type: "achievement", title: data.newlyAwardedAchievements[0].title, description: "Exploration achievement unlocked" });
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
    return () => { cancelled = true; };
  }, [onStoryUpdate, showRewardNotice, story?._id]);

  useEffect(() => {
    const query = shareQuery.trim();
    if (query.length < 2) return setShareUsers([]), undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        setShareUsers(Array.isArray(data.users) ? data.users.slice(0, 8) : []);
      } catch (error) { if (error.name !== "AbortError") setShareUsers([]); }
    }, 220);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [shareQuery]);

  useEffect(() => {
    const query = commentMentionQuery.trim();
    if (query.length < 2) return setCommentMentionResults([]), undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        setCommentMentionResults(Array.isArray(data.users) ? data.users.slice(0, 5) : []);
      } catch (error) { if (error.name !== "AbortError") setCommentMentionResults([]); }
    }, 220);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [commentMentionQuery]);

  useEffect(() => () => {
    if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    if (likeTimerRef.current) window.clearTimeout(likeTimerRef.current);
    if (rewardTimerRef.current) window.clearTimeout(rewardTimerRef.current);
  }, []);

  const toggleLike = useCallback(async () => {
    if (!story?._id) return;
    setLikeBurst(true);
    if (likeTimerRef.current) window.clearTimeout(likeTimerRef.current);
    likeTimerRef.current = window.setTimeout(() => setLikeBurst(false), 850);
    try {
      const response = await fetch(`/api/stories/${story._id}/engagement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like" }) });
      if (response.ok) onStoryUpdate(story._id, await response.json());
    } catch (error) { console.error("Unable to update story like:", error); }
  }, [onStoryUpdate, story?._id]);

  const handleStoryTap = () => {
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
    }, 250);
  };

  const flipToDetails = (event) => { event.stopPropagation(); setFlipped(true); setRemainingMs(durationMs); };
  const returnToStory = (event) => { event.stopPropagation(); setFlipped(false); setRemainingMs(durationMs); };

  const updateCommentText = (value) => {
    setCommentText(value);
    setCommentMentionQuery(value.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/)?.[1] || "");
  };
  const selectCommentMention = (name) => {
    setCommentText((current) => current.replace(/@([a-zA-Z0-9_.]*)$/, `@${name} `));
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
      const response = await fetch(`/api/stories/${story._id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, parentId: replyToComment?._id || null }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Unable to add comment");
      setComments((current) => [...current, data.comment]);
      setCommentText("");
      setReplyToComment(null);
      onStoryUpdate(story._id, { commentsCount: Math.max(comments.length + 1, Number(story.commentsCount || 0) + 1) });
    } catch (error) { setSocialMessage(error.message || "Unable to add comment"); }
    finally { setCommentBusy(false); }
  };
  const likeComment = async (comment) => {
    try {
      const response = await fetch(`/api/stories/${story._id}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like", commentId: comment._id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to like comment");
      setComments((current) => current.map((item) => item._id === comment._id ? { ...item, ...data.comment } : item));
    } catch (error) { setSocialMessage(error.message || "Unable to like comment"); }
  };
  const openReply = (comment) => { setReplyToComment(comment); setCommentText(`@${comment.user?.username || ""} `); };

  const shareToUser = async (recipient) => {
    if (!story?._id || shareBusyId) return;
    setShareBusyId(recipient._id);
    setShareError("");
    try {
      const conversationResponse = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: recipient._id }) });
      const conversationData = await conversationResponse.json();
      if (!conversationResponse.ok || !conversationData.conversation?._id) throw new Error(conversationData.error || conversationData.message || "Unable to open conversation");
      const shareUrl = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;
      const messageResponse = await fetch(`/api/conversations/${conversationData.conversation._id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Shared a Zenigram story from @${username}: ${shareUrl}` }) });
      const messageData = await messageResponse.json();
      if (!messageResponse.ok) throw new Error(messageData.error || messageData.message || "Unable to send story");
      setShareQuery("");
      setSocialMessage(`Story sent to @${recipient.username}`);
    } catch (error) { setShareError(error.message || "Unable to share story"); }
    finally { setShareBusyId(""); }
  };

  const nativeShare = async () => {
    try {
      const shareUrl = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;
      if (!navigator.share) {
        await navigator.clipboard?.writeText(shareUrl);
        setSocialMessage("Story link copied to clipboard");
        return;
      }
      await navigator.share({ title: `Zenigram story by @${username}`, text: `View @${username}'s story on Zenigram`, url: shareUrl });
    } catch (error) { if (error?.name !== "AbortError") setSocialMessage("Unable to share story link"); }
  };

  const startConversation = async (event) => {
    event.stopPropagation();
    const recipientId = story.userId?._id;
    if (!recipientId) return;
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId, eventId: story.event?._id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Unable to start conversation");
      router.push(`/messages?conversation=${data.conversation._id}`);
    } catch (error) { setSocialMessage(error.message || "Unable to start conversation"); }
  };

  if (!story) return null;
  const commentsThread = threadComments(comments);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 px-2 py-4 backdrop-blur-xl sm:px-4">
      <AnimatePresence>{rewardNotice && <motion.div initial={{ opacity: 0, y: -22, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} className="absolute left-1/2 top-5 z-[120] w-[min(92vw,370px)] -translate-x-1/2 rounded-2xl border border-cyan-300/25 bg-[#071019]/95 p-4 text-white shadow-2xl backdrop-blur-xl"><div className="flex items-start gap-3"><IoSparkles className="text-2xl text-cyan-200" /><div><p className="font-semibold text-cyan-100">{rewardNotice.title}</p><p className="mt-1 text-sm text-white/55">{rewardNotice.type === "reward" ? `+${rewardNotice.points} points` : rewardNotice.description}</p></div></div></motion.div>}</AnimatePresence>

      <div className="relative h-[min(86dvh,780px)] w-[min(94vw,440px)] [perspective:1600px]">
        <div className="absolute -top-11 left-0 right-0 z-30"><div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[.18em] text-white/50">{storyIndex + 1} / {stories.length}</div><div className="flex gap-1.5">{stories.map((item, index) => <div key={item._id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-linear-to-r from-cyan-400 via-cyan-200 to-white transition-[width] duration-100" style={{ width: index < storyIndex ? "100%" : index === storyIndex ? `${progress}%` : "0%" }} /></div>)}</div></div>
        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between"><Link href={`/profile/${username}`} className="flex min-w-0 items-center gap-2 rounded-full bg-black/35 pr-3 backdrop-blur-md"><Image src={story.userId?.profilePic || "/user.svg"} alt="" width={30} height={30} unoptimized className="h-8 w-8 rounded-full border border-cyan-300/60 object-cover" /><span className="max-w-40 truncate text-sm font-semibold">@{username}</span><span className="text-xs text-white/45">{formatStoryTime(story.createdAt)}</span></Link><button type="button" onClick={onClose} aria-label="Close story" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 hover:bg-white/10"><IoClose /></button></div>

        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: .52, ease: "easeInOut" }} className="relative h-full w-full [transform-style:preserve-3d]">
          <section className="absolute inset-0 overflow-hidden rounded-[24px] border border-cyan-300/15 bg-black shadow-2xl [backface-visibility:hidden]">
            {story.mediaType === "video" ? <video key={story._id} src={story.mediaUrl} autoPlay muted playsInline className="h-full w-full object-contain" /> : <Image key={story._id} src={story.mediaUrl} alt={`${username} story`} fill sizes="440px" priority unoptimized className="z-10 object-contain" />}
            <div className="pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/85 via-transparent to-black/20" />
            <div className="absolute bottom-16 left-4 right-4 z-30 space-y-2"><div className="flex flex-wrap gap-2 text-[11px]"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-black/45 px-2.5 py-1 text-emerald-100 backdrop-blur-md"><IoShieldCheckmark /> {story.realityScore || 0}% {story.realityLabel || "unverified"}</span>{story.event?.title && <span className="rounded-full border border-cyan-300/20 bg-black/45 px-2.5 py-1 text-cyan-100 backdrop-blur-md">{story.event.title}</span>}</div>{story.mission?.title && <p className="text-sm font-semibold">Mission: {story.mission.title}</p>}{story.caption && <p className="max-w-[95%] rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm leading-5 text-white/90 backdrop-blur-md">{story.caption}</p>}</div>
            <AnimatePresence>{likeBurst && <><motion.div initial={{ opacity: 0, scale: .3 }} animate={{ opacity: [0, 1, 1, 0], scale: [.3, 1.15, 1.35, 1.8], y: [0, -4, -8, -24] }} transition={{ duration: .75 }} className="pointer-events-none absolute left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2"><IoHeart className="h-28 w-28 fill-current text-pink-500 drop-shadow-[0_0_25px_rgba(236,72,153,.75)]" /></motion.div>{[0,1,2,3].map((index) => <motion.div key={index} initial={{ opacity: 0, y: 0, scale: .5 }} animate={{ opacity: [0,1,0], x: index % 2 ? "20vw" : "-20vw", y: "-20vh", scale: [.5,1,.7] }} transition={{ duration: .7, delay: index * .05 }} className="pointer-events-none absolute left-1/2 top-1/2 z-40"><IoHeart className="h-6 w-6 fill-current text-pink-300" /></motion.div>)}</>}</AnimatePresence>
            <button type="button" onClick={flipToDetails} className="absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-cyan-200/20 bg-black/55 px-3 py-2 text-xs font-semibold text-cyan-100 backdrop-blur-md hover:bg-cyan-300/10">Details <IoArrowForward /></button>
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[30] -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur-md">Tap = next · Double tap = like</div>
            <div className="absolute inset-0 z-[25]" onClick={handleStoryTap} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleStoryTap(); }} aria-label="Next story. Double tap to like." />
          </section>

          <section className="absolute inset-0 flex flex-col overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#061018] p-4 text-white shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-5" onClick={(event) => event.stopPropagation()}>
            <div className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:30px_30px]" />
            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 pb-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-cyan-300/70">Story details</p><h2 className="mt-1 text-lg font-bold">@{username}</h2></div><div className="flex gap-1.5"><button type="button" onClick={startConversation} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 hover:bg-cyan-300/10" title="Message creator"><IoChatbubbleOutline /></button><button type="button" onClick={nativeShare} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 hover:bg-cyan-300/10" title="Share story"><IoShareOutline /></button><button type="button" onClick={returnToStory} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 hover:bg-cyan-300/10" title="Back to story"><IoReturnDownBack /></button></div></div>
            <div className="relative z-10 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs">{["comments", "share", "activity"].map((tab) => <button key={tab} type="button" onClick={() => setDetailTab(tab)} className={`rounded-lg px-2 py-2 font-semibold capitalize transition ${detailTab === tab ? "bg-cyan-300/15 text-cyan-100" : "text-white/45 hover:bg-white/5 hover:text-white"}`}>{tab === "comments" ? `Comments ${comments.length}` : tab === "share" ? "Share" : "Activity"}</button>)}</div>

            <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {detailTab === "comments" && <div className="space-y-3"><form onSubmit={submitComment} className="relative rounded-2xl border border-white/10 bg-black/25 p-1">{replyToComment && <div className="mb-1 flex items-center justify-between rounded-xl bg-cyan-300/5 px-3 py-1.5 text-[10px] text-cyan-200"><span>Replying to @{replyToComment.user?.username || "user"}</span><button type="button" onClick={() => { setReplyToComment(null); setCommentText(""); }}>Cancel</button></div>}{commentMentionResults.length > 0 && <div className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#071019] shadow-2xl">{commentMentionResults.map((user) => <button key={user._id} type="button" onClick={() => selectCommentMention(user.username)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/10"><Image src={user.profilePic || "/user.svg"} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" />@{user.username}</button>)}</div>}<div className="flex items-center gap-1"><input value={commentText} onChange={(event) => updateCommentText(event.target.value)} placeholder="Write something thoughtful…" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-white/25" /><button type="submit" disabled={commentBusy || !commentText.trim()} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/15 text-cyan-100 disabled:opacity-30" aria-label="Post comment"><IoPaperPlaneOutline /></button></div></form>{socialMessage && <p className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">{socialMessage}</p>}{commentsThread.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><IoChatbubbleOutline className="mx-auto text-2xl text-white/20" /><p className="mt-2 text-sm text-white/45">Start the conversation.</p></div> : commentsThread.map(({ comment, depth }) => <motion.div key={comment._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border border-white/8 bg-white/[.025] p-3 ${depth ? "ml-4 border-l-cyan-300/20" : ""}`}><div className="flex items-start gap-2"><Image src={comment.user?.profilePic || "/user.svg"} alt="" width={30} height={30} unoptimized className="h-7 w-7 shrink-0 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-cyan-100">@{comment.user?.username || "user"}</p><p className="mt-1 break-words text-sm leading-5 text-white/75">{comment.text}</p><div className="mt-2 flex items-center gap-3 text-[10px] text-white/35"><button type="button" onClick={() => void likeComment(comment)} className={comment.viewerLiked ? "text-pink-300" : "hover:text-pink-200"}><IoHeart className="inline" /> {comment.likes?.length || 0}</button><button type="button" onClick={() => openReply(comment)} className="hover:text-cyan-200">Reply</button></div></div></div></motion.div>)}</div>}
              {detailTab === "share" && <div className="space-y-3"><button type="button" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-left hover:bg-cyan-300/10"><span className="grid h-10 w-10 place-items-center rounded-full bg-cyan-300/10 text-cyan-100"><IoShareOutline /></span><span><span className="block text-sm font-semibold">Share anywhere</span><span className="text-xs text-white/40">Use your device share sheet or copy the story link.</span></span></button><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="text-xs font-semibold text-white/80">Send directly to another Zenigram user</p><input value={shareQuery} onChange={(event) => { setShareQuery(event.target.value); setShareError(""); }} placeholder="Search username…" className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-cyan-300/35" />{shareError && <p className="mt-2 text-xs text-red-300">{shareError}</p>}<div className="mt-2 max-h-52 space-y-1 overflow-y-auto">{shareUsers.map((user) => <button key={user._id} type="button" onClick={() => void shareToUser(user)} disabled={Boolean(shareBusyId)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/5 disabled:opacity-50"><Image src={user.profilePic || "/user.svg"} alt="" width={34} height={34} unoptimized className="h-9 w-9 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-sm">@{user.username}</span><span className="text-[10px] font-semibold uppercase tracking-[.14em] text-cyan-200">{shareBusyId === user._id ? "Sending" : "Send"}</span></button>)}</div></div>{socialMessage && <p className="rounded-xl border border-emerald-300/10 bg-emerald-300/5 px-3 py-2 text-xs text-emerald-100">{socialMessage}</p>}</div>}
              {detailTab === "activity" && <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoEye className="text-2xl text-cyan-200" /><p className="mt-3 text-3xl font-semibold">{story.viewsCount || 0}</p><p className="text-xs uppercase tracking-[.16em] text-white/35">Views</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoHeart className="text-2xl fill-current text-pink-300" /><p className="mt-3 text-3xl font-semibold">{story.likesCount || 0}</p><p className="text-xs uppercase tracking-[.16em] text-white/35">Likes</p></div><div className="col-span-2 rounded-2xl border border-white/10 bg-white/[.025] p-4 text-sm"><p className="flex items-center gap-2 font-semibold text-emerald-100"><IoCheckmarkCircle /> {story.realityLabel || "coordinate_selected"}</p><p className="mt-2 text-white/45">Coordinates: {Number(story.latitude).toFixed(6)}, {Number(story.longitude).toFixed(6)}</p>{story.mission?.prompt && <p className="mt-3 border-t border-white/10 pt-3 text-white/65">{story.mission.prompt}</p>}</div></div>}
            </div>
            <div className="relative z-10 mt-3 flex items-center justify-between border-t border-white/10 pt-3"><p className="text-[10px] text-white/30">Story expires in 24 hours</p><button type="button" onClick={returnToStory} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/10">Back to story</button></div>
          </section>
        </motion.div>
        {!flipped && <><button type="button" onClick={(event) => { event.stopPropagation(); moveToStory(storyIndex - 1); }} disabled={storyIndex === 0} aria-label="Previous story" className="absolute -left-12 top-1/2 z-50 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/65 text-white disabled:pointer-events-none disabled:opacity-20 sm:grid"><IoArrowBack /></button><button type="button" onClick={(event) => { event.stopPropagation(); moveToStory(storyIndex + 1); }} aria-label="Next story" className="absolute -right-12 top-1/2 z-50 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-white/10 bg-black/65 text-white sm:grid"><IoArrowForward /></button></>}
      </div>
    </div>
  );
}
