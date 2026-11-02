
"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ---------------------------------
   FILTERS
---------------------------------- */

const FILTERS = {
  none: "none",
  cinema: "contrast(1.15) saturate(.9) brightness(.92)",
  warm: "sepia(.2) saturate(1.15) brightness(1.04)",
  cool: "hue-rotate(185deg) saturate(.85)",
  mono: "grayscale(1) contrast(1.15)",
};

const MIN_SEGMENT_DURATION = 0.5;
const DEFAULT_IMAGE_DURATION = 5;
const DEFAULT_VIDEO_DURATION = 15;

const clamp = (value, min, max) =>
  Math.min(Math.max(value, min), max);

function toFiniteNumber(value, fallback = 0) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

/* ---------------------------------
   ICONS
---------------------------------- */

function VolumeIcon({ muted }) {
  return muted ? (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4Z" />
      <path d="m22 9-6 6M16 9l6 6" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M11 5 6 9H2v6h4l5 4Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="ml-1 h-9 w-9"
      aria-hidden="true"
    >
      <path d="M8 5v14l11-7Z" />
    </svg>
  );
}

/* ---------------------------------
   MEDIA HELPERS
---------------------------------- */

function normalizeMediaType(type, url) {
  const normalizedType = String(type || "").toLowerCase();

  if (
    normalizedType === "video" ||
    normalizedType.startsWith("video/")
  ) {
    return "video";
  }

  // Infer video type from common file extensions
  if (
    /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url || "")
  ) {
    return "video";
  }

  return "image";
}

/*
  Builds a sequential timeline from mediaItems.

  Each entry contains:
  - start
  - end
  - duration
  - type
  - url
*/

function buildEntries(clip) {
  const mediaItems =
    Array.isArray(clip?.mediaItems) &&
    clip.mediaItems.length > 0
      ? clip.mediaItems
      : clip?.mediaUrl
        ? [
            {
              url: clip.mediaUrl,
              type: clip.mediaType,
            },
          ]
        : [];

  const clipId = String(
    clip?._id ?? clip?.id ?? clip?.slug ?? "clip"
  );

  const entries = [];
  let cursor = 0;

  mediaItems.forEach((item, index) => {
    if (!item || typeof item !== "object") return;

    const settings = Array.isArray(clip?.timeline)
      ? clip.timeline[index] || {}
      : {};

    const merged = {
      ...item,
      ...settings,
    };

    const url =
      typeof merged.url === "string"
        ? merged.url.trim()
        : "";

    // Ignore entries without a valid media URL
    if (!url) return;

    const type = normalizeMediaType(
      merged.type,
      url
    );

    const defaultDuration =
      type === "image"
        ? DEFAULT_IMAGE_DURATION
        : DEFAULT_VIDEO_DURATION;

    /*
      clip.duration is used as a fallback only
      when there is a single media item.

      Multiple media items should use their own
      timeline or item durations.
    */

    const preferredDuration =
      settings.duration ??
      item.duration ??
      (mediaItems.length === 1
        ? clip?.duration
        : undefined);

    const duration = Math.max(
      MIN_SEGMENT_DURATION,
      toFiniteNumber(
        preferredDuration,
        defaultDuration
      )
    );

    const start = cursor;
    const end = start + duration;

    entries.push({
      ...merged,
      id: `${clipId}-${index}`,
      url,
      type,
      start,
      end,
      duration,
    });

    cursor = end;
  });

  return entries;
}

/* ---------------------------------
   VIDEO HELPERS
---------------------------------- */

function getVideoTargetTime(entry, playbackTime) {
  const trimStart = Math.max(
    0,
    toFiniteNumber(entry.trimStart, 0)
  );

  const elapsed = clamp(
    playbackTime - entry.start,
    0,
    entry.duration
  );

  return trimStart + elapsed;
}

function seekVideo(video, entry, playbackTime, threshold = 0.65) {
  if (!video || !entry || video.readyState < 1) {
    return;
  }

  const target = getVideoTargetTime(
    entry,
    playbackTime
  );

  if (!Number.isFinite(target)) return;

  try {
    if (
      Math.abs(video.currentTime - target) > threshold
    ) {
      video.currentTime = target;
    }
  } catch {
    // Some browsers may reject seeking before
    // the media is fully ready.
  }
}

