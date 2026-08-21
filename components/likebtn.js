"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

export default function LikeBtn({
  postId,
  initialLiked,
  initialCount,
  hideCount = false,
  onReady,
  onCountClick,
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  const updateServer = useCallback(async () => {
    const res = await fetch("/api/post/like", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ postId }),
    });

    if (!res.ok) {
      throw new Error("Failed to update like");
    }

    return res.json();
  }, [postId]);

  const toggleLike = useCallback(async () => {
    if (loading) return;

    setLoading(true);

    const prevLiked = liked;
    const prevCount = count;

    const newLiked = !liked;

    setLiked(newLiked);
    setCount((prev) => prev + (newLiked ? 1 : -1));

    try {
      const data = await updateServer();

      setLiked(data.liked);
      setCount(data.likesCount);
    } catch (err) {
      console.error(err);

      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setLoading(false);
    }
  }, [liked, count, loading, updateServer]);

  const likeOnly = useCallback(async () => {
    if (loading || liked) return;

    setLoading(true);

    const prevLiked = liked;
    const prevCount = count;

    setLiked(true);
    setCount((prev) => prev + 1);

    try {
      const data = await updateServer();

      setLiked(data.liked);
      setCount(data.likesCount);
    } catch (err) {
      console.error(err);

      setLiked(prevLiked);
      setCount(prevCount);
    } finally {
      setLoading(false);
    }
  }, [liked, count, loading, updateServer]);

  useEffect(() => {
    if (onReady) {
      onReady({
        toggleLike,
        likeOnly,
      });
    }
  }, [onReady, toggleLike, likeOnly]);

  return (
    <div className="flex items-center gap-2">
      <motion.button
        onClick={toggleLike}
        whileTap={{ scale: 0.8 }}
        disabled={loading}
        className="text-xl disabled:opacity-50"
      >
        {liked ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24"
            width="24"
            viewBox="0 0 24 24"
            fill="#75FB4C"
          >
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24"
            width="24"
            viewBox="0 0 24 24"
            fill="#75FB4C"
          >
            <path d="M0 0h24v24H0V0z" fill="none" />
            <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
          </svg>
        )}
      </motion.button>

      {!hideCount && (
        <button
          type="button"
          onClick={onCountClick}
          disabled={!onCountClick || count < 1}
          className="text-sm font-bold text-gray-50 transition enabled:hover:text-red-300 disabled:cursor-default"
          aria-label={onCountClick ? `Show ${count} likes` : undefined}
        >
          {count}
        </button>
      )}
    </div>
  );
}
