"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "../../../components/navbar";

export default function ExplorePage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
      setUsers([]);
      setError("");
      return undefined;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(
          `/api/search/users?q=${encodeURIComponent(cleanQuery)}`,
          { signal: controller.signal },
        );
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.message || "Search failed");
        }

        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Search failed");
          setUsers([]);
        }
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [query]);

  return (
    <main className="min-h-screen bg-linear-to-br from-zinc-950 via-red-950 to-black text-white">
      <Navbar />

      <section className="mx-auto min-h-screen w-full max-w-4xl px-4 pb-24 pt-6 md:ml-20 md:pb-10">
        <div className="mb-6">
          <h1 className="text-3xl font-black">Explore</h1>
          <p className="mt-2 text-sm text-red-100/60">
            Search creators, friends, and new people to follow.
          </p>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/70 p-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search username..."
            className="w-full rounded-lg border border-red-400/20 bg-zinc-950 px-4 py-3 text-white outline-none transition placeholder:text-zinc-500 focus:border-red-400"
          />

          <div className="mt-4 min-h-48">
            {loading ? (
              <p className="text-sm text-red-100/60">Searching...</p>
            ) : error ? (
              <p className="text-sm text-red-200">{error}</p>
            ) : query.trim().length < 2 ? (
              <p className="text-sm text-red-100/50">
                Type at least 2 letters to find people.
              </p>
            ) : users.length === 0 ? (
              <p className="text-sm text-red-100/50">No users found.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {users.map((user) => (
                  <Link
                    key={user._id}
                    href={`/profile/${user.username}`}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition hover:border-red-300/40 hover:bg-red-500/10"
                  >
                    <Image
                      src={
                        user.profilePic ||
                        "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif"
                      }
                      alt={user.username}
                      width={48}
                      height={48}
                      unoptimized
                      className="h-12 w-12 rounded-full object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {user.username}
                      </p>
                      <p className="text-xs text-red-100/45">View profile</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