/* ---------------------------------
   TEXT LAYER HELPERS
---------------------------------- */

function getTextLayerStyle(layer) {
  const x = clamp(
    toFiniteNumber(layer.x, 50),
    0,
    100
  );

  const y = clamp(
    toFiniteNumber(layer.y, 50),
    0,
    100
  );

  const fontSize = clamp(
    toFiniteNumber(layer.size, 24),
    8,
    128
  );

  const rotation = toFiniteNumber(
    layer.rotation,
    0
  );

  const borderWidth = clamp(
    toFiniteNumber(layer.borderWidth, 2),
    0,
    8
  );

  const textDecoration = [
    layer.underline && "underline",
    layer.strike && "line-through",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    left: `${x}%`,
    top: `${y}%`,
    fontSize: `${fontSize}px`,
    color:
      typeof layer.color === "string"
        ? layer.color
        : "#ffffff",
    background: layer.background
      ? layer.backgroundColor ||
        "rgba(0,0,0,.55)"
      : "transparent",
    border: layer.showBorder
      ? `${borderWidth}px solid ${
          layer.borderColor || "#ffffff"
        }`
      : "none",
    transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    fontFamily: layer.fontFamily || "Arial",
    fontWeight: layer.fontWeight || 700,
    fontStyle: layer.italic ? "italic" : "normal",
    textDecoration: textDecoration || "none",
    textShadow: "0 2px 12px #000",
  };
}

/* ---------------------------------
   MAIN COMPONENT
---------------------------------- */

