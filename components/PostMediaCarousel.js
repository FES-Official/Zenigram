"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

const SLIDER_STYLES = new Set([
  "classic",
  "fade",
  "stack",
  "filmstrip",
  "zoom",
  "flip",
  "cube",
]);

const CAROUSEL_THEMES = {
  red: {
    activeDot: "bg-red-400",
    activeRing: "ring-red-400",
    retryButton:
      "border-red-800/70 bg-red-950/50 text-red-100 hover:bg-red-900/60",
    stackBack: "bg-red-950/65",
  },
  blue: {
    activeDot: "bg-blue-400",
    activeRing: "ring-blue-400",
    retryButton:
      "border-blue-800/70 bg-blue-950/50 text-blue-100 hover:bg-blue-900/60",
    stackBack: "bg-blue-950/65",
  },
  violet: {
    activeDot: "bg-violet-400",
    activeRing: "ring-violet-400",
    retryButton:
      "border-violet-800/70 bg-violet-950/50 text-violet-100 hover:bg-violet-900/60",
    stackBack: "bg-violet-950/65",
  },
  emerald: {
    activeDot: "bg-emerald-400",
    activeRing: "ring-emerald-400",
    retryButton:
      "border-emerald-800/70 bg-emerald-950/50 text-emerald-100 hover:bg-emerald-900/60",
    stackBack: "bg-emerald-950/65",
  },
};

/* -------------------------------------------------------------------------- */
/*                              Media utilities                               */
/* -------------------------------------------------------------------------- */

function inferMediaType(item, url = "") {
  const declaredType = String(
    item?.type || item?.mediaType || item?.mimeType || "",
  ).toLowerCase();

  if (declaredType === "video" || declaredType.startsWith("video/")) {
    return "video";
  }

  if (declaredType === "image" || declaredType.startsWith("image/")) {
    return "image";
  }

  return /\.(?:mp4|mov|m4v|webm|ogg)(?:$|\?)/i.test(url) ? "video" : "image";
}

function normalizeMediaItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const url = item.trim();

    if (!url) return null;

    return {
      url,
      type: inferMediaType(null, url),
      key: "",
      provider: "",
    };
  }

  const url = String(
    item.url || item.mediaUrl || item.secure_url || item.src || "",
  ).trim();

  if (!url) return null;

  return {
    ...item,
    url,
    type: inferMediaType(item, url),
    key: item.key || item.publicId || item.mediaPublicId || "",
    provider: item.provider || item.mediaProvider || "",
  };
}

export function getPostMediaItems(post) {
  if (Array.isArray(post?.mediaItems) && post.mediaItems.length > 0) {
    return post.mediaItems.map(normalizeMediaItem).filter(Boolean);
  }

  const legacyItem = normalizeMediaItem({
    url: post?.mediaUrl,
    type: post?.mediaType,
    key: post?.mediaPublicId || "",
    provider: post?.mediaProvider || "",
    alt: post?.caption || "",
  });

  return legacyItem ? [legacyItem] : [];
}

/* -------------------------------------------------------------------------- */
/*                                Animations                                  */
/* -------------------------------------------------------------------------- */

function animationFor(style, direction) {
  switch (style) {
    case "fade":
      return {
        initial: {
          opacity: 0,
        },
        animate: {
          opacity: 1,
        },
        exit: {
          opacity: 0,
        },
      };

    case "stack":
      return {
        initial: {
          opacity: 0,
          scale: 0.92,
          rotate: direction * 3,
          y: 8,
        },
        animate: {
          opacity: 1,
          scale: 1,
          rotate: 0,
          y: 0,
        },
        exit: {
          opacity: 0,
          scale: 1.04,
          rotate: direction * -2,
          y: -5,
        },
      };

    case "filmstrip":
      return {
        initial: {
          opacity: 0,
          x: direction * 120,
        },
        animate: {
          opacity: 1,
          x: 0,
        },
        exit: {
          opacity: 0,
          x: direction * -120,
        },
      };

    case "zoom":
      return {
        initial: {
          opacity: 0,
          scale: direction > 0 ? 1.18 : 0.88,
        },
        animate: {
          opacity: 1,
          scale: 1,
        },
        exit: {
          opacity: 0,
          scale: direction > 0 ? 0.88 : 1.18,
        },
      };

    case "flip":
      return {
        initial: {
          opacity: 0,
          rotateY: direction * 80,
          scale: 0.95,
        },
        animate: {
          opacity: 1,
          rotateY: 0,
          scale: 1,
        },
        exit: {
          opacity: 0,
          rotateY: direction * -80,
          scale: 0.95,
        },
      };

    case "cube":
      return {
        initial: {
          opacity: 0,
          rotateY: direction * 90,
          x: direction * 40,
          transformOrigin: direction > 0 ? "right center" : "left center",
        },
        animate: {
          opacity: 1,
          rotateY: 0,
          x: 0,
        },
        exit: {
          opacity: 0,
          rotateY: direction * -90,
          x: direction * -40,
          transformOrigin: direction > 0 ? "left center" : "right center",
        },
      };

    case "classic":
    default:
      return {
        initial: {
          opacity: 0.7,
          x: direction * 60,
        },
        animate: {
          opacity: 1,
          x: 0,
        },
        exit: {
          opacity: 0.7,
          x: direction * -60,
        },
      };
  }
}

