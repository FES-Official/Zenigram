"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { getPostMediaItems } from "./PostMediaCarousel";

export default function PostCard({ post, onClick }) {
  const mediaItems = getPostMediaItems(post) || [];
  const firstMedia = mediaItems[0];

  const likesCount = Number(post?.likesCount ?? post?.likes?.length ?? 0);
  const commentsCount = Number(
    post?.commentsCount ?? post?.comments?.length ?? 0,
  );

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      whileTap={{ scale: 0.98 }}
      aria-label={`Open post${post?.caption ? `: ${post.caption}` : ""}`}
      className="
        group
        relative
        aspect-square
        w-full
        cursor-pointer
        overflow-hidden
        rounded-xl
        border
        border-red-950/80
        bg-[#090405]
        shadow-[0_10px_30px_rgba(0,0,0,0.35)]
        outline-none
        transition-all
        duration-300

        hover:border-red-800/80
        hover:shadow-[0_12px_40px_rgba(127,29,29,0.22)]

        focus-visible:ring-2
        focus-visible:ring-red-600
        focus-visible:ring-offset-2
        focus-visible:ring-offset-[#090405]

        sm:rounded-2xl
      "
    >
      {/* ================= MEDIA ================= */}

      {firstMedia?.type === "image" && (
        <Image
          src={firstMedia.url}
          alt={post?.caption || "Post image"}
          fill
          unoptimized
          sizes="
            (max-width: 640px) 50vw,
            (max-width: 1024px) 33vw,
            240px
          "
          className="
            object-cover
            transition-transform
            duration-500
            ease-out
            sm:group-hover:scale-105
          "
        />
      )}

      {firstMedia?.type === "video" && (
        <video
          src={firstMedia.url}
          muted
          playsInline
          preload="metadata"
          className="
            h-full
            w-full
            object-cover
            pointer-events-none
            transition-transform
            duration-500
            ease-out
            sm:group-hover:scale-105
          "
        />
      )}

      {/* Fallback if post has no media */}
      {!firstMedia && (
        <div
          className="
            flex
            h-full
            w-full
            items-center
            justify-center
            bg-linear-to-br
            from-[#160709]
            via-[#0d0506]
            to-black
            text-red-900
          "
        >
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="currentColor">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2ZM8.5 11.5l2.5 3.01L14.5 10l4.5 6H5l3.5-4.5Z" />
          </svg>
        </div>
      )}

      {/* ================= DARK RED GRADIENT ================= */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          bg-linear-to-t
          from-black/80
          via-transparent
          to-red-950/10
        "
      />

      {/* ================= MEDIA COUNT ================= */}

      {mediaItems.length > 1 && (
        <div
          className="
            absolute
            right-2
            top-2
            z-20
            flex
            items-center
            gap-1.5
            rounded-full
            border
            border-white/10
            bg-[#16080a]/90
            px-2
            py-1
            text-[10px]
            font-semibold
            text-red-100
            shadow-lg
            backdrop-blur-md

            sm:right-3
            sm:top-3
            sm:px-2.5
            sm:text-xs
          "
        >
          {/* Layers Icon */}
          <svg
            viewBox="0 0 24 24"
            className="h-3.5 w-3.5 text-red-400"
            fill="currentColor"
          >
            <path d="m12 2-10 6 10 6 10-6-10-6Zm-8 9.5 8 4.8 8-4.8v3L12 19.3 4 14.5v-3Zm0 5 8 4.8 8-4.8v2L12 23.3 4 18.5v-2Z" />
          </svg>

          <span>{mediaItems.length}</span>
        </div>
      )}

      {/* ==================================================
          MOBILE STATS
          Always visible at bottom on mobile
      ================================================== */}

      <div
        className="
          absolute
          bottom-0
          left-0
          right-0
          z-20
          flex
          items-center
          gap-4
          px-3
          py-2.5
          text-white

          sm:hidden
        "
      >
        {/* Likes */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <HeartIcon className="h-4 w-4 text-red-500" />

          <span>{likesCount}</span>
        </div>

        {/* Comments */}
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <CommentIcon className="h-4 w-4 text-red-400" />

          <span>{commentsCount}</span>
        </div>
      </div>

      {/* ==================================================
          DESKTOP HOVER OVERLAY
      ================================================== */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          z-10
          hidden
          items-center
          justify-center
          bg-linear-to-br
          from-black/75
          via-red-950/45
          to-black/80

          opacity-0
          backdrop-blur-[1px]

          transition-all
          duration-300

          sm:flex
          sm:group-hover:opacity-100
        "
      >
        <div
          className="
            flex
            translate-y-2
            items-center
            gap-6
            opacity-0
            transition-all
            duration-300

            group-hover:translate-y-0
            group-hover:opacity-100
          "
        >
          {/* Likes */}
          <div className="flex items-center gap-2">
            <HeartIcon className="h-6 w-6 text-red-500" />

            <span className="text-sm font-bold text-white">{likesCount}</span>
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-red-900/70" />

          {/* Comments */}
          <div className="flex items-center gap-2">
            <CommentIcon className="h-6 w-6 text-red-400" />

            <span className="text-sm font-bold text-white">
              {commentsCount}
            </span>
          </div>
        </div>
      </div>

      {/* ================= RED BORDER GLOW ================= */}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          z-30
          rounded-[inherit]
          ring-1
          ring-inset
          ring-white/3
          transition-all
          duration-300
          sm:group-hover:ring-red-700/30
        "
      />
    </motion.div>
  );
}

/* ======================================================
   ICONS
====================================================== */

function HeartIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.004 6.004 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35Z" />
    </svg>
  );
}

function CommentIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2ZM7 9h10v2H7V9Zm6 5H7v-2h6v2Zm4-6H7V6h10v2Z" />
    </svg>
  );
}
