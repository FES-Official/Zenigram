"use client";

import Image from "next/image";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export default function PostShareDialog({ post, onClose, onShared }) {
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
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(cleanQuery)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Unable to search users");
        setUsers(
          (data.users || []).filter(
            (user) => String(user._id) !== String(session?.user?.id),
          ),
        );
      } catch (requestError) {
        if (requestError.name !== "AbortError") {
          setError(requestError.message || "Unable to search users");
        }
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
      const response = await fetch(`/api/posts/${post._id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipient._id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to share post");
      onShared?.(data);
      onClose();
    } catch (requestError) {
      setError(requestError.message || "Unable to share post");
    } finally {
      setSharingId("");
    }
  };

  if (!post) return null;

  return (
    <div
      className="fixed inset-0 z-70 grid place-items-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share post"
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Share in a message</h2>
            <p className="text-xs text-white/45">Choose a particular user.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="rounded-full bg-white/10 px-3 py-1.5"
          >
            ✕
          </button>
        </div>

        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search username"
          className="mt-4 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none focus:border-red-500"
        />

        {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

        <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="p-3 text-sm text-white/45">Searching...</p>
          ) : users.length > 0 ? (
            users.map((user) => (
              <button
                key={user._id}
                type="button"
                disabled={Boolean(sharingId)}
                onClick={() => void share(user)}
                className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-white/10 disabled:opacity-50"
              >
                <Image
                  src={
                    user.profilePic ||
                    "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif"
                  }
                  alt=""
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 rounded-full object-cover"
                />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  @{user.username}
                </span>
                <span className="text-xs text-red-300">
                  {sharingId === user._id ? "Sending..." : "Send"}
                </span>
              </button>
            ))
          ) : query.trim().length >= 2 ? (
            <p className="p-3 text-sm text-white/45">No matching users.</p>
          ) : (
            <p className="p-3 text-sm text-white/45">
              Type at least two characters to search.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
