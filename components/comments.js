"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import PostMediaCarousel, {
  getPostMediaItems,
} from "./PostMediaCarousel";

const fallbackProfilePic = "/user.svg";

export default function CommentModal({ isOpen, onClose, post }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [mentionQuery, setMentionQuery] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const [cursorPosition, setCursorPosition] = useState(0);
  const [error, setError] = useState("");
  const [displayPost, setDisplayPost] = useState(post);
  const [replyTo, setReplyTo] = useState(null);

  const inputRef = useRef(null);

  const refreshPostMedia = useCallback(
    async (signal) => {
      if (!post?._id) return;

      const res = await fetch(`/api/posts/${post._id}`, {
        cache: "no-store",
        signal,
      });
      if (!res.ok) throw new Error("Failed to refresh post media");

      const data = await res.json();
      if (data.post) setDisplayPost(data.post);
    },
    [post?._id],
  );

  useEffect(() => {
    setDisplayPost(post);
  }, [post]);

  useEffect(() => {
    if (!isOpen || !post?._id) return;

    const controller = new AbortController();
    void refreshPostMedia(controller.signal).catch((refreshError) => {
      if (refreshError.name !== "AbortError") {
        console.error("Failed to refresh post media:", refreshError);
      }
    });

    return () => controller.abort();
  }, [isOpen, post?._id, refreshPostMedia]);

  /*
   * Load comments
   */
  useEffect(() => {
    if (!isOpen || !post?._id) return;

    const controller = new AbortController();

    async function loadComments() {
      try {
        setLoading(true);
        setError("");
        setComments([]);

        const res = await fetch(`/api/post/comment?post=${post._id}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("Failed to load comments");
        }

        const data = await res.json();
        setComments(data.comments || []);
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error("Failed to load comments:", error);
        setError("Could not load comments. Please try again.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadComments();

    return () => controller.abort();
  }, [isOpen, post?._id]);

  /*
   * Keyboard handling + prevent background scroll
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  /*
   * Debounced @mention search
   */
  useEffect(() => {
    if (!showMentions) {
      setUsers([]);
      setSearchingUsers(false);
      return;
    }

    const controller = new AbortController();

    const timeout = setTimeout(async () => {
      try {
        setSearchingUsers(true);

        const res = await fetch(
          `/api/search/users?q=${encodeURIComponent(mentionQuery)}`,
          {
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          throw new Error("Failed to search users");
        }

        const data = await res.json();
        setUsers(data.users || []);
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error("Failed to search mentions:", error);
        setUsers([]);
      } finally {
        if (!controller.signal.aborted) {
          setSearchingUsers(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [mentionQuery, showMentions]);

  const handleChange = (event) => {
    const value = event.target.value;
    const cursor = event.target.selectionStart ?? value.length;

    setText(value);
    setCursorPosition(cursor);

    const textBeforeCursor = value.slice(0, cursor);

    /*
     * Allows:
     * @john
     * Hello @john
     *
     * Prevents mentions in the middle of words.
     */
    const match = textBeforeCursor.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/);

    if (!match) {
      setMentionQuery("");
      setShowMentions(false);
      return;
    }

    setMentionQuery(match[1]);
    setShowMentions(true);
  };

  const selectUser = (username) => {
    const textBeforeCursor = text.slice(0, cursorPosition);
    const textAfterCursor = text.slice(cursorPosition);

    const newTextBefore = textBeforeCursor.replace(
      /@([a-zA-Z0-9_.]*)$/,
      `@${username} `,
    );

    const newText = newTextBefore + textAfterCursor;
    const nextCursorPosition = newTextBefore.length;

    setText(newText);
    setCursorPosition(nextCursorPosition);
    setMentionQuery("");
    setShowMentions(false);
    setUsers([]);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        nextCursorPosition,
        nextCursorPosition,
      );
    });
  };

  const addComment = async () => {
    const trimmedText = text.trim();

    if (!trimmedText || !post?._id || submitting) return;

    try {
      setSubmitting(true);
      setError("");
      setShowMentions(false);

      const res = await fetch("/api/post/comment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          post: post._id,
          text: trimmedText,
          parentId: replyTo?._id || null,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to add comment");
      }

      const data = await res.json();

      if (data.comment) {
        setComments((prev) => [data.comment, ...prev]);
      }

      setText("");
      setReplyTo(null);
      setMentionQuery("");
      setUsers([]);

      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    } catch (error) {
      console.error("Failed to add comment:", error);
      setError("Could not post your comment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!post) return null;

  const toggleLike = async (comment) => {
    try {
      const response = await fetch("/api/post/comment", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post: post._id, commentId: comment._id, action: "like" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to like comment");
      setComments((current) => current.map((item) => item._id === comment._id ? { ...item, ...data.comment } : item));
    } catch (requestError) { setError(requestError.message || "Unable to like comment"); }
  };

  const username = displayPost?.user?.username || post?.user?.username || "User";
  const hasMedia = getPostMediaItems(displayPost).length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="
            fixed inset-0 z-50
            flex items-center justify-center
            bg-black/80
            p-2
            backdrop-blur-md
            sm:p-4
          "
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onMouseDown={onClose}
        >
          {/* Background glow */}
          <div
            aria-hidden="true"
            className="
              pointer-events-none
              absolute inset-0
              bg-[radial-gradient(circle_at_top_left,rgba(127,29,29,0.28),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(190,18,60,0.15),transparent_40%)]
            "
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Comments on ${username}'s post`}
            initial={{
              opacity: 0,
              scale: 0.96,
              y: 28,
            }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: 28,
            }}
            transition={{
              type: "spring",
              stiffness: 320,
              damping: 28,
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className="
              relative z-10
              flex
              h-[94vh]
              w-full
              max-w-6xl
              flex-col
              overflow-hidden
              rounded-2xl
              border border-red-950/80
              bg-[#090606]
              text-white
              shadow-[0_35px_100px_rgba(0,0,0,0.75),0_0_80px_rgba(127,29,29,0.12)]
              md:h-[84vh]
              md:flex-row
              md:rounded-3xl
            "
          >
            {/* ──────────────────────────────
                MEDIA SECTION
            ────────────────────────────── */}
            <section
              className="
                relative
                h-[36%]
                min-h-[230px]
                overflow-hidden
                border-b border-red-950/60
                bg-[#030202]
                md:h-auto
                md:min-h-0
                md:w-[55%]
                md:border-b-0
                md:border-r
              "
            >
              {/* Subtle media background */}
              <div
                aria-hidden="true"
                className="
                  absolute inset-0
                  bg-[radial-gradient(circle_at_center,rgba(127,29,29,0.12),transparent_60%)]
                "
              />

              {hasMedia ? (
                <PostMediaCarousel
                  post={displayPost}
                  fill
                  sizes="(max-width: 768px) 100vw, 55vw"
                  className="relative z-10 h-full w-full"
                  imageClassName="object-contain transition-transform duration-500"
                  videoClassName="object-contain"
                  onRetry={() => refreshPostMedia()}
                />
              ) : (
                <div
                  className="
                    relative z-10
                    flex h-full
                    items-center justify-center
                    text-sm
                    text-zinc-600
                  "
                >
                  Media unavailable
                </div>
              )}

              {/* Desktop branding badge */}
              <div
                className="
                  pointer-events-none
                  absolute bottom-5 left-5 z-20
                  hidden
                  rounded-full
                  border border-red-900/40
                  bg-black/60
                  px-3 py-1.5
                  text-xs font-medium
                  text-red-200/70
                  shadow-lg
                  backdrop-blur-xl
                  md:block
                "
              >
                @{username}
              </div>
            </section>

            {/* ──────────────────────────────
                COMMENTS SECTION
            ────────────────────────────── */}
            <section
              className="
                relative
                flex min-h-0
                flex-1 flex-col
                bg-[linear-gradient(180deg,#100909_0%,#090606_100%)]
                md:w-[45%]
              "
            >
              {/* HEADER */}
              <header
                className="
                  flex shrink-0
                  items-center gap-3
                  border-b border-red-950/60
                  bg-[#100909]/90
                  px-4 py-3.5
                  backdrop-blur-xl
                  sm:px-5
                "
              >
                <div
                  className="
                    flex h-9 w-9
                    shrink-0
                    items-center justify-center
                    rounded-xl
                    border border-red-900/50
                    bg-red-950/40
                    text-red-400
                    shadow-inner
                    shadow-red-950/50
                  "
                >
                  <CommentIcon />
                </div>

                <div className="min-w-0 flex-1">
                  <h2
                    className="
                      truncate
                      text-sm font-semibold
                      tracking-tight
                      text-zinc-100
                      sm:text-base
                    "
                  >
                    Comments
                  </h2>

                  <p
                    className="
                      truncate
                      text-xs
                      text-zinc-500
                    "
                  >
                    Replying to{" "}
                    <span className="font-medium text-red-400">
                      @{username}
                    </span>
                  </p>
                </div>

                <span
                  className="
                    hidden
                    rounded-full
                    border border-red-950
                    bg-red-950/30
                    px-2.5 py-1
                    text-xs font-medium
                    text-red-300
                    sm:inline-flex
                  "
                >
                  {comments.length}{" "}
                  {comments.length === 1 ? "comment" : "comments"}
                </span>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close comments"
                  className="
                    group
                    flex h-9 w-9
                    shrink-0
                    items-center justify-center
                    rounded-xl
                    border border-transparent
                    text-zinc-500
                    transition-all
                    duration-200
                    hover:border-red-900/40
                    hover:bg-red-950/40
                    hover:text-red-300
                    focus-visible:outline-none
                    focus-visible:ring-2
                    focus-visible:ring-red-700
                  "
                >
                  <CloseIcon />
                </button>
              </header>

              {/* ERROR */}
              <AnimatePresence initial={false}>
                {error && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      height: 0,
                    }}
                    animate={{
                      opacity: 1,
                      height: "auto",
                    }}
                    exit={{
                      opacity: 0,
                      height: 0,
                    }}
                    className="
                      shrink-0
                      overflow-hidden
                      border-b border-red-950/70
                      bg-red-950/25
                    "
                  >
                    <div
                      className="
                        flex items-center gap-2
                        px-4 py-2.5
                        text-xs
                        text-red-300
                        sm:px-5
                      "
                    >
                      <ErrorIcon />
                      <span>{error}</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* COMMENTS LIST */}
              <div
                className="
                  min-h-0
                  flex-1
                  overflow-y-auto
                  overscroll-contain
                  px-3 py-4
                  [scrollbar-color:#3f1515_transparent]
                  [scrollbar-width:thin]
                  sm:px-4
                "
              >
                {loading ? (
                  <CommentsSkeleton />
                ) : comments.length === 0 ? (
                  <EmptyComments />
                ) : (
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: {
                        transition: {
                          staggerChildren: 0.035,
                        },
                      },
                    }}
                    className="space-y-2"
                  >
                    {threadComments(comments).map((comment) => (
                      <CommentItem key={comment._id} comment={comment} replyTo={replyTo} onReply={() => { setReplyTo(comment); setText(`@${comment.user?.username || ""} `); requestAnimationFrame(() => inputRef.current?.focus()); }} onLike={() => void toggleLike(comment)} />
                    ))}
                  </motion.div>
                )}
              </div>

              {/* MENTION DROPDOWN */}
              <AnimatePresence>
                {showMentions && (
                  <motion.div
                    initial={{
                      opacity: 0,
                      y: 12,
                      scale: 0.98,
                    }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      scale: 1,
                    }}
                    exit={{
                      opacity: 0,
                      y: 10,
                      scale: 0.98,
                    }}
                    transition={{
                      duration: 0.16,
                    }}
                    className="
                      absolute
                      bottom-[76px]
                      left-3 right-3
                      z-30
                      max-h-60
                      overflow-y-auto
                      rounded-2xl
                      border border-red-900/40
                      bg-[#160c0c]/95
                      p-1.5
                      shadow-[0_20px_60px_rgba(0,0,0,0.65)]
                      backdrop-blur-2xl
                      sm:left-4 sm:right-4
                    "
                  >
                    <div
                      className="
                        flex items-center justify-between
                        px-2.5 py-2
                      "
                    >
                      <span
                        className="
                          text-[11px] font-semibold
                          uppercase tracking-[0.14em]
                          text-zinc-600
                        "
                      >
                        Mention someone
                      </span>

                      {searchingUsers && <Spinner className="h-3.5 w-3.5" />}
                    </div>

                    {searchingUsers && users.length === 0 ? (
                      <div
                        className="
                          px-3 py-5
                          text-center text-xs
                          text-zinc-600
                        "
                      >
                        Searching...
                      </div>
                    ) : users.length > 0 ? (
                      users.map((user) => (
                        <button
                          type="button"
                          key={user._id}
                          onClick={() => selectUser(user.username)}
                          className="
                            group
                            flex w-full
                            items-center gap-3
                            rounded-xl
                            px-2.5 py-2
                            text-left
                            transition-all
                            duration-150
                            hover:bg-red-950/45
                            focus-visible:outline-none
                            focus-visible:ring-1
                            focus-visible:ring-red-800
                          "
                        >
                          <div className="relative shrink-0">
                            <Image
                              alt={`${user.username}'s profile picture`}
                              src={user.profilePic || fallbackProfilePic}
                              width={38}
                              height={38}
                              className="
                                h-9.5 w-9.5
                                rounded-full
                                border border-red-950
                                object-cover
                              "
                            />

                            <div
                              className="
                                absolute bottom-0 right-0
                                h-2.5 w-2.5
                                rounded-full
                                border-2 border-[#160c0c]
                                bg-red-500
                              "
                            />
                          </div>

                          <div className="min-w-0">
                            <p
                              className="
                                truncate
                                text-sm font-semibold
                                text-zinc-200
                                transition-colors
                                group-hover:text-red-300
                              "
                            >
                              @{user.username}
                            </p>

                            {user.name && (
                              <p
                                className="
                                  truncate
                                  text-xs
                                  text-zinc-600
                                "
                              >
                                {user.name}
                              </p>
                            )}
                          </div>
                        </button>
                      ))
                    ) : (
                      <div
                        className="
                          px-3 py-5
                          text-center
                          text-xs
                          text-zinc-600
                        "
                      >
                        No users found
                        {mentionQuery && (
                          <>
                            {" "}
                            for{" "}
                            <span className="text-red-400">
                              @{mentionQuery}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* COMMENT INPUT */}
              <footer
                className="
                  relative
                  shrink-0
                  border-t border-red-950/60
                  bg-[#0d0808]/95
                  p-3
                  backdrop-blur-2xl
                  sm:p-4
                "
              >
                {replyTo && <div className="mb-2 flex items-center justify-between rounded-xl bg-red-950/35 px-3 py-2 text-xs text-red-200"><span>Replying to @{replyTo.user?.username || "user"}</span><button type="button" onClick={() => { setReplyTo(null); setText(""); }} aria-label="Cancel reply">×</button></div>}
                <div
                  className="
                    group
                    flex
                    items-center
                    overflow-hidden
                    rounded-2xl
                    border border-red-950/80
                    bg-[#160d0d]
                    shadow-inner
                    shadow-black/20
                    transition-all
                    duration-200
                    focus-within:border-red-800/80
                    focus-within:bg-[#1a0e0e]
                    focus-within:shadow-[0_0_0_3px_rgba(127,29,29,0.12)]
                  "
                >
                  <div
                    className="
                      ml-3
                      flex h-8 w-8
                      shrink-0
                      items-center justify-center
                      rounded-full
                      bg-red-950/40
                      text-red-500
                    "
                  >
                    <AtIcon />
                  </div>

                  <input
                    ref={inputRef}
                    value={text}
                    onChange={handleChange}
                    onClick={(event) => {
                      setCursorPosition(
                        event.currentTarget.selectionStart ?? text.length,
                      );
                    }}
                    onKeyUp={(event) => {
                      setCursorPosition(
                        event.currentTarget.selectionStart ?? text.length,
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        addComment();
                      }
                    }}
                    disabled={submitting}
                    autoComplete="off"
                    placeholder="Write a comment..."
                    aria-label="Write a comment"
                    className="
                      min-w-0
                      flex-1
                      bg-transparent
                      px-3 py-3.5
                      text-sm
                      text-zinc-100
                      placeholder:text-zinc-600
                      outline-none
                      disabled:cursor-not-allowed
                      disabled:opacity-60
                    "
                  />

                  <button
                    type="button"
                    onClick={addComment}
                    disabled={submitting || !text.trim()}
                    className="
                      group/post
                      mr-1.5
                      flex h-10
                      shrink-0
                      items-center gap-1.5
                      rounded-xl
                      bg-linear-to-br
                      from-red-700
                      to-red-950
                      px-3.5
                      text-xs font-semibold
                      text-red-50
                      shadow-lg
                      shadow-red-950/30
                      transition-all
                      duration-200
                      hover:from-red-600
                      hover:to-red-900
                      hover:shadow-red-950/50
                      active:scale-[0.97]
                      disabled:cursor-not-allowed
                      disabled:from-zinc-800
                      disabled:to-zinc-900
                      disabled:text-zinc-600
                      disabled:shadow-none
                      sm:px-4
                    "
                  >
                    {submitting ? (
                      <>
                        <Spinner className="h-4 w-4" />
                        <span className="hidden sm:inline">Posting</span>
                      </>
                    ) : (
                      <>
                        <span>Post</span>
                        <SendIcon />
                      </>
                    )}
                  </button>
                </div>

                <div
                  className="
                    mt-2
                    hidden
                    items-center justify-between
                    px-1
                    text-[10px]
                    text-zinc-700
                    sm:flex
                  "
                >
                  <span>
                    Type{" "}
                    <kbd
                      className="
                        rounded
                        border border-red-950
                        bg-red-950/20
                        px-1 py-0.5
                        font-sans
                        text-red-500
                      "
                    >
                      @
                    </kbd>{" "}
                    to mention someone
                  </span>

                  <span>Press Enter to post</span>
                </div>
              </footer>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────────
   COMMENT ITEM
───────────────────────────────────────────── */

function CommentItem({ comment, onReply, onLike }) {
  const username = comment.user?.username || comment.username || "Unknown";

  const profilePic =
    comment.user?.profilePic || comment.profilePic || fallbackProfilePic;

  return (
    <motion.article
      variants={{
        hidden: {
          opacity: 0,
          y: 8,
        },
        visible: {
          opacity: 1,
          y: 0,
        },
      }}
      transition={{
        duration: 0.2,
      }}
      className={`
        group
        flex gap-3
        rounded-2xl
        border border-transparent
        p-3
        transition-all
        duration-200
        hover:border-red-950/70
        hover:bg-red-950/15
      ${comment.parentId ? "ml-7 border-l border-red-900/45" : ""}`}
    >
      <Link
        href={`/profile/${username}`}
        className="
          relative
          h-9 w-9
          shrink-0
          overflow-hidden
          rounded-full
          border border-red-950/80
          bg-red-950/30
          transition-transform
          duration-200
          group-hover:scale-105
        "
      >
        <Image
          src={profilePic}
          fill
          sizes="36px"
          alt={`${username}'s profile picture`}
          className="object-cover"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            href={`/profile/${username}`}
            className="
              max-w-[75%]
              truncate
              text-sm font-semibold
              text-zinc-200
              transition-colors
              hover:text-red-400
            "
          >
            @{username}
          </Link>

          {comment.createdAt && (
            <>
              <span className="text-[10px] text-zinc-700">•</span>

              <time
                dateTime={comment.createdAt}
                className="
                  text-[10px]
                  text-zinc-600
                "
              >
                {formatCommentTime(comment.createdAt)}
              </time>
            </>
          )}
        </div>

        <p
          className="
            mt-1
            whitespace-pre-wrap
            wrap-break-word
            text-[13px]
            leading-relaxed
            text-zinc-400
          "
        >
          {renderCommentText(comment.text || "")}
        </p>
        <div className="mt-2 flex items-center gap-4 text-[11px] font-semibold text-zinc-500"><button type="button" onClick={onLike} className={comment.viewerLiked ? "text-red-400" : "hover:text-white"}>♥ {comment.likes?.length || 0}</button><button type="button" onClick={onReply} className="hover:text-white">Reply</button></div>
      </div>
    </motion.article>
  );
}

/* ─────────────────────────────────────────────
   COMMENT TEXT
───────────────────────────────────────────── */

function renderCommentText(text) {
  return text.split(/(@[a-zA-Z0-9_.]+)/g).map((part, index) => {
    if (!part.startsWith("@")) {
      return part;
    }

    const username = part.slice(1);

    return (
      <Link
        key={`${part}-${index}`}
        href={`/profile/${username}`}
        className="
            font-medium
            text-red-400
            transition-colors
            hover:text-red-300
            hover:underline
            hover:underline-offset-2
          "
      >
        {part}
      </Link>
    );
  });
}

/* ─────────────────────────────────────────────
   EMPTY STATE
───────────────────────────────────────────── */

function EmptyComments() {
  return (
    <div
      className="
        flex h-full
        min-h-[250px]
        flex-col
        items-center
        justify-center
        px-6
        text-center
      "
    >
      <div
        className="
          relative mb-5
          flex h-16 w-16
          items-center justify-center
          rounded-2xl
          border border-red-950/70
          bg-linear-to-br
          from-red-950/45
          to-black
          text-red-500
          shadow-xl
          shadow-red-950/20
        "
      >
        <div
          aria-hidden="true"
          className="
            absolute inset-0
            rounded-2xl
            bg-red-800/10
            blur-xl
          "
        />

        <div className="relative">
          <CommentIcon size={24} />
        </div>
      </div>

      <h3
        className="
          text-sm font-semibold
          text-zinc-200
        "
      >
        No comments yet
      </h3>

      <p
        className="
          mt-1.5
          max-w-[230px]
          text-xs
          leading-relaxed
          text-zinc-600
        "
      >
        Start the conversation and be the first person to leave a comment.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   LOADING SKELETON
───────────────────────────────────────────── */

function CommentsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <div
          key={index}
          className="
            flex animate-pulse
            gap-3
            rounded-2xl
            p-3
          "
        >
          <div
            className="
              h-9 w-9
              shrink-0
              rounded-full
              bg-red-950/35
            "
          />

          <div className="min-w-0 flex-1">
            <div
              className="
                mb-2.5
                h-3 w-24
                rounded-full
                bg-red-950/35
              "
            />

            <div
              className="
                mb-2
                h-2.5 w-full
                rounded-full
                bg-zinc-900
              "
            />

            <div
              className="
                h-2.5 w-3/5
                rounded-full
                bg-zinc-900
              "
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */

function threadComments(comments) {
  const ids = new Set(comments.map((comment) => String(comment._id)));
  const roots = comments.filter((comment) => !comment.parentId || !ids.has(String(comment.parentId)));
  const repliesByParent = new Map();
  comments.forEach((comment) => {
    if (!comment.parentId || !ids.has(String(comment.parentId))) return;
    const parent = String(comment.parentId);
    repliesByParent.set(parent, [...(repliesByParent.get(parent) || []), comment]);
  });
  const descend = (comment, seen = new Set()) => {
    const id = String(comment._id);
    if (seen.has(id)) return [];
    const nextSeen = new Set(seen).add(id);
    return [comment, ...(repliesByParent.get(id) || []).flatMap((reply) => descend(reply, nextSeen))];
  };
  return roots.flatMap((comment) => descend(comment));
}

function formatCommentTime(date) {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const difference = Date.now() - parsedDate.getTime();
  const seconds = Math.floor(difference / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return parsedDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

function CommentIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6A8.38 8.38 0 0 1 12.5 3h.5a8.48 8.48 0 0 1 8 8v.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M18 6 6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AtIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />

      <path
        d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="
        transition-transform
        duration-200
        group-hover/post:translate-x-0.5
      "
    >
      <path
        d="m22 2-7 20-4-9-9-4 20-7Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M22 2 11 13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />

      <path
        d="M12 8v5M12 16.5v.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-20"
      />

      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