/* -------------------------------------------------------------------------- */
/*                              Arrow icon                                    */
/* -------------------------------------------------------------------------- */

function ChevronIcon({ direction }) {
  const rotate = direction === "right" ? "rotate-180" : "";

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-5 w-5 ${rotate}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                             Carousel component                             */
/* -------------------------------------------------------------------------- */

export default function PostMediaCarousel({
  post,

  // Layout
  className = "",
  aspectRatioClassName = "aspect-square",

  backgroundClassName = "bg-black",

  // Media styling
  imageClassName = "object-contain",
  videoClassName = "object-contain",
  sizes = "full",
  fill = true,
  unoptimized = true,

  // Controls
  showCounter = true,
  showArrows = true,
  showIndicators = true,
  enableSwipe = true,

  // Theme: red | blue | violet | emerald
  theme = "red",

  // Events
  onMediaError,
  onRetry,
  onIndexChange,
}) {
  const mediaItems = useMemo(() => getPostMediaItems(post), [post]);

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const [failedMedia, setFailedMedia] = useState(() => new Set());

  const [retryVersion, setRetryVersion] = useState(0);

  const mediaSignature = useMemo(
    () =>
      mediaItems
        .map((media, mediaIndex) => `${mediaIndex}:${media.url}:${media.type}`)
        .join("|"),
    [mediaItems],
  );

  /*
   * Reset the carousel whenever the underlying media changes.
   *
   * This fixes the case where:
   * Post A has 6 images and is currently on image #6,
   * then Post B only has 2 images.
   */
  useEffect(() => {
    setIndex(0);
    setDirection(1);
    setFailedMedia(new Set());
    setRetryVersion(0);
  }, [mediaSignature]);

  const mediaCount = mediaItems.length;

  const displayIndex = mediaCount > 0 ? Math.min(index, mediaCount - 1) : 0;

  const item = mediaItems[displayIndex];

  const sliderStyle = SLIDER_STYLES.has(post?.carouselStyle)
    ? post.carouselStyle
    : "classic";

  const selectedTheme = CAROUSEL_THEMES[theme] || CAROUSEL_THEMES.red;

  const hasMany = mediaCount > 1;

  const currentMediaKey = item ? `${displayIndex}:${item.url}` : "";

  const hasCurrentMediaFailed = failedMedia.has(currentMediaKey);

  /* ---------------------------------------------------------------------- */
  /*                              Navigation                                */
  /* ---------------------------------------------------------------------- */

  const goTo = useCallback(
    (nextIndex, requestedDirection) => {
      if (mediaCount <= 1) return;

      const wrappedIndex = ((nextIndex % mediaCount) + mediaCount) % mediaCount;

      let nextDirection = requestedDirection;

      if (!nextDirection) {
        nextDirection = nextIndex >= displayIndex ? 1 : -1;
      }

      setDirection(nextDirection);
      setIndex(wrappedIndex);

      onIndexChange?.(wrappedIndex, mediaItems[wrappedIndex]);
    },
    [displayIndex, mediaCount, mediaItems, onIndexChange],
  );

  const goPrevious = useCallback(() => {
    goTo(displayIndex - 1, -1);
  }, [displayIndex, goTo]);

  const goNext = useCallback(() => {
    goTo(displayIndex + 1, 1);
  }, [displayIndex, goTo]);

  /* ---------------------------------------------------------------------- */
  /*                            Error handling                              */
  /* ---------------------------------------------------------------------- */

  const handleMediaError = useCallback(() => {
    if (!item) return;

    setFailedMedia((current) => {
      const next = new Set(current);
      next.add(currentMediaKey);
      return next;
    });

    onMediaError?.(item, displayIndex);
  }, [currentMediaKey, displayIndex, item, onMediaError]);

  const handleMediaLoaded = useCallback(() => {
    setFailedMedia((current) => {
      if (!current.has(currentMediaKey)) {
        return current;
      }

      const next = new Set(current);
      next.delete(currentMediaKey);

      return next;
    });
  }, [currentMediaKey]);

  const retryMedia = useCallback(async () => {
    if (!item) return;

    setFailedMedia((current) => {
      const next = new Set(current);
      next.delete(currentMediaKey);
      return next;
    });

    try {
      await onRetry?.(item, displayIndex);
    } catch (error) {
      console.error("Failed to retry carousel media:", error);
    } finally {
      /*
       * Change the React key so the image/video is
       * actually remounted and requested again.
       */
      setRetryVersion((current) => current + 1);
    }
  }, [currentMediaKey, displayIndex, item, onRetry]);

  /* ---------------------------------------------------------------------- */
  /*                         Keyboard navigation                            */
  /* ---------------------------------------------------------------------- */

  const handleKeyDown = useCallback(
    (event) => {
      // Only intercept keys when the carousel itself
      // has focus, not video controls or buttons.
      if (event.target !== event.currentTarget) {
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    },
    [goNext, goPrevious],
  );

  /* ---------------------------------------------------------------------- */
  /*                                 Empty                                  */
  /* ---------------------------------------------------------------------- */

  if (!item) {
    return null;
  }

  const animation = animationFor(sliderStyle, direction);

  const mediaAlt =
    item.alt || post?.caption || `Post media ${displayIndex + 1}`;

  /* ---------------------------------------------------------------------- */
  /*                                 Render                                 */
  /* ---------------------------------------------------------------------- */

  return (
    <div
      className={[
        "group relative isolate overflow-hidden perspective-distant",
        backgroundClassName,
        aspectRatioClassName,

        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-slider-style={sliderStyle}
      data-media-index={displayIndex}
      role="region"
      aria-roledescription="carousel"
      aria-label="Post media"
      tabIndex={hasMany ? 0 : undefined}
      onKeyDown={handleKeyDown}
    >
      {/* -------------------------------------------------------------- */}
      {/* Stack decoration                                               */}
      {/* -------------------------------------------------------------- */}

      {sliderStyle === "stack" && hasMany && (
        <>
          <div
            aria-hidden="true"
            className={[
              "absolute inset-5 rotate-3 rounded-3xl",
              selectedTheme.stackBack,
            ].join(" ")}
          />

          <div
            aria-hidden="true"
            className="absolute inset-2 -rotate-2 rounded-3xl bg-zinc-900"
          />
        </>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Main media                                                     */}
      {/* -------------------------------------------------------------- */}

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div
          key={`${currentMediaKey}-${retryVersion}`}
          initial={animation.initial}
          animate={animation.animate}
          exit={animation.exit}
          transition={{
            duration: sliderStyle === "fade" ? 0.42 : 0.32,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="absolute inset-0 z-1 transform-3d"
          drag={enableSwipe && hasMany && item.type !== "video" ? "x" : false}
          dragConstraints={{
            left: 0,
            right: 0,
          }}
          dragElastic={0.08}
          onDragEnd={(_, info) => {
            const swipeDistance = 55;
            const swipeVelocity = 400;

            const shouldGoNext =
              info.offset.x < -swipeDistance ||
              info.velocity.x < -swipeVelocity;

            const shouldGoPrevious =
              info.offset.x > swipeDistance || info.velocity.x > swipeVelocity;

            if (shouldGoNext) {
              goNext();
            } else if (shouldGoPrevious) {
              goPrevious();
            }
          }}
          style={{
            touchAction: "pan-y",
          }}
          aria-live="polite"
        >
          {item.type === "video" ? (
            <video
              src={item.url}
              poster={item.poster || undefined}
              controls
              playsInline
              preload="metadata"
              onError={handleMediaError}
              onLoadedData={handleMediaLoaded}
              className={["h-full w-full", videoClassName]
                .filter(Boolean)
                .join(" ")}
            />
          ) : fill ? (
            <Image
              src={item.url}
              alt={mediaAlt}
              fill
              unoptimized={unoptimized}
              sizes={sizes}
              onError={handleMediaError}
              onLoad={handleMediaLoaded}
              className={imageClassName}
            />
          ) : (
            <Image
              src={item.url}
              alt={mediaAlt}
              width={900}
              height={900}
              unoptimized={unoptimized}
              sizes={sizes}
              onError={handleMediaError}
              onLoad={handleMediaLoaded}
              className={["h-full w-full", imageClassName]
                .filter(Boolean)
                .join(" ")}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* -------------------------------------------------------------- */}
      {/* Failed media overlay                                           */}
      {/* -------------------------------------------------------------- */}

      {hasCurrentMediaFailed && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-950/95 px-6 text-center">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-white/5 text-xl text-zinc-400">
            !
          </div>

          <div>
            <p className="text-sm font-semibold text-zinc-200">
              Media unavailable
            </p>

            <p className="mt-1 text-xs text-zinc-500">
              This media could not be loaded.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void retryMedia()}
            className={[
              "rounded-full border px-4 py-2",
              "text-xs font-semibold",
              "transition-colors",
              "focus-visible:outline-none",
              "focus-visible:ring-2",
              "focus-visible:ring-white/80",
              selectedTheme.retryButton,
            ].join(" ")}
          >
            Try again
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Counter                                                        */}
      {/* -------------------------------------------------------------- */}

      {hasMany && showCounter && (
        <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur-md">
          {displayIndex + 1}
          <span className="mx-1 text-white/40">/</span>
          {mediaCount}
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Previous / next arrows                                         */}
      {/* -------------------------------------------------------------- */}

      {hasMany && showArrows && (
        <>
          <button
            type="button"
            onClick={goPrevious}
            aria-label="Previous media"
            className={[
              "absolute left-3 top-1/2 z-20",
              "grid h-10 w-10",
              "-translate-y-1/2 place-items-center",
              "rounded-full",
              "bg-black/55 text-white",
              "shadow-lg backdrop-blur-md",
              "transition",
              "hover:scale-105 hover:bg-black/80",
              "active:scale-95",
              "focus-visible:outline-none",
              "focus-visible:ring-2",
              "focus-visible:ring-white",
              "sm:opacity-0",
              "sm:group-hover:opacity-100",
              "sm:group-focus-within:opacity-100",
            ].join(" ")}
          >
            <ChevronIcon direction="left" />
          </button>

          <button
            type="button"
            onClick={goNext}
            aria-label="Next media"
            className={[
              "absolute right-3 top-1/2 z-20",
              "grid h-10 w-10",
              "-translate-y-1/2 place-items-center",
              "rounded-full",
              "bg-black/55 text-white",
              "shadow-lg backdrop-blur-md",
              "transition",
              "hover:scale-105 hover:bg-black/80",
              "active:scale-95",
              "focus-visible:outline-none",
              "focus-visible:ring-2",
              "focus-visible:ring-white",
              "sm:opacity-0",
              "sm:group-hover:opacity-100",
              "sm:group-focus-within:opacity-100",
            ].join(" ")}
          >
            <ChevronIcon direction="right" />
          </button>
        </>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Filmstrip                                                      */}
      {/* -------------------------------------------------------------- */}

      {hasMany && showIndicators && sliderStyle === "filmstrip" && (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex gap-1.5 overflow-x-auto rounded-2xl bg-black/65 p-2 shadow-xl backdrop-blur-md">
          {mediaItems.map((media, mediaIndex) => {
            const isActive = mediaIndex === displayIndex;

            return (
              <button
                key={`${media.url}-${mediaIndex}`}
                type="button"
                onClick={() => goTo(mediaIndex)}
                aria-label={`Show media ${mediaIndex + 1}`}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "relative h-12 min-w-12 flex-1",
                  "overflow-hidden rounded-xl",
                  "bg-zinc-900",
                  "transition-all duration-200",
                  "focus-visible:outline-none",
                  "focus-visible:ring-2",
                  "focus-visible:ring-white",
                  isActive
                    ? `ring-2 ${selectedTheme.activeRing} opacity-100`
                    : "opacity-50 hover:opacity-90",
                ].join(" ")}
              >
                {media.type === "image" ? (
                  <Image
                    src={media.url}
                    alt=""
                    fill
                    unoptimized={unoptimized}
                    sizes="100px"
                    className="object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-zinc-900 text-[9px] font-bold tracking-wider text-zinc-300">
                    VIDEO
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* Standard pagination dots                                       */}
      {/* -------------------------------------------------------------- */}

      {hasMany && showIndicators && sliderStyle !== "filmstrip" && (
        <div
          className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/25 px-2 py-1.5 backdrop-blur-sm"
          role="group"
          aria-label="Choose media"
        >
          {mediaItems.map((media, dotIndex) => {
            const isActive = dotIndex === displayIndex;

            return (
              <button
                key={`${media.url}-${dotIndex}`}
                type="button"
                onClick={() => goTo(dotIndex)}
                aria-label={`Show media ${dotIndex + 1}`}
                aria-current={isActive ? "true" : undefined}
                className={[
                  "h-1.5 rounded-full",
                  "transition-all duration-300",
                  "focus-visible:outline-none",
                  "focus-visible:ring-2",
                  "focus-visible:ring-white",
                  isActive
                    ? `w-5 ${selectedTheme.activeDot}`
                    : "w-1.5 bg-white/45 hover:bg-white/80",
                ].join(" ")}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
