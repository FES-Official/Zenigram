"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function ClipShareDialog({ clip, onClose, onShared }) {
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sharingId, setSharingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setUsers([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/search/users?q=${encodeURIComponent(cleanQuery)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to search users");
        setUsers((data.users || []).filter((user) => String(user._id) !== String(session?.user?.id)));
      } catch (requestError) {
        if (requestError.name !== "AbortError") setError(requestError.message || "Unable to search users");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, session?.user?.id]);

  const share = async (recipient) => {
    setSharingId(recipient._id);
    setError("");
    try {
      const response = await fetch(`/api/clips/${clip._id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipient._id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to share clip");
      onShared?.(data);
      onClose();
    } catch (requestError) {
      setError(requestError.message || "Unable to share clip");
    } finally {
      setSharingId("");
    }
  };

  if (!clip) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-md" onMouseDown={onClose}>
      <motion.section initial={{ opacity: 0, y: 20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }} role="dialog" aria-modal="true" aria-label="Share clip" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-[28px] border border-red-500/20 bg-[#100506] text-white shadow-[0_35px_100px_rgba(127,29,29,.35)]">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="text-lg font-black">Share clip</h2>
            <p className="text-xs text-white/45">Send it directly in a conversation.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close share dialog" className="grid h-9 w-9 place-items-center rounded-full bg-white/10">×</button>
        </header>
        <div className="p-5">
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username" className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm outline-none transition focus:border-red-500" />
          {error && <p className="mt-3 text-sm text-red-300">{error}</p>}
          <div className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-sm text-white/45">Searching…</p>
            ) : users.length ? (
              users.map((user) => (
                <button key={user._id} type="button" disabled={Boolean(sharingId)} onClick={() => void share(user)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-red-950/30 disabled:opacity-50">
                  <Image src={user.profilePic || "/user.svg"} alt="" width={42} height={42} unoptimized className="h-11 w-11 rounded-full object-cover" />
                  <span className="min-w-0 flex-1 truncate font-semibold">@{user.username}</span>
                  <span className="text-xs font-bold text-red-300">{sharingId === user._id ? "Sending…" : "Send"}</span>
                </button>
              ))
            ) : query.trim().length >= 2 ? (
              <p className="p-4 text-sm text-white/45">No matching users.</p>
            ) : (
              <p className="p-4 text-sm text-white/45">Type at least two characters to search.</p>
            )}
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}
