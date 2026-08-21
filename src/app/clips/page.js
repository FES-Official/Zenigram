"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import Navbar from "../../../components/navbar";
import ClipReelPlayer from "../../../components/ClipReelPlayer";
import ClipCommentsDialog from "../../../components/ClipCommentsDialog";
import ClipShareDialog from "../../../components/ClipShareDialog";
import ClipOptions from "../../../components/ClipOptions";

const formatCount = (value = 0) => {
  const number = Number(value) || 0;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number >= 10_000_000 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number >= 10_000 ? 0 : 1)}K`;
  return number.toString();
};

const getLikesCount = (clip) => clip.likesCount ?? clip.likes?.length ?? 0;
const getViewsCount = (clip) => clip.viewsCount ?? clip.views?.length ?? 0;

function HeartIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden="true">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-7 w-7" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.4 9.4 0 0 1-4-.9L3 21l1.7-4.5A8.5 8.5 0 1 1 21 11.5Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
      <path d="M2.1 12s3.6-6 9.9-6 9.9 6 9.9 6-3.6 6-9.9 6S2.1 12 2.1 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </svg>
  );
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>;
}

function MusicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
      <path d="M9 18V5l11-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  );
}

function ReelAction({ icon, label, active = false, onClick, disabled = false, ariaLabel }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel} className="group flex flex-col items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50">
      <span className={`grid h-12 w-12 place-items-center rounded-full border shadow-lg backdrop-blur-md transition duration-200 group-hover:scale-105 group-active:scale-90 ${active ? "border-red-400/50 bg-red-600 text-white" : "border-white/10 bg-black/40 text-white group-hover:bg-white/20"}`}>
        {icon}
      </span>
      <span className="max-w-16 text-center text-[11px] font-bold text-white drop-shadow-lg">{label}</span>
    </button>
  );
}

function ReelMetric({ icon, value }) {
  return (
    <div className="flex flex-col items-center gap-1.5 text-white" aria-label={`${value} views`}>
      <span className="grid h-12 w-12 place-items-center rounded-full border border-white/10 bg-black/40 shadow-lg backdrop-blur-md">{icon}</span>
      <span className="text-[11px] font-bold drop-shadow-lg">{value}</span>
    </div>
  );
}

export default function ClipsPage() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeClipId, setActiveClipId] = useState(null);
  const [muted, setMuted] = useState(true);
  const [commentsClip, setCommentsClip] = useState(null);
  const [sharingClip, setSharingClip] = useState(null);
  const [optionsClip, setOptionsClip] = useState(null);
  const [updatingClips, setUpdatingClips] = useState(new Set());
  const feedRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const loadClips = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/clips", { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Failed to load clips");
        const loadedClips = Array.isArray(data.clips) ? data.clips : [];
        setClips(loadedClips);
        const requestedId = new URLSearchParams(window.location.search).get("clip");
        const requestedClip = loadedClips.find((clip) => String(clip._id) === String(requestedId));
        setActiveClipId(requestedClip?._id || loadedClips[0]?._id || null);
      } catch (err) {
        if (err.name !== "AbortError") setError(err.message || "Failed to load clips");
      } finally {
        setLoading(false);
      }
    };
    void loadClips();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!activeClipId || !feedRef.current) return;
    const requestedId = new URLSearchParams(window.location.search).get("clip");
    if (String(requestedId || "") !== String(activeClipId)) return;
    window.requestAnimationFrame(() => {
      feedRef.current?.querySelector(`[data-clip-id="${activeClipId}"]`)?.scrollIntoView({ block: "start" });
    });
  }, [activeClipId]);

  useEffect(() => {
    const container = feedRef.current;
    if (!container || clips.length === 0) return undefined;
    const elements = container.querySelectorAll("[data-clip-id]");
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.intersectionRatio >= 0.6) setActiveClipId(visible.target.getAttribute("data-clip-id"));
      },
      { root: container, threshold: [0.4, 0.6, 0.8, 1] },
    );
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [clips]);

  useEffect(() => {
    const handleKeys = (event) => {
      if (!feedRef.current || !["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = Math.max(0, clips.findIndex((clip) => clip._id === activeClipId));
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = Math.min(clips.length - 1, Math.max(0, currentIndex + direction));
      feedRef.current.querySelector(`[data-clip-id="${clips[nextIndex]?._id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("keydown", handleKeys);
    return () => window.removeEventListener("keydown", handleKeys);
  }, [activeClipId, clips]);

  const updateClip = useCallback(async (clipId, action) => {
    const requestKey = `${clipId}-${action}`;
    setUpdatingClips((current) => new Set(current).add(requestKey));
    try {
      const response = await fetch(`/api/clips/${clipId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to update clip");
      setClips((current) => current.map((clip) => clip._id === clipId ? {
        ...clip,
        viewerLiked: data.liked ?? clip.viewerLiked,
        likesCount: data.likesCount ?? getLikesCount(clip),
        viewsCount: data.viewsCount ?? getViewsCount(clip),
        shares: data.shares ?? clip.shares,
        viewerPreference: data.preference ?? clip.viewerPreference,
        viewerSaved: data.saved ?? clip.viewerSaved,
      } : clip));
      return data;
    } finally {
      setUpdatingClips((current) => {
        const next = new Set(current);
        next.delete(requestKey);
        return next;
      });
    }
  }, []);

  const markAsViewed = useCallback(async (clipId) => {
    let shouldUpdate = false;
    setClips((current) => current.map((clip) => {
      if (clip._id !== clipId || clip.viewerViewed) return clip;
      shouldUpdate = true;
      return { ...clip, viewerViewed: true };
    }));
    if (!shouldUpdate) return;
    try {
      await updateClip(clipId, "view");
    } catch {
      setClips((current) => current.map((clip) => clip._id === clipId ? { ...clip, viewerViewed: false } : clip));
    }
  }, [updateClip]);

  const handleLike = async (clipId) => {
    try {
      setError("");
      await updateClip(clipId, "like");
    } catch (err) {
      setError(err.message || "Unable to like clip");
    }
  };

  const handleDoubleLike = (clip) => {
    if (!clip.viewerLiked && !updatingClips.has(`${clip._id}-like`)) {
      void handleLike(clip._id);
    }
  };

  const handlePreference = async (action) => {
    const clip = optionsClip;
    if (!clip) return;
    try {
      setError("");
      const response = await fetch(`/api/clips/${clip._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to update recommendations");
      setClips((current) => {
        const next = action === "not_interested"
          ? current.filter((item) => item._id !== clip._id)
          : current.map((item) => item._id === clip._id ? { ...item, viewerPreference: "interested" } : item);
        if (action === "not_interested" && activeClipId === clip._id) setActiveClipId(next[0]?._id || null);
        return next;
      });
      setOptionsClip(null);
      setNotice(action === "interested" ? "We’ll show more clips like this" : "We’ll show fewer clips like this");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (err) {
      setError(err.message || "Unable to update recommendations");
    }
  };

  const handleSave = async () => {
    const clip = optionsClip;
    if (!clip) return;
    try {
      setError("");
      const data = await updateClip(clip._id, "save");
      setOptionsClip(null);
      setNotice(data.saved ? "Clip saved" : "Clip removed from saved items");
      window.setTimeout(() => setNotice(""), 2200);
    } catch (err) {
      setError(err.message || "Unable to save clip");
    }
  };

  if (loading) {
    return (
      <main className="min-h-dvh bg-[#050202] text-white">
        <Navbar />
        <div className="flex min-h-dvh items-center justify-center md:pl-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-11 w-11 animate-spin rounded-full border-2 border-white/15 border-t-red-500" />
            <p className="text-sm text-white/50">Loading clips…</p>
          </div>
        </div>
      </main>
    );
  }

  if (!clips.length) {
    return (
      <main className="min-h-dvh bg-[radial-gradient(circle_at_50%_20%,rgba(127,29,29,.22),transparent_42%),#050202] text-white">
        <Navbar />
        <div className="flex min-h-dvh items-center justify-center px-5 pb-20 md:pl-24">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-md rounded-[2rem] border border-red-500/15 bg-black/55 p-9 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-red-500/10 text-3xl">▶</div>
            <h1 className="text-2xl font-black">Clips are waiting</h1>
            <p className="mt-2 text-sm leading-6 text-white/55">Short videos and visual stories from the Zenigram community will appear here.</p>
            <Link href="/create-clip" className="mt-6 inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-bold transition hover:bg-red-500 active:scale-95">Create the first clip</Link>
            {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          </motion.div>
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh overflow-hidden bg-[#050202] text-white">
      <Navbar />
      <header className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center bg-linear-to-b from-black/80 via-black/30 to-transparent px-5 pb-12 pt-4 md:left-20">
        <div className="pointer-events-auto rounded-full border border-white/10 bg-black/25 px-5 py-2 text-sm font-black tracking-wide shadow-xl backdrop-blur-xl">Clips</div>
      </header>

      <AnimatePresence>
        {(error || notice) && (
          <motion.div initial={{ opacity: 0, y: -12, x: "-50%" }} animate={{ opacity: 1, y: 0, x: "-50%" }} exit={{ opacity: 0, y: -8, x: "-50%" }} className={`fixed left-1/2 top-16 z-70 max-w-[calc(100%-2rem)] rounded-full border px-5 py-2.5 text-sm font-semibold shadow-2xl backdrop-blur-xl ${error ? "border-red-500/30 bg-red-950/90 text-red-100" : "border-white/10 bg-zinc-900/90 text-white"}`}>
            {error || notice}
            {error && <button type="button" onClick={() => setError("")} className="ml-3 text-white/55 hover:text-white" aria-label="Dismiss error">×</button>}
          </motion.div>
        )}
      </AnimatePresence>

      <section ref={feedRef} aria-label="Clips feed" className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-[radial-gradient(circle_at_50%_50%,rgba(127,29,29,.14),transparent_42%),#050202] pb-20 md:pl-20 md:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {clips.map((clip) => {
          const username = clip.user?.username || "user";
          const avatar = clip.user?.profilePic || "/user.svg";
          const isActive = activeClipId === clip._id;
          const likesCount = getLikesCount(clip);
          const viewsCount = getViewsCount(clip);
          return (
            <article key={clip._id} data-clip-id={clip._id} aria-label={`Clip by ${username}`} className="relative mx-auto flex h-[calc(100dvh-5rem)] w-full snap-start snap-always items-center justify-center overflow-hidden md:h-dvh">
              <motion.div animate={{ opacity: isActive ? 1 : 0.62, scale: isActive ? 1 : 0.985 }} transition={{ duration: 0.28 }} className="relative h-full w-full overflow-hidden bg-black sm:h-[min(94dvh,900px)] sm:max-w-[500px] sm:rounded-[1.7rem] sm:border sm:border-white/10 sm:shadow-[0_30px_100px_rgba(0,0,0,.65)]">
                <ClipReelPlayer clip={clip} isActive={isActive && !commentsClip && !sharingClip && !optionsClip} muted={muted} onMutedChange={setMuted} onFirstPlay={() => void markAsViewed(clip._id)} onDoubleLike={() => handleDoubleLike(clip)} />
                <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-36 bg-linear-to-b from-black/55 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-[48%] bg-linear-to-t from-black/95 via-black/45 to-transparent" />
                

                <aside className="absolute bottom-24 right-3 z-40 flex flex-col items-center gap-4 sm:right-4">
                  <ReelAction onClick={() => setOptionsClip(clip)} ariaLabel="More clip options" label="More" icon={<MoreIcon />} />
                  <ReelAction active={clip.viewerLiked} disabled={updatingClips.has(`${clip._id}-like`)} onClick={() => void handleLike(clip._id)} ariaLabel={clip.viewerLiked ? "Unlike clip" : "Like clip"} label={formatCount(likesCount)} icon={<HeartIcon filled={clip.viewerLiked} />} />
                  <ReelAction onClick={() => setCommentsClip(clip)} ariaLabel="Open clip comments" label={formatCount(clip.commentsCount || 0)} icon={<CommentIcon />} />
                  <ReelMetric value={formatCount(viewsCount)} icon={<EyeIcon />} />
                  <ReelAction onClick={() => setSharingClip(clip)} ariaLabel="Share clip in a message" label={formatCount(clip.shares || 0)} icon={<ShareIcon />} />
                  <Link href={clip.user?.username ? `/profile/${clip.user.username}` : "#"} aria-label={`Visit ${username}'s profile`} className="mt-1 rounded-full bg-linear-to-tr from-amber-400 via-red-500 to-fuchsia-600 p-0.5 shadow-lg transition hover:scale-105 active:scale-95">
                    <Image src={avatar} alt={username} width={48} height={48} unoptimized className="h-11 w-11 rounded-full border-2 border-black object-cover" />
                  </Link>
                </aside>

                <div className="absolute bottom-5 left-4 right-20 z-40 sm:bottom-6">
                  <Link href={clip.user?.username ? `/profile/${clip.user.username}` : "#"} className="inline-flex items-center gap-2.5 rounded-full pr-3 transition hover:bg-white/10">
                    <Image src={avatar} alt={username} width={38} height={38} unoptimized className="h-9 w-9 rounded-full border border-white/25 object-cover" />
                    <span className="max-w-44 truncate text-sm font-black drop-shadow-lg">@{username}</span>
                  </Link>
                  {clip.caption && <p className="mt-3 line-clamp-3 max-w-sm text-[13px] leading-5 text-white/95 drop-shadow-lg sm:text-sm">{clip.caption}</p>}
                  <div className="mt-3 inline-flex max-w-[250px] items-center gap-2 rounded-full bg-black/20 px-2.5 py-1.5 text-xs text-white/75 backdrop-blur-sm">
                    <MusicIcon />
                    <span className="truncate">Original audio · @{username}</span>
                  </div>
                </div>
              </motion.div>
            </article>
          );
        })}
      </section>

      <AnimatePresence>
        {commentsClip && (
          <ClipCommentsDialog
            clip={commentsClip}
            onClose={() => setCommentsClip(null)}
            onCommentAdded={() => {
              setClips((current) => current.map((item) => item._id === commentsClip._id ? { ...item, commentsCount: Number(item.commentsCount || 0) + 1 } : item));
              setCommentsClip((current) => current ? { ...current, commentsCount: Number(current.commentsCount || 0) + 1 } : current);
            }}
          />
        )}
        {sharingClip && (
          <ClipShareDialog
            clip={sharingClip}
            onClose={() => setSharingClip(null)}
            onShared={(data) => {
              setClips((current) => current.map((item) => item._id === sharingClip._id ? { ...item, shares: Number(data.shares || item.shares || 0) } : item));
              setNotice("Clip sent in messages");
              window.setTimeout(() => setNotice(""), 1800);
            }}
          />
        )}
        {optionsClip && (
          <ClipOptions clip={optionsClip} onClose={() => setOptionsClip(null)} onPreference={(action) => void handlePreference(action)} onSave={() => void handleSave()} />
        )}
      </AnimatePresence>
    </main>
  );
}
