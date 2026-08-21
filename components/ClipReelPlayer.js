"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const FILTERS = {
  none: "none",
  cinema: "contrast(1.15) saturate(.9) brightness(.92)",
  warm: "sepia(.2) saturate(1.15) brightness(1.04)",
  cool: "hue-rotate(185deg) saturate(.85)",
  mono: "grayscale(1) contrast(1.15)",
};

function VolumeIcon({ muted }) {
  return muted ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4Z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path d="M11 5 6 9H2v6h4l5 4Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-9 w-9" aria-hidden="true">
      <path d="M8 5v14l11-7Z" />
    </svg>
  );
}

function buildEntries(clip) {
  const media = clip.mediaItems?.length
    ? clip.mediaItems
    : [{ url: clip.mediaUrl, type: clip.mediaType }];

  return media.reduce(
    (state, item, index) => {
      const settings = clip.timeline?.[index] || {};
      const fallbackDuration = item.type === "image" ? 5 : clip.duration || 15;
      const duration = Math.max(0.5, Number(settings.duration || fallbackDuration));
      const entry = {
        ...item,
        ...settings,
        id: `${clip._id}-${index}`,
        start: state.cursor,
        end: state.cursor + duration,
        duration,
      };

      return {
        cursor: entry.end,
        entries: [...state.entries, entry],
      };
    },
    { cursor: 0, entries: [] },
  ).entries;
}

