"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

function formatTime(value) {
  if (!value) return "now";
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function threadComments(comments) {
  const ids = new Set(comments.map((comment) => String(comment._id)));
  const roots = comments.filter((comment) => !comment.parentId || !ids.has(String(comment.parentId)));
  const descend = (comment, seen = new Set()) => {
    const id = String(comment._id);
    if (seen.has(id)) return [];
    const nextSeen = new Set(seen).add(id);
    return [comment, ...comments.filter((reply) => String(reply.parentId) === id).flatMap((reply) => descend(reply, nextSeen))];
  };
  return roots.flatMap((comment) => descend(comment));
}

export default function ClipCommentsDialog({ clip, onClose, onCommentAdded }) {
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState([]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/clips/${clip._id}/comments`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load comments");
        setComments(Array.isArray(data.comments) ? data.comments : []);
      } catch (requestError) {
        if (requestError.name !== "AbortError") setError(requestError.message || "Unable to load comments");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [clip._id]);

  useEffect(() => {
    if (mentionQuery.length < 1) {
      setMentionResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(mentionQuery)}`, { signal: controller.signal });
        const data = response.ok ? await response.json() : null;
        setMentionResults(Array.isArray(data?.users) ? data.users.slice(0, 5) : []);
      } catch (requestError) {
        if (requestError.name !== "AbortError") setMentionResults([]);
      }
    }, 220);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [mentionQuery]);

  const updateText = (value) => {
    setText(value);
    const match = value.match(/(?:^|\s)@([a-zA-Z0-9_.]*)$/);
    setMentionQuery(match?.[1] || "");
  };

  const selectMention = (username) => {
    setText((current) => current.replace(/@([a-zA-Z0-9_.]*)$/, `@${username} `));
    setMentionQuery("");
    setMentionResults([]);
  };

  const submit = async (event) => {
    event.preventDefault();
    const cleanText = text.trim();
    if (!cleanText || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/clips/${clip._id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText, parentId: replyTo?._id || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to add comment");
      setComments((current) => [data.comment, ...current]);
      setText("");
      setReplyTo(null);
      onCommentAdded?.(data.comment);
    } catch (requestError) {
      setError(requestError.message || "Unable to add comment");
    } finally {
      setSending(false);
    }
  };
  const likeComment = async (comment) => {
    try { const response = await fetch(`/api/clips/${clip._id}/comments`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "like", commentId: comment._id }) }); const data = await response.json(); if (!response.ok) throw new Error(data.message || "Unable to like comment"); setComments((current) => current.map((item) => item._id === comment._id ? { ...item, ...data.comment } : item)); } catch (requestError) { setError(requestError.message || "Unable to like comment"); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={onClose}>
      <motion.section initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} role="dialog" aria-modal="true" aria-label="Clip comments" onMouseDown={(event) => event.stopPropagation()} className="flex max-h-[82dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[30px] border border-red-500/15 bg-[#100506] text-white shadow-2xl sm:rounded-[30px]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-black">Comments</h2>
            <p className="text-xs text-white/45">{comments.length || Number(clip.commentsCount || 0)} conversations</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close comments" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">×</button>
        </header>

        <div className="min-h-64 flex-1 space-y-1 overflow-y-auto p-3">
          {loading ? (
            <p className="p-8 text-center text-sm text-white/45">Loading comments…</p>
          ) : comments.length ? (
            threadComments(comments).map((comment) => (
              <article key={comment._id} className={`flex gap-3 rounded-2xl p-3 transition hover:bg-white/5 ${comment.parentId ? "ml-7 border-l border-red-900/50" : ""}`}>
                <Link href={`/profile/${encodeURIComponent(comment.user?.username || "")}`} onClick={onClose}>
                  <Image src={comment.user?.profilePic || "/user.svg"} alt="" width={40} height={40} unoptimized className="h-10 w-10 rounded-full object-cover" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-5">
                    <Link href={`/profile/${encodeURIComponent(comment.user?.username || "")}`} onClick={onClose} className="mr-2 font-bold hover:text-red-300">@{comment.user?.username || "user"}</Link>
                    <span className="text-white/85">{comment.text}</span>
                  </p>
                  <div className="mt-1 flex items-center gap-3"><time className="text-[11px] text-white/35">{formatTime(comment.createdAt)}</time><button type="button" onClick={() => void likeComment(comment)} className={comment.viewerLiked ? "text-xs text-red-400" : "text-xs text-white/45"}>♥ {comment.likes?.length || 0}</button><button type="button" onClick={() => { setReplyTo(comment); setText(`@${comment.user?.username || ""} `); }} className="text-xs text-white/45">Reply</button></div>
                </div>
              </article>
            ))
          ) : (
            <div className="grid min-h-56 place-items-center text-center">
              <div>
                <p className="text-2xl">💬</p>
                <h3 className="mt-3 font-bold">Start the conversation</h3>
                <p className="mt-1 text-sm text-white/45">Be the first to comment on this clip.</p>
              </div>
            </div>
          )}
        </div>

        {error && <p className="px-5 pb-2 text-sm text-red-300">{error}</p>}
        <form onSubmit={submit} className="relative border-t border-white/10 bg-black/20 p-4">{mentionResults.length > 0 && <div className="absolute bottom-full left-4 right-4 z-10 overflow-hidden rounded-2xl border border-white/10 bg-[#19090b] shadow-2xl">{mentionResults.map((user) => <button key={user._id} type="button" onClick={() => selectMention(user.username)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/10"><Image src={user.profilePic || "/user.svg"} alt="" width={24} height={24} unoptimized className="h-6 w-6 rounded-full object-cover" />@{user.username}</button>)}</div>}{replyTo && <div className="mb-2 flex justify-between text-xs text-red-200"><span>Replying to @{replyTo.user?.username || "user"}</span><button type="button" onClick={() => { setReplyTo(null); setText(""); }}>×</button></div>}<div className="flex gap-2">
          <input value={text} onChange={(event) => updateText(event.target.value)} maxLength={500} placeholder="Add a comment…" className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/55 px-4 py-3 text-sm outline-none focus:border-red-500" />
          <button type="submit" disabled={!text.trim() || sending} className="rounded-full bg-red-600 px-5 text-sm font-bold transition hover:bg-red-500 disabled:opacity-40">{sending ? "Posting…" : "Post"}</button>
        </div></form>
      </motion.section>
    </motion.div>
  );
}
