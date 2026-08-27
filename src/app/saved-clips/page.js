"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "../../../components/navbar";

const DEFAULT_AVATAR = "/user.svg";

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
  } catch {
    return "Saved clip";
  }
}

export default function SavedClipsPage() {
  const router = useRouter();
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    router.replace("/saved");
  }, [router]);

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await fetch("/api/clips/saved", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.message || "Unable to load saved clips");
      setClips(Array.isArray(data?.clips) ? data.clips : []);
    } catch (requestError) {
      setError(requestError.message || "Unable to load saved clips");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-linear-to-br from-zinc-950 via-red-950 to-black text-white">
      <Navbar />
      <section className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-24 pt-8 md:ml-20 md:pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.24em] text-red-400">Your library</p>
            <h1 className="mt-1 text-3xl font-black">Saved clips</h1>
            <p className="mt-1 text-sm text-red-100/60">Clips you bookmarked are kept here for quick access.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/saved" className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold hover:border-red-400/40">Saved posts</Link>
            <button type="button" onClick={() => void load()} className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold hover:border-red-400/40">Refresh</button>
          </div>
        </div>

        {error && <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>}

        {loading ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => <div key={index} className="aspect-9/16 animate-pulse rounded-2xl bg-white/5" />)}
          </div>
        ) : clips.length ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {clips.map((clip) => (
              <article key={clip._id} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                <Link href={`/clips?clip=${encodeURIComponent(clip._id)}`} className="block">
                  {clip.mediaType === "video" ? (
                    <video src={clip.mediaUrl} muted playsInline preload="metadata" className="aspect-9/16 w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <Image src={clip.mediaUrl} alt={clip.caption || "Saved clip"} width={360} height={640} unoptimized className="aspect-9/16 w-full object-cover transition duration-500 group-hover:scale-105" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/30 to-transparent p-3 pt-10">
                    <div className="flex items-center gap-2">
                      <Image src={clip.user?.profilePic || DEFAULT_AVATAR} alt="" width={26} height={26} unoptimized className="h-6 w-6 rounded-full object-cover" />
                      <span className="truncate text-xs font-bold">@{clip.user?.username || "creator"}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-white/70">{clip.caption || "Saved clip"}</p>
                    <p className="mt-1 text-[10px] text-white/40">Saved {formatDate(clip.savedAt)}</p>
                  </div>
                  <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold text-red-200 backdrop-blur">🔖 Saved</span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-3xl border border-white/10 bg-black/30 p-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-red-500/10 text-2xl">🔖</div>
            <h2 className="mt-4 text-xl font-bold">No saved clips yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">Open a clip, tap the three-dot menu, and choose Bookmark clip. It will appear here.</p>
            <Link href="/clips" className="mt-5 inline-flex rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold hover:bg-red-500">Explore clips</Link>
          </div>
        )}
      </section>
    </main>
  );
}
