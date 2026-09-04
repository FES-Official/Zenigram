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
      const response = await fetch(`/api/stories/${story._id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: comment.trim(), parentId: reply?._id || null }) });
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
      const url = `${window.location.origin}/stories-globe?story=${encodeURIComponent(story._id)}`;
      const messageResponse = await fetch(`/api/conversations/${conversationData.conversation._id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: `Shared a Zenigram story from @${username}: ${url}` }) });
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
    <div className="fixed inset-0 z-[90] flex min-h-[100dvh] items-center justify-center bg-black/90 px-2 py-3 backdrop-blur-xl sm:px-4 sm:py-4">
      <AnimatePresence>
        {notice && <motion.div initial={{ opacity: 0, y: -18, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} className="absolute left-1/2 top-4 z-[120] w-[min(92vw,370px)] -translate-x-1/2 rounded-2xl border border-cyan-300/25 bg-[#071019]/95 p-4 text-white shadow-2xl backdrop-blur-xl"><div className="flex gap-3"><IoSparkles className="text-2xl text-cyan-200" /><div><p className="font-semibold text-cyan-100">{notice.title}</p><p className="mt-1 text-sm text-white/55">{notice.text}</p></div></div></motion.div>}
      </AnimatePresence>

      <div className="relative h-[calc(100dvh-24px)] max-h-[780px] w-[min(96vw,440px)] sm:h-[min(86dvh,780px)]">
        <div className="absolute -top-10 left-0 right-0 z-30">
          <div className="mb-1 text-right text-[10px] font-semibold uppercase tracking-[.18em] text-white/50">{index + 1} / {stories.length}</div>
          <div className="flex gap-1.5">{stories.map((item, itemIndex) => <div key={item._id} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-linear-to-r from-cyan-400 via-cyan-200 to-white transition-[width] duration-100" style={{ width: itemIndex < index ? "100%" : itemIndex === index ? `${progress}%` : "0%" }} /></div>)}</div>
        </div>

        <div className="absolute -top-8 left-0 right-0 z-30 flex items-center justify-between gap-2">
          <Link href={`/profile/${username}`} onClick={(event) => event.stopPropagation()} className="flex min-w-0 max-w-[82%] items-center gap-2 rounded-full bg-black/40 pr-3 backdrop-blur-md">
            <Image src={story.userId?.profilePic || "/user.svg"} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded-full border border-cyan-300/60 object-cover" />
            <span className="truncate text-sm font-semibold">@{username}</span>
            <span className="hidden shrink-0 text-xs text-white/45 sm:inline">{storyTime(story.createdAt)}</span>
          </Link>
          <button type="button" onClick={onClose} aria-label="Close story" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-black/55 text-white/80 active:scale-95"><IoClose /></button>
        </div>

        {/* Mobile-safe replacement for the old preserve-3d/backface-hidden card. Only one face is mounted. */}
        <div className="relative h-full w-full overflow-hidden rounded-[24px]">
          <AnimatePresence mode="wait" initial={false}>
            {!details ? (
              <motion.section key={`story-${story._id}`} initial={{ opacity: 0, scale: .985, x: 10 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: .985, x: -10 }} transition={{ duration: .24 }} className="absolute inset-0 overflow-hidden rounded-[24px] border border-cyan-300/15 bg-black shadow-2xl">
                {story.mediaType === "video" ? <video key={story._id} src={story.mediaUrl} autoPlay muted playsInline className="h-full w-full object-contain" /> : <Image key={story._id} src={story.mediaUrl} alt={`${username} story`} fill sizes="(max-width: 640px) 96vw, 440px" priority unoptimized className="z-10 object-contain" />}
                <div className="pointer-events-none absolute inset-0 z-20 bg-linear-to-t from-black/85 via-transparent to-black/20" />
                <div className="absolute bottom-16 left-4 right-4 z-30 space-y-2">
                  <div className="flex flex-wrap gap-2 text-[11px]"><span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-black/45 px-2.5 py-1 text-emerald-100 backdrop-blur-md"><IoShieldCheckmark /> {story.realityScore || 0}% {story.realityLabel || "unverified"}</span>{story.event?.title && <span className="rounded-full border border-cyan-300/20 bg-black/45 px-2.5 py-1 text-cyan-100 backdrop-blur-md">{story.event.title}</span>}</div>
                  {story.mission?.title && <p className="text-sm font-semibold">Mission: {story.mission.title}</p>}
                  {story.caption && <p className="max-w-[95%] rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-sm leading-5 text-white/90 backdrop-blur-md">{story.caption}</p>}
                </div>

                <AnimatePresence>{heartBurst && <><motion.div initial={{ opacity: 0, scale: .25 }} animate={{ opacity: [0, 1, 1, 0], scale: [.25, 1.12, 1.35, 1.8], y: [0, -4, -10, -28] }} transition={{ duration: .75 }} className="pointer-events-none absolute left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2"><IoHeart className="h-28 w-28 fill-current text-pink-500 drop-shadow-[0_0_25px_rgba(236,72,153,.75)]" /></motion.div>{[0,1,2,3,4,5].map((n) => <motion.span key={n} initial={{ opacity: 0, scale: .4 }} animate={{ opacity: [0,1,0], x: n % 2 ? `${18 + n * 2}vw` : `${-18 - n * 2}vw`, y: `${-12 - n * 3}vh`, scale: [.4,1,.7] }} transition={{ duration: .75, delay: n * .035 }} className="pointer-events-none absolute left-1/2 top-1/2 z-50"><IoHeart className="h-5 w-5 fill-current text-pink-300" /></motion.span>)}</>}</AnimatePresence>

                <button type="button" onClick={openDetails} className="absolute bottom-4 right-4 z-40 flex min-h-10 items-center gap-2 rounded-full border border-cyan-200/20 bg-black/60 px-3.5 py-2 text-xs font-semibold text-cyan-100 backdrop-blur-md active:scale-95">Details <IoArrowForward /></button>
                <div className="pointer-events-none absolute bottom-3 left-1/2 z-30 hidden -translate-x-1/2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] text-white/55 backdrop-blur-md sm:block">Tap = next · Double tap = like</div>

                {/* This gesture layer exists only on the story face, never over details/comments. */}
                <button type="button" onClick={onStoryTap} aria-label="Next story. Double tap to like." className="absolute inset-0 z-25 h-full w-full cursor-pointer bg-transparent outline-none [touch-action:manipulation]" />
              </motion.section>
            ) : (
              <motion.section key={`details-${story._id}`} initial={{ opacity: 0, scale: .985, x: 12, rotateY: 7 }} animate={{ opacity: 1, scale: 1, x: 0, rotateY: 0 }} exit={{ opacity: 0, scale: .985, x: -12, rotateY: -7 }} transition={{ duration: .28 }} onClick={(event) => event.stopPropagation()} className="absolute inset-0 flex min-h-0 flex-col overflow-hidden rounded-[24px] border border-cyan-300/20 bg-[#061018] p-3.5 text-white shadow-2xl sm:p-5">
                <div className="pointer-events-none absolute inset-0 opacity-20 bg-[linear-gradient(rgba(34,211,238,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,.08)_1px,transparent_1px)] bg-[size:30px_30px]" />
                <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[.22em] text-cyan-300/70">Story details</p><h2 className="mt-1 truncate text-lg font-bold">@{username}</h2></div>
                  <div className="flex shrink-0 gap-1.5"><button type="button" onClick={messageCreator} aria-label="Message creator" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 active:scale-95"><IoChatbubbleOutline /></button><button type="button" onClick={nativeShare} aria-label="Share story" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 active:scale-95"><IoShareOutline /></button><button type="button" onClick={closeDetails} aria-label="Back to story" className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/5 text-cyan-100 active:scale-95"><IoReturnDownBack /></button></div>
                </div>

                <div className="relative z-10 mt-3 grid shrink-0 grid-cols-3 gap-1 rounded-xl border border-white/10 bg-black/20 p-1 text-xs">{["comments", "share", "activity"].map((name) => <button key={name} type="button" onClick={() => setTab(name)} className={`rounded-lg px-2 py-2.5 font-semibold capitalize active:scale-[.98] ${tab === name ? "bg-cyan-300/15 text-cyan-100" : "text-white/45"}`}>{name === "comments" ? `Comments ${comments.length}` : name}</button>)}</div>

                {/* Explicit pan-y scrolling is important on iOS/Android. Buttons/forms are outside the gesture layer. */}
                <div className="relative z-10 mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]">
                  {tab === "comments" && <div className="space-y-3 pb-3">
                    <form onSubmit={submitComment} className="relative rounded-2xl border border-white/10 bg-black/25 p-1">
                      {reply && <div className="mb-1 flex items-center justify-between rounded-xl bg-cyan-300/5 px-3 py-1.5 text-[10px] text-cyan-200"><span>Replying to @{reply.user?.username || "user"}</span><button type="button" onClick={() => { setReply(null); setComment(""); }}>Cancel</button></div>}
                      {mentionUsers.length > 0 && <div className="absolute bottom-full left-0 right-0 z-40 mb-2 overflow-hidden rounded-xl border border-white/10 bg-[#071019] shadow-2xl">{mentionUsers.map((user) => <button key={user._id} type="button" onClick={() => chooseMention(user.username)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs active:bg-white/10"><Image src={user.profilePic || "/user.svg"} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" />@{user.username}</button>)}</div>}
                      <div className="flex items-center gap-1"><input value={comment} onChange={(event) => updateComment(event.target.value)} placeholder="Write something thoughtful…" className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-white/25" /><button type="submit" disabled={commentBusy || !comment.trim()} aria-label="Post comment" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan-300/15 text-cyan-100 disabled:opacity-30"><IoPaperPlaneOutline /></button></div>
                    </form>
                    {message && <p className="rounded-xl border border-cyan-300/10 bg-cyan-300/5 px-3 py-2 text-xs text-cyan-100">{message}</p>}
                    {flatComments.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center"><IoChatbubbleOutline className="mx-auto text-2xl text-white/20" /><p className="mt-2 text-sm text-white/45">Start the conversation.</p></div> : flatComments.map(({ comment: item, depth }) => <motion.div key={item._id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`rounded-2xl border border-white/8 bg-white/[.025] p-3 ${depth ? "ml-4 border-l-cyan-300/20" : ""}`}><div className="flex items-start gap-2"><Image src={item.user?.profilePic || "/user.svg"} alt="" width={30} height={30} unoptimized className="h-7 w-7 shrink-0 rounded-full object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-cyan-100">@{item.user?.username || "user"}</p><p className="mt-1 break-words text-sm leading-5 text-white/75">{item.text}</p><div className="mt-2 flex items-center gap-3 text-[10px] text-white/35"><button type="button" onClick={() => void likeComment(item)} className={item.viewerLiked ? "text-pink-300" : "hover:text-pink-200"}><IoHeart className="inline" /> {item.likes?.length || 0}</button><button type="button" onClick={() => replyTo(item)} className="hover:text-cyan-200">Reply</button></div></div></div></motion.div>)}
                  </div>}

                  {tab === "share" && <div className="space-y-3 pb-3">
                    <button type="button" onClick={nativeShare} className="flex w-full items-center gap-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-left active:scale-[.99]"><span className="grid h-10 w-10 place-items-center rounded-full bg-cyan-300/10 text-cyan-100"><IoShareOutline /></span><span><span className="block text-sm font-semibold">Share story</span><span className="text-xs text-white/40">Use your phone's share menu</span></span></button>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3"><p className="mb-2 text-xs font-semibold text-white/65">Send to a Zenigram user</p><input value={shareQuery} onChange={(event) => setShareQuery(event.target.value)} placeholder="Search username…" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm outline-none placeholder:text-white/25" /><div className="mt-2 space-y-1">{shareUsers.map((user) => <button key={user._id} type="button" disabled={Boolean(shareBusy)} onClick={() => void shareToUser(user)} className="flex w-full items-center gap-3 rounded-xl p-2 text-left active:bg-white/10 disabled:opacity-50"><Image src={user.profilePic || "/user.svg"} alt="" width={34} height={34} unoptimized className="h-8 w-8 rounded-full object-cover" /><span className="min-w-0 flex-1 truncate text-sm">@{user.username}</span><IoPaperPlaneOutline className="text-cyan-200" /></button>)}</div>{shareError && <p className="mt-2 text-xs text-rose-300">{shareError}</p>}</div>
                  </div>}

                  {tab === "activity" && <div className="grid grid-cols-2 gap-2 pb-3"><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoEye className="text-cyan-200" /><p className="mt-3 text-xl font-bold">{story.viewsCount || story.views || 0}</p><p className="text-xs text-white/40">Views</p></div><div className="rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoHeart className="text-pink-300" /><p className="mt-3 text-xl font-bold">{story.likesCount || story.likes?.length || 0}</p><p className="text-xs text-white/40">Likes</p></div><div className="col-span-2 rounded-2xl border border-white/10 bg-white/[.025] p-4"><IoShieldCheckmark className="text-emerald-300" /><p className="mt-2 text-xs uppercase tracking-wider text-white/35">Story location</p><p className="mt-1 break-all font-mono text-xs text-white/65">{Number.isFinite(Number(story.latitude)) ? Number(story.latitude).toFixed(6) : "—"}, {Number.isFinite(Number(story.longitude)) ? Number(story.longitude).toFixed(6) : "—"}</p></div></div>}
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {!details && index > 0 && <button type="button" onClick={(event) => { event.stopPropagation(); nextStory(index - 1); }} aria-label="Previous story" className="absolute left-2 top-1/2 z-40 hidden h-12 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur-md sm:grid"><IoArrowBack /></button>}
        {!details && index < stories.length - 1 && <button type="button" onClick={(event) => { event.stopPropagation(); nextStory(index + 1); }} aria-label="Next story" className="absolute right-2 top-1/2 z-40 hidden h-12 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/35 text-white/80 backdrop-blur-md sm:grid"><IoArrowForward /></button>}
      </div>
    </div>
  );
}
