"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import Navbar from "../../../../../components/navbar";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

const DEFAULT_AVATAR = "/user.svg";

export default function ProfileSavedPage() {
  const { status } = useSession();
  const params = useParams();
  const router = useRouter();
  const routeUsername = String(params?.username || "").trim().toLowerCase();
  const [tab, setTab] = useState("posts");
  const [posts, setPosts] = useState([]);
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status !== "authenticated" || !routeUsername) return;

    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const profileResponse = await fetch("/api/user/me", { cache: "no-store" });
        const profileData = await profileResponse.json();
        if (!profileResponse.ok) throw new Error(profileData?.message || "Unable to verify your profile");

        const username = String(profileData?.user?.username || "").trim().toLowerCase();
        if (!username || username !== routeUsername) {
          router.replace(username ? `/profile/${encodeURIComponent(username)}/saved` : "/profile");
          return;
        }

        const [postsResponse, clipsResponse] = await Promise.all([
          fetch("/api/posts/saved", { cache: "no-store" }),
          fetch("/api/clips/saved", { cache: "no-store" }),
        ]);
        const postsData = await postsResponse.json();
        const clipsData = await clipsResponse.json();
        if (!postsResponse.ok) throw new Error(postsData?.message || "Unable to load saved posts");
        if (!clipsResponse.ok) throw new Error(clipsData?.message || "Unable to load saved clips");

        if (!cancelled) {
          setPosts(Array.isArray(postsData?.posts) ? postsData.posts : []);
          setClips(Array.isArray(clipsData?.clips) ? clipsData.clips : []);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || "Unable to load saved content");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [routeUsername, router, status]);

  if (status === "loading" || loading) {
    return (
      <main className="min-h-screen bg-linear-to-br from-zinc-950 via-red-950 to-black text-white">
        <Navbar />
        <section className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-24 pt-8 md:ml-20 md:pb-10">
          <p className="text-sm text-white/40">Loading your saved library…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-linear-to-br from-zinc-950 via-red-950 to-black text-white">
      <Navbar />
      <section className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-24 pt-8 md:ml-20 md:pb-10">
        <Link href={`/profile/${encodeURIComponent(routeUsername)}`} className="text-xs font-semibold text-red-300 hover:text-red-200">← Back to profile</Link>
        <h1 className="mt-3 text-3xl font-black">Saved content</h1>
        <p className="mt-1 text-sm text-white/50">Your private library of saved Zenigram posts and clips.</p>

        <div className="mt-6 flex rounded-2xl border border-white/10 bg-black/30 p-1">
          {[["posts", `Posts (${posts.length})`], ["clips", `Clips (${clips.length})`]].map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex-1 rounded-xl px-4 py-3 text-sm font-bold transition ${tab === id ? "bg-red-600 text-white" : "text-white/45 hover:text-white"}`}>{label}</button>
          ))}
        </div>

        {error && <div className="mt-5 rounded-2xl border border-red-500/20 bg-red-950/40 p-4 text-sm text-red-200">{error}</div>}

        {!error && tab === "clips" && (clips.length ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {clips.map((clip) => (
              <Link key={clip._id} href={`/clips?clip=${encodeURIComponent(clip._id)}`} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                {clip.mediaType === "video" ? <video src={clip.mediaUrl} muted playsInline preload="metadata" className="aspect-9/16 w-full object-cover transition group-hover:scale-105" /> : <Image src={clip.mediaUrl || DEFAULT_AVATAR} alt={clip.caption || "Saved clip"} width={360} height={640} unoptimized className="aspect-9/16 w-full object-cover transition group-hover:scale-105" />}
                <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black via-black/20 to-transparent p-3 pt-10">
                  <p className="truncate text-xs font-bold">@{clip.user?.username || "creator"}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] text-white/65">{clip.caption || "Saved clip"}</p>
                </div>
                <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px]">🔖</span>
              </Link>
            ))}
          </div>
        ) : <Empty title="No saved clips" />)}

        {!error && tab === "posts" && (posts.length ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {posts.map((post) => {
              const media = post.mediaItems?.[0] || { url: post.mediaUrl, type: post.mediaType };
              return (
                <Link key={post._id} href={`/profile/${encodeURIComponent(post.user?.username || "")}`} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  {media.type === "video" ? <video src={media.url} muted playsInline preload="metadata" className="aspect-square w-full object-cover" /> : <Image src={media.url || DEFAULT_AVATAR} alt={post.caption || "Saved post"} width={600} height={600} unoptimized className="aspect-square w-full object-cover" />}
                  <div className="p-3"><p className="line-clamp-2 text-xs text-white/65">{post.caption || "Saved post"}</p></div>
                </Link>
              );
            })}
          </div>
        ) : <Empty title="No saved posts" />)}
      </section>
    </main>
  );
}

function Empty({ title }) {
  return <div className="mt-10 rounded-3xl border border-white/10 bg-black/30 p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-red-500/10">🔖</div><h2 className="mt-4 text-lg font-bold">{title}</h2><p className="mt-2 text-sm text-white/40">Items you save will appear here.</p></div>;
}
