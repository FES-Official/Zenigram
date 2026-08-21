"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const FALLBACK_AVATAR = "/user.svg";

export default function PostLikesModal({ postId, isOpen, onClose }) {
  const [result, setResult] = useState({
    postId: null,
    users: [],
    error: "",
  });

  useEffect(() => {
    if (!isOpen || !postId) return;
    const controller = new AbortController();
    fetch(`/api/posts/${postId}/likes`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load likes");
        return data;
      })
      .then((data) =>
        setResult({
          postId,
          users: Array.isArray(data.users) ? data.users : [],
          error: "",
        }),
      )
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setResult({ postId, users: [], error: requestError.message });
        }
      });
    return () => controller.abort();
  }, [isOpen, postId]);
  const loading = isOpen && result.postId !== postId;
  const users = result.postId === postId ? result.users : [];
  const error = result.postId === postId ? result.error : "";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.section
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.97 }}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[72vh] w-full max-w-md overflow-hidden rounded-[28px] border border-red-500/20 bg-[#110506] text-white shadow-[0_30px_100px_rgba(127,29,29,.35)]"
          >
            <header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <div>
                <h2 className="text-lg font-black">Likes</h2>
                <p className="text-xs text-zinc-500">People who liked this post</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close likes"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/8 text-xl hover:bg-white/15"
              >
                ×
              </button>
            </header>
            <div className="max-h-[58vh] overflow-y-auto p-3">
              {loading ? (
                <p className="px-4 py-12 text-center text-sm text-zinc-500">Loading likes…</p>
              ) : error ? (
                <div className="m-2 rounded-2xl border border-red-500/20 bg-red-950/30 p-5 text-center">
                  <p className="text-sm font-semibold text-red-200">Likes are unavailable</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{error}</p>
                </div>
              ) : users.length ? (
                users.map((user) => (
                  <Link
                    key={user._id}
                    href={`/profile/${encodeURIComponent(user.username)}`}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-red-950/30"
                  >
                    <Image
                      src={user.profilePic || FALLBACK_AVATAR}
                      alt=""
                      width={46}
                      height={46}
                      className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">{user.username}</strong>
                      <span className="block truncate text-xs text-zinc-500">{user.fullname || "Zanigram creator"}</span>
                    </span>
                    <span className="text-red-400">›</span>
                  </Link>
                ))
              ) : (
                <p className="px-4 py-12 text-center text-sm text-zinc-500">No likes yet.</p>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