export default function ClipReelPlayer({ clip, isActive, muted, onMutedChange, onFirstPlay, onDoubleLike }) {
  const videoRef = useRef(null);
  const viewedRef = useRef(false);
  const playbackAnchorRef = useRef(0);
  const onFirstPlayRef = useRef(onFirstPlay);
  const lastTapRef = useRef(0);
  const tapTimerRef = useRef(null);
  const [time, setTime] = useState(0);
  const [pausedByUser, setPausedByUser] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [likeBurst, setLikeBurst] = useState(false);

  const entries = useMemo(() => buildEntries(clip), [clip]);
  const total = Math.max(0, Number(clip.duration || entries.at(-1)?.end || 0));
  const activeEntry = entries.find((entry) => time >= entry.start && time < entry.end) || entries.at(-1);
  const playing = isActive && pageVisible && !pausedByUser && total > 0;

  useEffect(() => {
    onFirstPlayRef.current = onFirstPlay;
  }, [onFirstPlay]);

  useEffect(() => {
    const handleVisibility = () => setPageVisible(!document.hidden);
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(
    () => () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!isActive) {
      setPausedByUser(false);
      setTime(0);
      return;
    }

    setPausedByUser(false);
    setTime(0);
    playbackAnchorRef.current = performance.now();

    if (!viewedRef.current) {
      viewedRef.current = true;
      onFirstPlayRef.current?.();
    }
  }, [isActive]);

  useEffect(() => {
    if (!playing) return undefined;

    playbackAnchorRef.current = performance.now() - time * 1000;
    let animationFrame;

    const tick = (now) => {
      const elapsed = (now - playbackAnchorRef.current) / 1000;
      const next = total ? elapsed % total : 0;
      if (elapsed >= total) playbackAnchorRef.current = now - next * 1000;
      setTime(next);
      animationFrame = window.requestAnimationFrame(tick);
    };

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
    // The playback anchor keeps the animation stable without restarting on every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, total]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeEntry?.type !== "video") return;

    const target = Number(activeEntry.trimStart || 0) + Math.max(0, time - activeEntry.start);
    video.muted = muted;

    if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.45) {
      try {
        video.currentTime = target;
      } catch {
        // The next animation frame retries after metadata is available.
      }
    }

    if (playing) void video.play().catch(() => {});
    else video.pause();
  }, [activeEntry, muted, playing, time]);

  const togglePlayback = () => {
    if (!isActive) return;
    setPausedByUser((current) => {
      if (current) playbackAnchorRef.current = performance.now() - time * 1000;
      return !current;
    });
  };

  const handleMediaTap = () => {
    if (!isActive) return;
    const currentTap = Date.now();
    const isDoubleTap = currentTap - lastTapRef.current < 320;
    lastTapRef.current = currentTap;

    if (isDoubleTap) {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      lastTapRef.current = 0;
      setLikeBurst(true);
      onDoubleLike?.();
      window.setTimeout(() => setLikeBurst(false), 750);
      return;
    }

    tapTimerRef.current = window.setTimeout(() => {
      togglePlayback();
      tapTimerRef.current = null;
    }, 260);
  };

  const transition = clip.transition || "fade";
  const visibleText = (clip.textLayers || []).filter(
    (layer) => time >= Number(layer.start || 0) && time <= Number(layer.end || total),
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">
      <AnimatePresence mode="wait">
        {activeEntry && (
          <motion.div
            key={activeEntry.id}
            initial={transition === "cut" ? {} : transition === "slide" ? { opacity: 0, x: 70 } : transition === "zoom" ? { opacity: 0, scale: 1.1 } : { opacity: 0 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={transition === "cut" ? {} : { opacity: 0 }}
            transition={{ duration: transition === "cut" ? 0 : 0.25 }}
            className="absolute inset-0"
          >
            {activeEntry.type === "video" ? (
              <video
                ref={videoRef}
                src={activeEntry.url}
                autoPlay={isActive}
                playsInline
                preload={isActive ? "auto" : "metadata"}
                className="h-full w-full object-cover"
                style={{ filter: FILTERS[activeEntry.filter] || "none" }}
              />
            ) : (
              <Image
                src={activeEntry.url}
                alt={clip.caption || "Zenigram clip"}
                fill
                priority={isActive}
                unoptimized
                sizes="(max-width: 640px) 100vw, 500px"
                className="object-cover"
                style={{ filter: FILTERS[activeEntry.filter] || "none" }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {visibleText.map((layer) => (
        <div
          key={layer.id}
          className="pointer-events-none absolute z-20 max-w-[86%] rounded-lg px-2 py-1 text-center"
          style={{ left: `${layer.x}%`, top: `${layer.y}%`, fontSize: `${layer.size}px`, color: layer.color, background: layer.background ? layer.backgroundColor || "rgba(0,0,0,.55)" : "transparent", border: layer.showBorder ? `${layer.borderWidth || 2}px solid ${layer.borderColor || "#fff"}` : "none", transform: `translate(-50%,-50%) rotate(${layer.rotation || 0}deg)`, fontFamily: layer.fontFamily || "Arial", fontWeight: layer.fontWeight || 700, fontStyle: layer.italic ? "italic" : "normal", textDecoration: [layer.underline && "underline", layer.strike && "line-through"].filter(Boolean).join(" ") || "none", textShadow: "0 2px 12px #000" }}
        >
          {layer.text}
        </div>
      ))}

      <button type="button" onClick={handleMediaTap} aria-label={playing ? "Pause clip" : "Play clip"} className="absolute inset-0 z-10 cursor-pointer">
        <span className="sr-only">{playing ? "Pause" : "Play"}</span>
      </button>

      <AnimatePresence>
        {!playing && isActive && (
          <motion.div initial={{ opacity: 0, scale: 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} className="pointer-events-none absolute left-1/2 top-1/2 z-20 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-2xl backdrop-blur-md">
            <PlayIcon />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {likeBurst && (
          <motion.div
            initial={{ opacity: 0, scale: 0.3, rotate: -14 }}
            animate={{ opacity: 1, scale: 1.15, rotate: 0 }}
            exit={{ opacity: 0, scale: 1.6 }}
            transition={{ type: "spring", stiffness: 420, damping: 20 }}
            className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2 text-8xl text-white drop-shadow-[0_10px_30px_rgba(239,68,68,.9)]"
            aria-hidden="true"
          >
            ♥
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onMutedChange(!muted);
        }}
        aria-label={muted ? "Unmute clip" : "Mute clip"}
        className="absolute right-4 top-16 z-40 grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-black/45 text-white shadow-lg backdrop-blur-md transition hover:bg-black/65 active:scale-90 sm:top-4"
      >
        <VolumeIcon muted={muted} />
      </button>
    </div>
  );
}