export default function ClipReelPlayer({
  clip,
  isActive,
  muted,
  onMutedChange,
  onFirstPlay,
  onDoubleLike,
}) {
  /* ---------------------------------
     REFS
  ---------------------------------- */

  const videoRef = useRef(null);

  const viewedRef = useRef(false);

  const playbackAnchorRef = useRef(0);

  const totalRef = useRef(0);
  const timeRef = useRef(0);

  const onFirstPlayRef = useRef(onFirstPlay);

  const previousClipIdRef = useRef(
    String(clip?._id ?? clip?.id ?? clip?.slug ?? "clip")
  );

  const tapTimerRef = useRef(null);
  const likeTimerRef = useRef(null);

  /* ---------------------------------
     STATE
  ---------------------------------- */

  const [time, setTime] = useState(0);

  const [pausedByUser, setPausedByUser] =
    useState(false);

  const [pageVisible, setPageVisible] =
    useState(true);

  const [likeBurst, setLikeBurst] =
    useState(false);

  /* ---------------------------------
     CLIP DATA
  ---------------------------------- */

  const clipId = String(
    clip?._id ?? clip?.id ?? clip?.slug ?? "clip"
  );

  const entries = useMemo(
    () => buildEntries(clip),
    [clip]
  );

  // Total duration comes from the actual timeline.
  const total = entries.length
    ? entries[entries.length - 1].end
    : 0;

  totalRef.current = total;
  timeRef.current = time;

  const activeEntry = useMemo(() => {
    if (!entries.length || total <= 0) {
      return null;
    }

    const safeTime = clamp(
      time,
      0,
      Math.max(0, total - 0.001)
    );

    return (
      entries.find(
        (entry) =>
          safeTime >= entry.start &&
          safeTime < entry.end
      ) || entries[0]
    );
  }, [entries, time, total]);

  const playing = Boolean(
    isActive &&
    pageVisible &&
    !pausedByUser &&
    total > 0 &&
    activeEntry
  );

  // Keep the video segment stable while the playhead advances within it.
  // Otherwise video effects would re-run on every 20 FPS clock update.
  const activeEntryId = activeEntry?.id;
  const activeEntryUrl = activeEntry?.url;
  const activeEntryType = activeEntry?.type;
  const activeEntryStart = activeEntry?.start;
  const activeEntryDuration = activeEntry?.duration;
  const activeEntryTrimStart = activeEntry?.trimStart;

  const videoEntry = useMemo(() => {
    if (!activeEntryId) return null;
    return {
      id: activeEntryId,
      url: activeEntryUrl,
      type: activeEntryType,
      start: activeEntryStart,
      duration: activeEntryDuration,
      trimStart: activeEntryTrimStart,
    };
  }, [
    activeEntryId,
    activeEntryUrl,
    activeEntryType,
    activeEntryStart,
    activeEntryDuration,
    activeEntryTrimStart,
  ]);

  const transition = [
    "fade",
    "cut",
    "slide",
    "zoom",
  ].includes(clip?.transition)
    ? clip.transition
    : "fade";

  const imageAlt =
    typeof clip?.caption === "string" &&
    clip.caption.trim()
      ? clip.caption
      : "Zenigram clip";

  /* ---------------------------------
     CALLBACK REFS
  ---------------------------------- */

  useEffect(() => {
    onFirstPlayRef.current = onFirstPlay;
  }, [onFirstPlay]);

  /* ---------------------------------
     PAGE VISIBILITY
  ---------------------------------- */

  useEffect(() => {
    const handleVisibility = () => {
      setPageVisible(!document.hidden);
    };

    handleVisibility();

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, []);

  /* ---------------------------------
     RESET WHEN CLIP CHANGES
  ---------------------------------- */

  useEffect(() => {
    const clipChanged =
      previousClipIdRef.current !== clipId;

    if (clipChanged) {
      previousClipIdRef.current = clipId;
      viewedRef.current = false;
    }

    if (!isActive) {
      setPausedByUser(false);
      setTime(0);
      return;
    }

    setPausedByUser(false);
    setTime(0);

    playbackAnchorRef.current = performance.now();
  }, [isActive, clipId]);

  /* ---------------------------------
     FIRST PLAY CALLBACK
  ---------------------------------- */

  useEffect(() => {
    if (
      !playing ||
      document.hidden ||
      viewedRef.current
    ) {
      return;
    }

    viewedRef.current = true;

    onFirstPlayRef.current?.();
  }, [playing, clipId]);

  /* ---------------------------------
     PLAYBACK ENGINE
  ---------------------------------- */

  useEffect(() => {
    if (!playing) return undefined;

    /*
      Start from the current playhead.
      This also handles resuming after
      a manual pause or tab visibility change.
    */

    playbackAnchorRef.current =
      performance.now() - timeRef.current * 1000;

    let animationFrame = null;
    let lastUpdate = 0;

    const tick = (now) => {
      const duration = totalRef.current;

      if (duration <= 0) return;

      const elapsed = Math.max(
        0,
        (now - playbackAnchorRef.current) / 1000
      );

      const nextTime = elapsed % duration;

      // Keep the playback clock stable across loops.
      if (elapsed >= duration) {
        playbackAnchorRef.current =
          now - nextTime * 1000;
      }

      /*
        Update React state at 20 FPS instead
        of rendering on every animation frame.
      */

      if (now - lastUpdate >= 50) {
        setTime(nextTime);
        lastUpdate = now;
      }

      animationFrame =
        window.requestAnimationFrame(tick);
    };

    animationFrame =
      window.requestAnimationFrame(tick);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(
          animationFrame
        );
      }
    };
  }, [playing]);

  /* ---------------------------------
     VIDEO SEEK ON ENTRY CHANGE
  ---------------------------------- */

  useEffect(() => {
    const video = videoRef.current;

    if (
      !video ||
      videoEntry?.type !== "video"
    ) {
      return undefined;
    }

    const handleLoadedMetadata = () => {
      seekVideo(
        video,
        activeEntry,
        timeRef.current,
        0.1
      );
    };

    if (video.readyState >= 1) {
      handleLoadedMetadata();
    } else {
      video.addEventListener(
        "loadedmetadata",
        handleLoadedMetadata
      );

      return () => {
        video.removeEventListener(
          "loadedmetadata",
          handleLoadedMetadata
        );
      };
    }

    return undefined;
  }, [videoEntry]);

  /* ---------------------------------
     VIDEO PLAY / PAUSE
  ---------------------------------- */

  useEffect(() => {
    const video = videoRef.current;

    if (
      !video ||
      activeEntry?.type !== "video"
    ) {
      return;
    }

    video.muted = Boolean(muted);

    if (!playing) {
      video.pause();
      return;
    }

    // Synchronize before resuming playback.
    seekVideo(
      video,
      videoEntry,
      timeRef.current,
      0.5
    );

    const playPromise = video.play();

    if (playPromise?.catch) {
      playPromise.catch(() => {
        // Autoplay may be blocked by the browser.
        // The user can still start playback manually.
      });
    }
  }, [videoEntry, playing, muted]);

  /* ---------------------------------
     VIDEO DRIFT CORRECTION
  ---------------------------------- */

  useEffect(() => {
    const video = videoRef.current;

    if (
      !playing ||
      !video ||
      activeEntry?.type !== "video"
    ) {
      return;
    }

    seekVideo(
      video,
      videoEntry,
      time,
      0.75
    );
  }, [time, videoEntry, playing]);

  /* ---------------------------------
     PLAY / PAUSE
  ---------------------------------- */

  const togglePlayback = useCallback(() => {
    if (!isActive) return;

    setPausedByUser((currentlyPaused) => {
      // Reset the clock when resuming.
      if (currentlyPaused) {
        playbackAnchorRef.current =
          performance.now() -
          timeRef.current * 1000;
      }

      return !currentlyPaused;
    });
  }, [isActive]);

  /* ---------------------------------
     TAP / DOUBLE TAP
  ---------------------------------- */

  const handleMediaTap = useCallback(() => {
    if (!isActive || !activeEntry) return;

    /*
      If a single-tap timer already exists,
      the second tap is a double tap.

      This prevents a double tap from also
      triggering the pause action.
    */

    if (tapTimerRef.current !== null) {
      window.clearTimeout(tapTimerRef.current);

      tapTimerRef.current = null;

      setLikeBurst(true);

      if (likeTimerRef.current !== null) {
        window.clearTimeout(
          likeTimerRef.current
        );
      }

      likeTimerRef.current = window.setTimeout(
        () => {
          setLikeBurst(false);
          likeTimerRef.current = null;
        },
        750
      );

      onDoubleLike?.();

      return;
    }

    // Wait briefly to distinguish a single tap.
    tapTimerRef.current = window.setTimeout(
      () => {
        togglePlayback();
        tapTimerRef.current = null;
      },
      280
    );
  }, [
    isActive,
    activeEntry,
    onDoubleLike,
    togglePlayback,
  ]);

  /* ---------------------------------
     CLEANUP TIMERS
  ---------------------------------- */

  useEffect(() => {
    return () => {
      if (tapTimerRef.current !== null) {
        window.clearTimeout(tapTimerRef.current);
      }

      if (likeTimerRef.current !== null) {
        window.clearTimeout(likeTimerRef.current);
      }
    };
  }, []);

  /* ---------------------------------
     MUTE
  ---------------------------------- */

  const handleMute = useCallback(
    (event) => {
      event.stopPropagation();

      onMutedChange?.(!muted);
    },
    [muted, onMutedChange]
  );

  /* ---------------------------------
     TEXT LAYERS
  ---------------------------------- */

  const visibleText = useMemo(() => {
    const layers = Array.isArray(clip?.textLayers)
      ? clip.textLayers
      : [];

    return layers
      .map((layer, index) => ({
        layer,
        index,
      }))
      .filter(({ layer }) => {
        const start = toFiniteNumber(
          layer?.start,
          0
        );

        const end = toFiniteNumber(
          layer?.end,
          total
        );

        return time >= start && time <= end;
      });
  }, [clip?.textLayers, time, total]);

  /* ---------------------------------
     ANIMATION CONFIGURATION
  ---------------------------------- */

  const initialAnimation =
    transition === "cut"
      ? { opacity: 1 }
      : transition === "slide"
        ? { opacity: 0, x: 70 }
        : transition === "zoom"
          ? { opacity: 0, scale: 1.1 }
          : { opacity: 0 };

  const exitAnimation =
    transition === "slide"
      ? { opacity: 0, x: -50 }
      : transition === "zoom"
        ? { opacity: 0, scale: 1.05 }
        : { opacity: 0 };

  const animationTransition = {
    duration: transition === "cut" ? 0 : 0.25,
    ease: "easeOut",
  };

  /* ---------------------------------
     RENDER
  ---------------------------------- */

  return (
    <div className="relative h-full w-full overflow-hidden bg-zinc-950">

      {/* MEDIA */}

      <AnimatePresence
        initial={false}
        mode="sync"
      >
        {activeEntry && (
          <motion.div
            key={activeEntry.id}
            initial={initialAnimation}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
            }}
            exit={exitAnimation}
            transition={animationTransition}
            className="absolute inset-0"
          >
            {activeEntry.type === "video" ? (
              <video
                key={activeEntry.id}
                ref={videoRef}
                src={activeEntry.url}
                autoPlay={playing}
                muted={muted}
                playsInline
                preload={
                  isActive ? "auto" : "metadata"
                }
                className="h-full w-full object-cover"
                style={{
                  filter:
                    FILTERS[activeEntry.filter] ||
                    "none",
                }}
              />
            ) : (
              <Image
                src={activeEntry.url}
                alt={imageAlt}
                fill
                priority={isActive}
                unoptimized
                sizes="(max-width: 640px) 100vw, 500px"
                className="object-cover"
                style={{
                  filter:
                    FILTERS[activeEntry.filter] ||
                    "none",
                }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* EMPTY MEDIA STATE */}

      {!activeEntry && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
          No media available
        </div>
      )}

      {/* TEXT LAYERS */}

      {visibleText.map(({ layer, index }) => (
        <div
          key={
            layer.id ??
            `${index}-${layer.text ?? "text"}`
          }
          className="
            pointer-events-none
            absolute
            z-20
            max-w-[86%]
            break-words
            rounded-lg
            px-2
            py-1
            text-center
          "
          style={getTextLayerStyle(layer)}
        >
          {typeof layer.text === "string" ||
          typeof layer.text === "number"
            ? layer.text
            : ""}
        </div>
      ))}

      {/* MEDIA TAP AREA */}

      <button
        type="button"
        onClick={handleMediaTap}
        disabled={!isActive || !activeEntry}
        aria-label={
          playing ? "Pause clip" : "Play clip"
        }
        aria-pressed={playing}
        className="
          absolute
          inset-0
          z-10
          cursor-pointer
          disabled:cursor-default
        "
      >
        <span className="sr-only">
          {playing ? "Pause" : "Play"}
        </span>
      </button>

      {/* PLAY ICON */}

      <AnimatePresence>
        {!playing && isActive && activeEntry && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.75,
            }}
            animate={{
              opacity: 1,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              scale: 0.85,
            }}
            className="
              pointer-events-none
              absolute
              left-1/2
              top-1/2
              z-20
              grid
              h-20
              w-20
              -translate-x-1/2
              -translate-y-1/2
              place-items-center
              rounded-full
              bg-black/45
              text-white
              shadow-2xl
              backdrop-blur-md
            "
          >
            <PlayIcon />
          </motion.div>
        )}
      </AnimatePresence>

      {/* DOUBLE TAP LIKE ANIMATION */}

      <AnimatePresence>
        {likeBurst && (
          <motion.div
            initial={{
              opacity: 0,
              scale: 0.3,
              rotate: -14,
            }}
            animate={{
              opacity: 1,
              scale: 1.15,
              rotate: 0,
            }}
            exit={{
              opacity: 0,
              scale: 1.6,
            }}
            transition={{
              type: "spring",
              stiffness: 420,
              damping: 20,
            }}
            className="
              pointer-events-none
              absolute
              left-1/2
              top-1/2
              z-30
              -translate-x-1/2
              -translate-y-1/2
              text-8xl
              text-white
              drop-shadow-[0_10px_30px_rgba(239,68,68,.9)]
            "
            aria-hidden="true"
          >
            ♥
          </motion.div>
        )}
      </AnimatePresence>

      {/* MUTE BUTTON */}

      <button
        type="button"
        onClick={handleMute}
        aria-label={
          muted ? "Unmute clip" : "Mute clip"
        }
        aria-pressed={muted}
        className="
          absolute
          right-4
          top-16
          z-40
          grid
          h-10
          w-10
          place-items-center
          rounded-full
          border
          border-white/10
          bg-black/45
          text-white
          shadow-lg
          backdrop-blur-md
          transition
          hover:bg-black/65
          active:scale-90
          sm:top-4
        "
      >
        <VolumeIcon muted={muted} />
      </button>

    </div>
  );
}
