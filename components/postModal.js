"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { usePostModal } from "./usePostModal";
import Likebtn from "./likebtn";
import PostMediaCarousel from "./PostMediaCarousel";
import PostOptions from "./postOptions";
import PostLikesModal from "./PostLikesModal";

const FALLBACK_AVATAR =
  "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif";

/* ----------------------------- ICONS ----------------------------- */

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5 sm:h-6 sm:w-6"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5 sm:h-6 sm:w-6"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-[22px] w-[22px]"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5a8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BookmarkIcon({ filled = false }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[22px] w-[22px]"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-3.75L6 21V4.75Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

/* ---------------------------- COMPONENT ---------------------------- */

export default function PostModal({ posts = [], index = 0, onClose }) {
  const { data: session } = useSession();

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);

  const {
    post,
    current,
    comments,
    loading,
    text,
    setText,
    addComment,
    next,
    prev,
  } = usePostModal(posts, index, onClose);

  /* ----------------------- BODY SCROLL LOCK ----------------------- */

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  /* ----------------------- KEYBOARD CONTROLS ---------------------- */

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;

      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (event.key === "Escape") {
        if (optionsOpen) {
          setOptionsOpen(false);
          return;
        }

        onClose?.();
        return;
      }

      if (isTyping) return;

      if (event.key === "ArrowLeft" && current > 0) {
        prev();
      }

      if (event.key === "ArrowRight" && current < posts.length - 1) {
        next();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [current, next, onClose, optionsOpen, posts.length, prev]);

  /* --------------------- SYNC SAVED POST STATE -------------------- */

  useEffect(() => {
    setSaved(Boolean(post?.viewerSaved));
  }, [post?._id, post?.viewerSaved]);

  if (!post) return null;

  const userId = session?.user?.id;

  const isOwner = String(post.user?._id || post.user) === String(userId);

  const initialLiked = Boolean(
    userId &&
    post.likes?.some((like) => String(like?._id || like) === String(userId)),
  );

  const username = post.user?.username || "User";

  const avatar = post.user?.profilePic || FALLBACK_AVATAR;

  /* -------------------------- REQUEST -------------------------- */

  const request = async (url, options) => {
    const response = await fetch(url, options);

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        data.message || data.error || "Something went wrong. Please try again.",
      );
    }

    return data;
  };

  /* --------------------------- SAVE ---------------------------- */

  const savePost = async () => {
    if (saving) return;

    try {
      setSaving(true);

      const data = await request(`/api/posts/${post._id}/save`, {
        method: "POST",
      });

      setSaved(Boolean(data.saved));
      setOptionsOpen(false);
    } finally {
      setSaving(false);
    }
  };

  /* -------------------------- REPORT --------------------------- */

  const reportPost = async () => {
    const reason = window.prompt("Tell us why you're reporting this post.");

    if (!reason?.trim()) return;

    await request("/api/reports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        postId: post._id,
        targetUserId: post.user?._id,
        category: "post",
        reason: reason.trim(),
      }),
    });

    setOptionsOpen(false);
    onClose();
  };

  /* ----------------------- ADD COMMENT ------------------------- */

  const handleCommentSubmit = async (event) => {
    event.preventDefault();

    if (!text.trim()) return;

    await addComment();
  };

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Post by ${username}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{
          duration: 0.2,
          ease: "easeOut",
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
        className="
          fixed inset-0 z-50
          flex items-center justify-center
          bg-[#030101]/95
          backdrop-blur-xl
          lg:p-5
        "
      >
        {/* Ambient red glow */}
        <div
          aria-hidden="true"
          className="
            pointer-events-none fixed left-1/2 top-0
            h-[400px] w-[700px]
            -translate-x-1/2 -translate-y-1/2
            rounded-full
            bg-red-950/30
            blur-[130px]
          "
        />

        {/* -------------------------- CLOSE -------------------------- */}

        <motion.button
          type="button"
          onClick={onClose}
          whileTap={{ scale: 0.92 }}
          aria-label="Close post"
          className="
            fixed
            right-3
            top-[max(0.75rem,env(safe-area-inset-top))]
            z-70
            grid h-10 w-10 place-items-center
            rounded-full
            border border-white/10
            bg-[#160708]/90
            text-zinc-300
            shadow-[0_10px_40px_rgba(0,0,0,0.5)]
            backdrop-blur-xl
            transition
            hover:border-red-500/30
            hover:bg-red-950
            hover:text-white
            sm:right-5
            sm:h-11 sm:w-11
          "
        >
          <CloseIcon />
        </motion.button>

        {/* ------------------------ LEFT NAV ------------------------- */}

        {current > 0 && (
          <motion.button
            type="button"
            onClick={prev}
            whileTap={{ scale: 0.9 }}
            aria-label="Previous post"
            className="
              fixed
              left-2
              top-[24%]
              z-60
              grid h-10 w-10
              place-items-center
              rounded-full
              border border-white/10
              bg-black/60
              text-white
              shadow-xl
              backdrop-blur-xl
              transition
              hover:border-red-500/40
              hover:bg-red-950/90
              sm:left-4
              sm:h-11 sm:w-11
              lg:top-1/2
              lg:-translate-y-1/2
            "
          >
            <ChevronLeftIcon />
          </motion.button>
        )}

        {/* ------------------------ RIGHT NAV ------------------------ */}

        {current < posts.length - 1 && (
          <motion.button
            type="button"
            onClick={next}
            whileTap={{ scale: 0.9 }}
            aria-label="Next post"
            className="
              fixed
              right-2
              top-[24%]
              z-60
              grid h-10 w-10
              place-items-center
              rounded-full
              border border-white/10
              bg-black/60
              text-white
              shadow-xl
              backdrop-blur-xl
              transition
              hover:border-red-500/40
              hover:bg-red-950/90
              sm:right-4
              sm:h-11 sm:w-11
              lg:top-1/2
              lg:-translate-y-1/2
            "
          >
            <ChevronRightIcon />
          </motion.button>
        )}

        {/* ------------------------- MODAL -------------------------- */}

        <motion.div
          key={current}
          initial={{
            opacity: 0,
            scale: 0.975,
            y: 12,
          }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            scale: 0.985,
          }}
          transition={{
            duration: 0.25,
            ease: [0.22, 1, 0.36, 1],
          }}
          onMouseDown={(event) => event.stopPropagation()}
          className="
            relative
            grid
            h-dvh
            w-full
            min-h-0
            overflow-hidden
            bg-[#080303]
            shadow-[0_40px_100px_rgba(0,0,0,0.75)]

            grid-rows-[minmax(250px,46dvh)_minmax(0,1fr)]

            sm:grid-rows-[minmax(320px,58dvh)_minmax(0,1fr)]

            lg:h-[min(90dvh,900px)]
            lg:max-w-7xl
            lg:grid-cols-[minmax(0,1.2fr)_minmax(390px,0.8fr)]
            lg:grid-rows-1
            lg:rounded-[28px]
            lg:border
            lg:border-red-950/70
          "
        >
          {/* ========================= MEDIA ========================= */}

          <section
            className="
              relative
              min-h-0
              overflow-hidden
              border-b border-red-950/60
              bg-black
              lg:border-b-0
              lg:border-r
            "
          >
            {/* subtle red background glow */}
            <div
              aria-hidden="true"
              className="
                pointer-events-none
                absolute inset-0
                bg-[radial-gradient(circle_at_center,rgba(127,29,29,0.15),transparent_65%)]
              "
            />

            <PostMediaCarousel
              post={post}
              fill
              className="relative z-1 h-full w-full"
              imageClassName="object-contain"
              videoClassName="object-contain"
              sizes="(max-width: 1024px) 100vw, 60vw"
            />

            {/* Mobile post count */}
            {posts.length > 1 && (
              <div
                className="
                  absolute
                  bottom-3 left-1/2 z-10
                  -translate-x-1/2
                  rounded-full
                  border border-white/10
                  bg-black/60
                  px-3 py-1
                  text-[11px]
                  font-medium
                  text-white/75
                  shadow-lg
                  backdrop-blur-md
                  lg:hidden
                "
              >
                {current + 1} / {posts.length}
              </div>
            )}

            {/* Media gradient */}
            <div
              aria-hidden="true"
              className="
                pointer-events-none
                absolute inset-x-0 bottom-0 z-2
                h-16
                bg-linear-to-t
                from-black/50
                to-transparent
                lg:hidden
              "
            />
          </section>

          {/* ====================== DETAILS PANEL ====================== */}

          <section
            className="
              flex
              min-h-0
              flex-col
              bg-[#100506]
              text-white
            "
          >
            {/* ------------------------ HEADER ------------------------ */}

            <header
              className="
                relative z-20
                flex min-h-[68px]
                shrink-0
                items-center
                gap-3
                border-b
                border-red-950/70
                bg-[#120607]/95
                px-4
                backdrop-blur-xl
                sm:px-5
              "
            >
              <div className="relative shrink-0">
                <div
                  className="
                    absolute -inset-0.5
                    rounded-full
                    bg-linear-to-br
                    from-red-500/80
                    via-red-800/50
                    to-red-950
                  "
                />

                <Image
                  src={avatar}
                  alt={`${username} avatar`}
                  width={40}
                  height={40}
                  unoptimized
                  className="
                    relative
                    h-9 w-9
                    rounded-full
                    border-2 border-[#120607]
                    object-cover
                    sm:h-10 sm:w-10
                  "
                />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="
                    truncate
                    text-sm
                    font-semibold
                    tracking-[-0.01em]
                    text-zinc-100
                  "
                >
                  {username}
                </p>

                <p className="mt-0.5 text-[11px] text-zinc-500">Post</p>
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => setOptionsOpen(true)}
                aria-label="Post options"
                className="
                  grid
                  h-9 w-9
                  shrink-0
                  place-items-center
                  rounded-full
                  text-zinc-400
                  transition
                  hover:bg-red-950/50
                  hover:text-red-200
                "
              >
                <MoreIcon />
              </motion.button>
            </header>

            {/* ----------------------- COMMENTS ----------------------- */}

            <div
              className="
                min-h-0
                flex-1
                space-y-5
                overflow-y-auto
                overscroll-contain
                px-4 py-4
                [scrollbar-color:#4c1518_transparent]
                [scrollbar-width:thin]
                sm:px-5
              "
            >
              {/* Caption */}
              <div
                className="
                  flex gap-3
                  rounded-2xl
                  border border-red-950/50
                  bg-red-950/10
                  p-3
                  sm:p-4
                "
              >
                <Image
                  src={avatar}
                  alt={`${username} avatar`}
                  width={36}
                  height={36}
                  unoptimized
                  className="
                    h-9 w-9
                    shrink-0
                    rounded-full
                    object-cover
                    ring-1
                    ring-white/10
                  "
                />

                <div className="min-w-0 flex-1">
                  <p
                    className="
                      wrap-break-word
                      text-[13px]
                      leading-5
                      text-zinc-300
                      sm:text-sm
                    "
                  >
                    <span
                      className="
                        mr-2
                        font-semibold
                        text-zinc-100
                      "
                    >
                      {username}
                    </span>

                    {post.caption}
                  </p>

                  {post.createdAt && (
                    <time
                      dateTime={post.createdAt}
                      className="
                        mt-2
                        block
                        text-[10px]
                        uppercase
                        tracking-[0.08em]
                        text-zinc-600
                      "
                    >
                      {new Date(post.createdAt).toLocaleString()}
                    </time>
                  )}
                </div>
              </div>

              {/* Comments loading */}
              {loading &&
                [...Array(4)].map((_, index) => (
                  <div key={index} className="flex animate-pulse gap-3">
                    <div
                      className="
                        h-9 w-9
                        shrink-0
                        rounded-full
                        bg-red-950/50
                      "
                    />

                    <div className="flex-1 space-y-2 pt-1">
                      <div
                        className="
                          h-3
                          w-2/5
                          rounded-full
                          bg-red-950/40
                        "
                      />

                      <div
                        className="
                          h-3
                          w-4/5
                          rounded-full
                          bg-white/6
                        "
                      />
                    </div>
                  </div>
                ))}

              {/* Empty comments */}
              {!loading && comments.length === 0 && (
                <div
                  className="
                    flex
                    min-h-32
                    flex-col
                    items-center
                    justify-center
                    px-4
                    text-center
                  "
                >
                  <div
                    className="
                      mb-3
                      grid h-11 w-11
                      place-items-center
                      rounded-full
                      border border-red-900/30
                      bg-red-950/20
                      text-red-400
                    "
                  >
                    <CommentIcon />
                  </div>

                  <p className="text-sm font-medium text-zinc-300">
                    No comments yet
                  </p>

                  <p className="mt-1 text-xs text-zinc-600">
                    Start the conversation.
                  </p>
                </div>
              )}

              {/* Comments list */}
              {!loading &&
                comments.map((comment) => {
                  const commentUsername = comment.user?.username || "User";

                  const commentAvatar =
                    comment.user?.profilePic || FALLBACK_AVATAR;

                  return (
                    <motion.div
                      key={comment._id}
                      initial={{
                        opacity: 0,
                        y: 5,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      className="
                        group
                        flex
                        items-start
                        gap-3
                        rounded-xl
                        p-1
                      "
                    >
                      <Image
                        src={commentAvatar}
                        alt={`${commentUsername} avatar`}
                        width={36}
                        height={36}
                        unoptimized
                        className="
                          h-9 w-9
                          shrink-0
                          rounded-full
                          object-cover
                          ring-1
                          ring-white/6
                        "
                      />

                      <div className="min-w-0 flex-1 pt-0.5">
                        <p
                          className="
                            wrap-break-word
                            text-[13px]
                            leading-5
                            text-zinc-300
                            sm:text-sm
                          "
                        >
                          <span
                            className="
                              mr-2
                              font-semibold
                              text-zinc-100
                            "
                          >
                            {commentUsername}
                          </span>

                          {comment.text}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
            </div>

            {/* ---------------------- ACTION BAR ---------------------- */}

            <div
              className="
                shrink-0
                border-t
                border-red-950/60
                bg-[#0e0506]/95
                px-4 py-3
                backdrop-blur-xl
                sm:px-5
              "
            >
              <div className="flex items-center gap-1">
                <div
                  className="
                    flex min-w-0
                    items-center
                    [&_button]:transition
                  "
                >
                  <Likebtn
                    postId={post._id}
                    initialLiked={initialLiked}
                    initialCount={Number(post.likesCount ?? post.likes?.length ?? 0)}
                    hideCount={Boolean(post.hideCount)}
                    onCountClick={() => setLikesOpen(true)}
                  />
                </div>

                <button
                  type="button"
                  aria-label="Comments"
                  className="
                    ml-1
                    grid h-10 w-10
                    place-items-center
                    rounded-full
                    text-zinc-300
                    transition
                    hover:bg-red-950/40
                    hover:text-red-400
                  "
                >
                  <CommentIcon />
                </button>

                <span
                  className="
                    ml-0.5
                    text-xs
                    font-medium
                    text-zinc-500
                  "
                >
                  {comments.length}
                </span>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  disabled={saving}
                  onClick={() =>
                    void savePost().catch((error) =>
                      window.alert(error.message),
                    )
                  }
                  aria-label={saved ? "Remove saved post" : "Save post"}
                  className={`
                    ml-auto
                    grid h-10 w-10
                    place-items-center
                    rounded-full
                    transition
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                    ${
                      saved
                        ? "bg-red-950/50 text-red-400"
                        : "text-zinc-300 hover:bg-red-950/40 hover:text-red-400"
                    }
                  `}
                >
                  <BookmarkIcon filled={saved} />
                </motion.button>
              </div>
            </div>

            {/* --------------------- COMMENT INPUT -------------------- */}

            <form
              onSubmit={handleCommentSubmit}
              className="
                shrink-0
                border-t
                border-red-950/60
                bg-[#100506]
                px-3
                pb-[max(0.75rem,env(safe-area-inset-bottom))]
                pt-3
                sm:px-5
              "
            >
              <div
                className="
                  flex
                  min-h-12
                  items-center
                  gap-2
                  rounded-2xl
                  border
                  border-white/[0.07]
                  bg-white/[0.035]
                  px-3
                  transition
                  focus-within:border-red-800/70
                  focus-within:bg-red-950/10
                  focus-within:shadow-[0_0_0_3px_rgba(127,29,29,0.08)]
                "
              >
                {session?.user && (
                  <Image
                    src={
                      session.user.image ||
                      session.user.profilePic ||
                      FALLBACK_AVATAR
                    }
                    alt="Your avatar"
                    width={28}
                    height={28}
                    unoptimized
                    className="
                      h-7 w-7
                      shrink-0
                      rounded-full
                      object-cover
                    "
                  />
                )}

                <input
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  autoComplete="off"
                  aria-label="Add a comment"
                  placeholder="Add a comment..."
                  className="
                    min-w-0
                    flex-1
                    bg-transparent
                    py-3
                    text-[13px]
                    text-zinc-200
                    outline-none
                    placeholder:text-zinc-600
                    sm:text-sm
                  "
                />

                <button
                  type="submit"
                  disabled={!text.trim()}
                  className="
                    shrink-0
                    rounded-xl
                    px-3 py-2
                    text-xs
                    font-semibold
                    transition
                    disabled:cursor-not-allowed
                    disabled:text-zinc-700
                    enabled:bg-red-700
                    enabled:text-white
                    enabled:shadow-[0_5px_20px_rgba(185,28,28,0.18)]
                    enabled:hover:bg-red-600
                    sm:text-[13px]
                  "
                >
                  Post
                </button>
              </div>
            </form>
          </section>
        </motion.div>

        {/* ------------------------ OPTIONS ------------------------- */}

        <PostOptions
          isOpen={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          isOwner={isOwner}
          isSaved={saved || Boolean(post.viewerSaved)}
          hideCountHidden={Boolean(post.hideCount)}
          onSave={() =>
            void savePost().catch((error) => window.alert(error.message))
          }
          onReport={() =>
            void reportPost().catch((error) => window.alert(error.message))
          }
          onHide={onClose}
          onHidecount={() =>
            void request(`/api/posts/${post._id}/hideCount`, {
              method: "POST",
            })
              .then(() => setOptionsOpen(false))
              .catch((error) => window.alert(error.message))
          }
          onDelete={() => {
            if (!window.confirm("Delete this post permanently?")) {
              return;
            }

            void request(`/api/posts/${post._id}`, {
              method: "DELETE",
            })
              .then(onClose)
              .catch((error) => window.alert(error.message));
          }}
        />
        <PostLikesModal
          postId={post._id}
          isOpen={likesOpen}
          onClose={() => setLikesOpen(false)}
        />
      </motion.div>
    </AnimatePresence>
  );
}
