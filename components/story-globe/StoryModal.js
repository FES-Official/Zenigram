"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { IoArrowBack, IoArrowForward, IoChatbubbleOutline, IoClose, IoEye, IoHeart, IoPaperPlaneOutline, IoReturnDownBack, IoShareOutline, IoShieldCheckmark, IoSparkles } from "react-icons/io5";

const durationMs = (story) => {
  const seconds = Number(story?.duration);
  return (Number.isFinite(seconds) ? Math.min(Math.max(seconds, 5), 60) : 15) * 1000;
};

const storyTime = (value) => {
  if (!value) return "Just now";
  try { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
  catch { return "Just now"; }
};

function flattenComments(comments) {
  const children = new Map();
  comments.forEach((comment) => {
    const parent = String(comment.parentId || "root");
    children.set(parent, [...(children.get(parent) || []), comment]);
  });
  const walk = (parent = "root", depth = 0, seen = new Set()) => {
    const rows = [];
    for (const comment of children.get(String(parent)) || []) {
      const id = String(comment._id);
      if (seen.has(id)) continue;
      const nextSeen = new Set(seen).add(id);
      rows.push({ comment, depth }, ...walk(id, depth + 1, nextSeen));
    }
    return rows;
  };
  return walk();
}

export default function StoryModal({ storyGroup, initialIndex = 0, onClose, onStoryUpdate }) {
  const router = useRouter();
  const stories = useMemo(() => storyGroup?.stories || [], [storyGroup]);
  const initial = Math.min(Math.max(initialIndex, 0), Math.max(stories.length - 1, 0));
  const [index, setIndex] = useState(initial);
  const [remaining, setRemaining] = useState(() => durationMs(stories[initial]));
  const [details, setDetails] = useState(false);
  const [tab, setTab] = useState("comments");
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [reply, setReply] = useState(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionUsers, setMentionUsers] = useState([]);
  const [shareQuery, setShareQuery] = useState("");
  const [shareUsers, setShareUsers] = useState([]);
  const [shareBusy, setShareBusy] = useState("");
  const [message, setMessage] = useState("");
  const [shareError, setShareError] = useState("");
  const [heartBurst, setHeartBurst] = useState(false);
  const [notice, setNotice] = useState(null);
  const tapTimer = useRef(null);
  const heartTimer = useRef(null);
  const noticeTimer = useRef(null);

  const story = stories[index];
  const username = story?.userId?.username || "Zenigram user";
  const total = durationMs(story);
  const progress = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));

  const showNotice = useCallback((value) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(value);
    noticeTimer.current = setTimeout(() => setNotice(null), 3000);
  }, []);

  const nextStory = useCallback((nextIndex) => {
    if (nextIndex >= stories.length) return onClose();
    if (nextIndex < 0) return;
    setIndex(nextIndex);
    setRemaining(durationMs(stories[nextIndex]));
    setDetails(false);
    setTab("comments");
    setComments([]);
    setComment("");
    setReply(null);
    setShareQuery("");
    setShareUsers([]);
    setMessage("");
    setShareError("");
    setHeartBurst(false);
  }, [onClose, stories]);

  useEffect(() => {
    if (!story?._id || details) return undefined;
    const tick = setInterval(() => setRemaining((value) => Math.max(0, value - 100)), 100);
    const advance = setTimeout(() => nextStory(index + 1), Math.max(remaining, 100));
    return () => { clearInterval(tick); clearTimeout(advance); };
  }, [details, index, nextStory, remaining, story?._id]);

  useEffect(() => {
    if (!story?._id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [engagement, commentsResponse] = await Promise.all([
          fetch(`/api/stories/${story._id}/engagement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "view" }) }),
          fetch(`/api/stories/${story._id}/comments`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (engagement.ok) {
          const data = await engagement.json();
          onStoryUpdate?.(story._id, data);
          if (data.lastHoursReward) showNotice({ title: "Last Hours collected", text: `+${data.lastHoursReward.points} points` });
          else if (data.newlyAwardedAchievements?.length) showNotice({ title: data.newlyAwardedAchievements[0].title, text: "Exploration achievement unlocked" });
        }
        if (commentsResponse.ok) {
          const data = await commentsResponse.json();
          setComments(Array.isArray(data.comments) ? data.comments : []);
        }
      } catch (error) { if (!cancelled) console.error("Story interaction load failed", error); }
    })();
    return () => { cancelled = true; };
  }, [onStoryUpdate, showNotice, story?._id]);

  useEffect(() => {
    const q = shareQuery.trim();
    if (q.length < 2) { setShareUsers([]); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        setShareUsers(Array.isArray(data.users) ? data.users.slice(0, 8) : []);
      } catch (error) { if (error.name !== "AbortError") setShareUsers([]); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [shareQuery]);

  useEffect(() => {
    const q = mentionQuery.trim();
    if (q.length < 2) { setMentionUsers([]); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        setMentionUsers(Array.isArray(data.users) ? data.users.slice(0, 5) : []);
      } catch (error) { if (error.name !== "AbortError") setMentionUsers([]); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mentionQuery]);

  useEffect(() => () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    if (heartTimer.current) clearTimeout(heartTimer.current);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const likeStory = useCallback(async () => {
    if (!story?._id) return;
    setHeartBurst(true);
    if (heartTimer.current) clearTimeout(heartTimer.current);
    heartTimer.current = setTimeout(() => setHeartBurst(false), 850);
    try {
      const response = await fetch(`/api/stories/${story._id}/engagement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like" }) });
      if (response.ok) onStoryUpdate?.(story._id, await response.json());
    } catch (error) { console.error("Story like failed", error); }
  }, [onStoryUpdate, story?._id]);

  // Mobile-safe gesture logic: wait briefly for a possible second tap before advancing.
  const onStoryTap = useCallback(() => {
    if (details) return;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      void likeStory();
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      nextStory(index + 1);
    }, 280);
  }, [details, index, likeStory, nextStory]);

  const openDetails = (event) => {
    event.stopPropagation();
    if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null; }
    setDetails(true);
    setRemaining(total);
  };

  const closeDetails = (event) => {
    event.stopPropagation();
    setDetails(false);
    setRemaining(total);
  };

  const updateComment = (value) => {
    setComment(value);
    setMentionQuery(value.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/)?.[1] || "");
  };

  const chooseMention = (name) => {
    setComment((value) => value.replace(/@([a-zA-Z0-9_.]*)$/, `@${name} `));
    setMentionQuery("");
    setMentionUsers([]);
  };

  const submitComment = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (commentBusy || !story?._id || !comment.trim()) return;
    setCommentBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/stories/${story._id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, parentId: replyToComment?._id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Unable to add comment");
      setComments((current) => [...current, data.comment]);
      setComment("");
      setReply(null);
      onStoryUpdate?.(story._id, { commentsCount: comments.length + 1 });
    } catch (error) { setMessage(error.message || "Unable to add comment"); }
    finally { setCommentBusy(false); }
  };

  const likeComment = async (item) => {
    try {
      const response = await fetch(`/api/stories/${story._id}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like", commentId: item._id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to like comment");
      setComments((current) => current.map((entry) => entry._id === item._id ? { ...entry, ...data.comment } : entry));
    } catch (error) { setMessage(error.message || "Unable to like comment"); }
  };

  const replyTo = (item) => {
    setReply(item);
    setComment(`@${item.user?.username || ""} `);
    setTab("comments");
  };

  const nativeShare = async () => {
    const url = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Zenigram story by @${username}`, text: `View @${username}'s story on Zenigram`, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); setMessage("Story link copied to clipboard"); }
      else setMessage(url);
    } catch (error) { if (error?.name !== "AbortError") setMessage("Unable to share story link"); }
  };

  const shareToUser = async (recipient) => {
    if (!story?._id || shareBusy) return;
    setShareBusy(recipient._id);
    setShareError("");
    try {
      const conversationResponse = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId: recipient._id }) });
      const conversationData = await conversationResponse.json();
      if (!conversationResponse.ok || !conversationData.conversation?._id) throw new Error(conversationData.error || conversationData.message || "Unable to open conversation");
      const shareUrl = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;
      const messageResponse = await fetch(`/api/conversations/${conversationData.conversation._id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: shareUrl }) });
      const messageData = await messageResponse.json();
      if (!messageResponse.ok) throw new Error(messageData.error || messageData.message || "Unable to send story");
      setShareQuery("");
      setMessage(`Story sent to @${recipient.username}`);
    } catch (error) { setShareError(error.message || "Unable to share story"); }
    finally { setShareBusy(""); }
  };

  const messageCreator = async (event) => {
    event.stopPropagation();
    const recipientId = story.userId?._id;
    if (!recipientId) return;
    try {
      const response = await fetch("/api/conversations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientId, eventId: story.event?._id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.message || "Unable to start conversation");
      router.push(`/messages?conversation=${data.conversation._id}`);
    } catch (error) { setMessage(error.message || "Unable to start conversation"); }
  };

  if (!story) return null;
  const flatComments = flattenComments(comments);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 px-2 py-4 backdrop-blur-xl sm:px-4">
      <AnimatePresence>{rewardNotice && <motion.div initial={{ opacity: 0, y: -22, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} className="absolute left-1/2 top-4 z-[120] w-[min(90vw,360px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md"><div className="flex items-start gap-2">{rewardNotice?.type === "reward" ? <IoSparkles className="shrink-0 text-lg text-yellow-400" /> : <IoCheckmarkCircle className="shrink-0 text-lg text-emerald-400" />}<div className="min-w-0 flex-1"><p className="text-xs font-semibold text-white">{rewardNotice?.title}</p>{rewardNotice?.points && <p className="text-xs text-cyan-200">+{rewardNotice.points} points</p>}{rewardNotice?.description && <p className="text-xs text-white/70">{rewardNotice.description}</p>}</div></div></motion.div>}</AnimatePresence>

      <div className="relative h-[min(86dvh,780px)] w-[min(94vw,440px)] [perspective:1600px]">
        <div className="absolute -top-11 left-0 right-0 z-30"><div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[.18em] text-white/50">{storyIndex + 1} / {stories.length}</div><div className="flex gap-1.5">{stories.map((item, i) => <div key={item._id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${i < storyIndex ? 100 : i === storyIndex ? progress : 0}%` }} /></div>)}</div></div>
        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between"><Link href={`/profile/${username}`} className="flex min-w-0 items-center gap-2 rounded-full bg-black/40 pr-3 backdrop-blur-md"><Image src={story.userId?.profilePic || "/user.svg"} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full border border-cyan-300/60 object-cover" /><span className="truncate text-sm font-semibold">@{username}</span><span className="hidden shrink-0 text-xs text-white/45 sm:inline">{formatStoryTime(story.createdAt)}</span></Link><button type="button" onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 active:scale-90"><IoClose className="text-lg" /></button></div>

        <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ duration: .52, ease: "easeInOut" }} className="relative h-full w-full [transform-style:preserve-3d]">
          <section className="absolute inset-0 overflow-hidden rounded-[24px] border border-cyan-300/15 bg-black shadow-2xl [backface-visibility:hidden]">
            {story.mediaType === "video" ? <video key={story._id} src={story.mediaUrl} autoPlay muted playsInline className="h-full w-full object-contain" /> : <Image key={story._id} src={story.mediaUrl} alt="" fill priority unoptimized className="object-contain" />}
            <div className="pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/85 via-transparent to-black/20" />
            <div className="absolute bottom-16 left-4 right-4 z-30 space-y-2"><div className="flex flex-wrap gap-2 text-[11px]"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-black/45 px-2.5 py-1 text-emerald-300"><IoShieldCheckmark className="text-xs" /> Verified</span></div>{story.caption && <p className="max-w-[95%] rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm leading-5 text-white/90 backdrop-blur-md">{story.caption}</p>}</div>
            <AnimatePresence>{likeBurst && <><motion.div initial={{ opacity: 0, scale: .3 }} animate={{ opacity: [0, 1, 1, 0], scale: [.3, 1.15, 1.35, 1.8], y: [0, -4, -8, -24] }} transition={{ duration: .8 }} className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 text-6xl"><IoHeart className="text-red-500" /></motion.div></> }</AnimatePresence>
            <button type="button" onClick={flipToDetails} className="absolute bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-cyan-200/20 bg-black/55 px-3 py-2 text-xs font-semibold text-cyan-200 active:scale-90"><IoSparkles className="text-sm" /> Details</button>
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-[30] -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur-sm sm:block hidden">Tap to advance • Double-tap to like</div>
            <div className="absolute inset-0 z-[25]" onClick={handleStoryTap} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") handleStoryTap(); }} className="cursor-pointer outline-none" />
          </section>

          <section className="absolute inset-0 flex flex-col overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#061018] p-4 text-white shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <div className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:24px_24px]" />
            <div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/10 pb-3"><div><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-cyan-300/70">Story details</p><h2 className="mt-1 truncate text-lg font-bold">@{username}</h2></div><div className="flex gap-1.5"><button type="button" onClick={startConversation} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90"><IoPaperPlaneOutline className="text-lg" /></button><button type="button" onClick={returnToStory} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90"><IoClose className="text-lg" /></button></div></div>
            <div className="relative z-10 mt-3 grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs">{["comments", "share", "activity"].map((tab) => <button key={tab} type="button" onClick={() => setDetailTab(tab)} className={`rounded-lg px-3 py-2 font-semibold transition-all ${detailTab === tab ? "bg-cyan-500/30 text-cyan-200" : "bg-transparent text-white/50 active:scale-95"}`}>{tab}</button>)}</div>

            <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
              {detailTab === "comments" && <div className="space-y-3"><form onSubmit={submitComment} className="relative rounded-2xl border border-white/10 bg-black/25 p-1">{replyToComment && <div className="mb-1 flex items-center justify-between rounded-xl bg-cyan-300/5 px-3 py-1.5 text-[10px] text-cyan-200"><span>Replying to @{replyToComment.user?.username || "User"}</span><button type="button" onClick={() => setReplyToComment(null)} className="active:scale-90"><IoClose /></button></div>}{commentMentionResults.length > 0 && <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#071019] shadow-2xl">{commentMentionResults.map((user) => <button key={user._id} type="button" onClick={() => selectCommentMention(user.username)} className="block w-full px-3 py-2 text-left text-xs text-white/80 hover:bg-white/5 active:bg-white/10">@{user.username}</button>)}</div>}<div className="flex items-center gap-1"><input value={commentText} onChange={(event) => updateCommentText(event.target.value)} placeholder="Write something thoughtful…" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-xs text-white placeholder-white/40 outline-none" /><button type="submit" disabled={commentBusy || !commentText.trim()} className="shrink-0 rounded-full bg-cyan-500/30 px-3 py-2 text-xs font-semibold text-cyan-300 disabled:opacity-50 active:scale-90"><IoPaperPlaneOutline className="text-sm" /></button></div></form>{socialMessage && <p className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">{socialMessage}</p>}{commentsThread.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><IoChatbubbleOutline className="mx-auto text-2xl text-white/20" /><p className="mt-2 text-xs text-white/40">No comments yet. Be the first!</p></div> : commentsThread.map(({ comment: item, depth }) => <div key={item._id} style={{ marginLeft: `${depth * 12}px` }} className="rounded-2xl border border-white/10 bg-white/5 p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-cyan-200">@{item.user?.username || "User"}</p><p className="mt-1 text-xs text-white/80">{item.text}</p></div><button type="button" onClick={() => likeComment(item)} className="shrink-0 active:scale-90"><IoHeart className={`text-sm ${item.likedByMe ? "text-red-500" : "text-white/30"}`} /></button></div><div className="mt-2 flex items-center justify-between"><p className="text-[9px] text-white/40">{formatStoryTime(item.createdAt)}</p><button type="button" onClick={() => openReply(item)} className="text-[9px] text-cyan-300/60 active:scale-90">Reply</button></div></div>)}
              </div>}
              {detailTab === "share" && <div className="space-y-3"><button type="button" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-left active:scale-[.99]"><span className="text-2xl"><IoShareOutline /></span><span className="flex-1"><p className="text-xs font-semibold text-white">Share via native</p><p className="text-[10px] text-white/60">Use your device&apos;s native share</p></span></button><div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="mb-2 text-xs font-semibold text-white/65">Send to a Zenigram user</p><input value={shareQuery} onChange={(event) => setShareQuery(event.target.value)} placeholder="Enter username…" className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-white placeholder-white/40 outline-none" />{shareUsers.length > 0 && <div className="mt-2 space-y-1">{shareUsers.map((user) => <button key={user._id} type="button" onClick={() => shareToUser(user)} disabled={shareBusyId === user._id} className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-xs text-white disabled:opacity-50 active:scale-[.98]"><Image src={user.profilePic || "/user.svg"} alt="" width={24} height={24} className="h-6 w-6 rounded-full object-cover" /><span className="flex-1">@{user.username}</span><IoArrowForward className="shrink-0 text-white/40" /></button>)}</div>}{shareError && <p className="mt-2 rounded-lg border border-red-300/20 bg-red-300/10 px-3 py-2 text-xs text-red-200">{shareError}</p>}</div>
              </div>}
              {detailTab === "activity" && <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoEye className="text-2xl text-cyan-200" /><p className="mt-3 text-2xl font-bold">{story.views || 0}</p><p className="text-[10px] text-white/50">Views</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoHeart className="text-2xl text-red-400" /><p className="mt-3 text-2xl font-bold">{story.likes || 0}</p><p className="text-[10px] text-white/50">Likes</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoChatbubbleOutline className="text-2xl text-blue-400" /><p className="mt-3 text-2xl font-bold">{story.commentsCount || 0}</p><p className="text-[10px] text-white/50">Comments</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoShareOutline className="text-2xl text-green-400" /><p className="mt-3 text-2xl font-bold">{story.shares || 0}</p><p className="text-[10px] text-white/50">Shares</p></div></div>}
            </div>
            <div className="relative z-10 mt-3 flex items-center justify-between border-t border-white/10 pt-3"><p className="text-[10px] text-white/30">Story expires in 24 hours</p><button type="button" onClick={returnToStory} className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 active:scale-90"><IoReturnDownBack className="text-lg" /></button></div>
          </section>
        </motion.div>
        {!flipped && <><button type="button" onClick={(event) => { event.stopPropagation(); moveToStory(storyIndex - 1); }} disabled={storyIndex === 0} aria-label="Previous story" className="absolute left-2 top-1/2 z-40 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 disabled:opacity-30 active:scale-90"><IoArrowBack className="text-lg" /></button><button type="button" onClick={(event) => { event.stopPropagation(); moveToStory(storyIndex + 1); }} disabled={storyIndex === stories.length - 1} aria-label="Next story" className="absolute right-2 top-1/2 z-40 -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/60 text-white/80 disabled:opacity-30 active:scale-90"><IoArrowForward className="text-lg" /></button></> }
      </div>
    </div>
  );
}
