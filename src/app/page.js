"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";

import Navbar from "../../components/navbar";
import CommentModal from "../../components/comments";
import MoreOptions from "../../components/postOptions";
import DoubleTapLike from "../../components/doubletap";
import Likebtn from "../../components/likebtn";
import PostMediaCarousel from "../../components/PostMediaCarousel";
import PostShareDialog from "../../components/PostShareDialog";
import PostLikesModal from "../../components/PostLikesModal";

const FALLBACK_AVATAR =
  "/black-person-profile-icon-round-3d-ui-button-vector-illustration_541075-900.avif";

/* -------------------------------------------------------
   API helper
------------------------------------------------------- */

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  let data = {};

  try {
    data = await response.json();
  } catch {
    // Some DELETE endpoints may return an empty response.
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
        data?.error ||
        `Request failed with status ${response.status}`,
    );
  }

  return data;
}

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

function getUserId(value) {
  if (!value) return "";

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return String(
      value._id || value.id || value.user?._id || value.user?.id || "",
    );
  }

  return String(value);
}

function isPostLikedByUser(post, userId) {
  if (!userId || !Array.isArray(post?.likes)) return false;

  return post.likes.some((like) => getUserId(like) === String(userId));
}

/* -------------------------------------------------------
   Page
------------------------------------------------------- */

export default function Page() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [recentConversations, setRecentConversations] = useState([]);
  const [supportSuggestions, setSupportSuggestions] = useState([]);
  const [homeClips, setHomeClips] = useState([]);

  const [menuPost, setMenuPost] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [sharePost, setSharePost] = useState(null);
  const [likesPost, setLikesPost] = useState(null);

  const [error, setError] = useState("");

  const sessionUserId = session?.user?.id ? String(session.user.id) : "";

  /* -----------------------------------------------------
     Authentication
  ----------------------------------------------------- */

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  /* -----------------------------------------------------
     Feed request
  ----------------------------------------------------- */

  useEffect(() => {
    if (status !== "authenticated") return;

    const controller = new AbortController();

    async function loadPosts() {
      try {
        setLoadingPosts(true);
        setError("");

        const [data, conversationsData, suggestionsData, clipsData] = await Promise.all([
          requestJson("/api/posts", { signal: controller.signal }),
          requestJson("/api/conversations", { signal: controller.signal }).catch(
            () => ({ conversations: [] }),
          ),
          requestJson("/api/support-suggestions", { signal: controller.signal }).catch(
            () => ({ suggestions: [] }),
          ),
          requestJson("/api/clips?limit=12", { signal: controller.signal }).catch(
            () => ({ clips: [] }),
          ),
        ]);

        setPosts(Array.isArray(data?.post) ? data.post : []);
        setRecentConversations(
          Array.isArray(conversationsData?.conversations)
            ? conversationsData.conversations.slice(0, 5)
            : [],
        );
        setSupportSuggestions(
          Array.isArray(suggestionsData?.suggestions)
            ? suggestionsData.suggestions
            : [],
        );
        setHomeClips(Array.isArray(clipsData?.clips) ? clipsData.clips : []);
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error("Failed to fetch posts:", error);

        setError(
          error.message ||
            "Could not load your feed. Please refresh and try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingPosts(false);
        }
      }
    }

    void loadPosts();

    return () => {
      controller.abort();
    };
  }, [status]);

  /* -----------------------------------------------------
     Shared post state helpers
  ----------------------------------------------------- */

  const updatePost = useCallback((postId, updates) => {
    setPosts((current) =>
      current.map((post) =>
        post._id === postId
          ? {
              ...post,
              ...(typeof updates === "function" ? updates(post) : updates),
            }
          : post,
      ),
    );
  }, []);

  const removePost = useCallback((postId) => {
    setPosts((current) => current.filter((post) => post._id !== postId));

    setSelectedPost((current) => (current?._id === postId ? null : current));

    setSharePost((current) => (current?._id === postId ? null : current));
  }, []);

  const supportSuggestedUser = async (targetUserId) => {
    try {
      const data = await requestJson("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });
      if (data.supported || data.requested) {
        setSupportSuggestions((current) =>
          current.filter((user) => user._id !== targetUserId),
        );
      }
    } catch (supportError) {
      setError(supportError.message || "Unable to support this user.");
    }
  };

  /* -----------------------------------------------------
     Delete
  ----------------------------------------------------- */

  const handleDelete = async () => {
    const postId = menuPost?._id;

    if (!postId) return;

    try {
      setError("");

      await requestJson(`/api/posts/${postId}`, {
        method: "DELETE",
      });

      removePost(postId);
      setMenuPost(null);
    } catch (error) {
      console.error("Error deleting post:", error);

      setError(
        error.message || "Could not delete this post. Please try again.",
      );
    }
  };

  /* -----------------------------------------------------
     Hide like count
  ----------------------------------------------------- */

  const toggleHideCount = async () => {
    const postId = menuPost?._id;

    if (!postId) return;

    try {
      setError("");

      const data = await requestJson(`/api/posts/${postId}/hideCount`, {
        method: "POST",
      });

      updatePost(postId, {
        hideCount: Boolean(data.hideCount),
      });

      setMenuPost(null);
    } catch (error) {
      console.error("Error updating count visibility:", error);

      setError(error.message || "Could not update like count visibility.");
    }
  };

  /* -----------------------------------------------------
     Save from options menu
  ----------------------------------------------------- */

  const toggleSaveFromMenu = async () => {
    const postId = menuPost?._id;

    if (!postId) return;

    try {
      setError("");

      const data = await requestJson(`/api/posts/${postId}/save`, {
        method: "POST",
      });

      updatePost(postId, {
        viewerSaved: Boolean(data.saved),
      });

      setMenuPost(null);
    } catch (error) {
      console.error("Unable to save post:", error);

      setError(error.message || "Unable to update saved post.");
    }
  };

  /* -----------------------------------------------------
     Report
  ----------------------------------------------------- */

  const reportPost = async () => {
    const postId = menuPost?._id;

    if (!postId) return;

    /*
      Replace this with a proper ReportModal later.
    */
    const reason = window.prompt("Why are you reporting this post?");

    if (!reason?.trim()) return;

    try {
      setError("");

      await requestJson("/api/reports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          postId,
          targetUserId: menuPost?.user?._id,
          category: "post",
          reason: reason.trim(),
        }),
      });

      removePost(postId);
      setMenuPost(null);
    } catch (error) {
      console.error("Unable to report post:", error);

      setError(error.message || "Unable to report this post.");
    }
  };

  /* -----------------------------------------------------
     Auth loading
  ----------------------------------------------------- */

  if (status === "loading" || status === "unauthenticated") {
    return <FeedLoadingScreen />;
  }

  /* -----------------------------------------------------
     UI
  ----------------------------------------------------- */

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Ambient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top,rgba(127,29,29,0.32),transparent_42%)]"
      />

      <Navbar />

      <main
        className="
          relative
          mx-auto
          w-full
          max-w-6xl
          px-3
          pb-28
          pt-5
          sm:px-5
          md:ml-20
          md:pb-12
        "
      >
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {/* Stories Globe */}
            <StoriesGlobeCard />
            <HomeClipsRail clips={homeClips} />
            <MobileDiscoveryRail
              conversations={recentConversations}
              suggestions={supportSuggestions}
              currentUserId={sessionUserId}
              onSupport={supportSuggestedUser}
            />

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="
              mb-5
              flex
              items-center
              justify-between
              gap-4
              rounded-2xl
              border
              border-red-500/20
              bg-red-950/40
              px-4
              py-3
              text-sm
              text-red-100
              backdrop-blur-xl
            "
          >
            <span>{error}</span>

            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
              className="shrink-0 rounded-full p-1 text-red-200 transition hover:bg-white/10"
            >
              ✕
            </button>
          </div>
        )}

            {/* Feed */}
            <section
              aria-label="Posts"
              className="flex flex-col items-center gap-5"
            >
          {loadingPosts ? (
            <>
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </>
          ) : posts.length === 0 ? (
            <EmptyFeed />
          ) : (
            posts.map((post, index) => (
              <div key={post._id} className="contents">
                <FeedPost
                  post={post}
                  sessionUserId={sessionUserId}
                  onComment={() => setSelectedPost(post)}
                  onOptions={() => setMenuPost(post)}
                  onShare={() => setSharePost(post)}
                  onLikes={() => setLikesPost(post)}
                  onSavedChange={(saved) => updatePost(post._id, { viewerSaved: saved })}
                />
                {index % 3 === 2 && homeClips[Math.floor(index / 3)] && <InlineClipCard clip={homeClips[Math.floor(index / 3)]} />}
              </div>
            ))
          )}
            </section>
          </div>
          <HomeSideRail
            conversations={recentConversations}
            suggestions={supportSuggestions}
            currentUserId={sessionUserId}
            onSupport={supportSuggestedUser}
          />
        </div>
      </main>

      {/* Comments */}
      {selectedPost && (
        <CommentModal
          key={selectedPost._id}
          isOpen
          onClose={() => setSelectedPost(null)}
          post={selectedPost}
        />
      )}

      {/* More options */}
      {menuPost && (
        <MoreOptions
          isOpen
          onClose={() => setMenuPost(null)}
          isOwner={String(menuPost?.user?._id || "") === sessionUserId}
          hideCountHidden={Boolean(menuPost?.hideCount)}
          onHidecount={toggleHideCount}
          onDelete={handleDelete}
          isSaved={Boolean(menuPost?.viewerSaved)}
          onSave={toggleSaveFromMenu}
          onReport={reportPost}
          onHide={() => {
            removePost(menuPost._id);
            setMenuPost(null);
          }}
        />
      )}

      {/* Share */}
      {sharePost && (
        <PostShareDialog
          post={sharePost}
          onClose={() => setSharePost(null)}
          onShared={({ shareCount }) => {
            updatePost(sharePost._id, {
              shareCount,
            });
          }}
        />
      )}
      <PostLikesModal
        postId={likesPost?._id}
        isOpen={Boolean(likesPost)}
        onClose={() => setLikesPost(null)}
      />
    </div>
  );
}

function HomeSideRail({ conversations, suggestions, currentUserId, onSupport }) {
  return (
    <aside className="hidden space-y-4 lg:sticky lg:top-6 lg:block">
      <section className="overflow-hidden rounded-[26px] border border-white/8 bg-black/55 shadow-xl backdrop-blur-xl">
        <header className="flex items-center justify-between border-b border-white/7 px-4 py-3.5">
          <div>
            <h2 className="text-sm font-black">Recent messages</h2>
            <p className="text-[10px] text-zinc-600">Continue your conversations</p>
          </div>
          <Link href="/messages" className="text-xs font-semibold text-red-400 hover:text-red-300">See all</Link>
        </header>
        <div className="p-2">
          {conversations.length ? (
            conversations.map((conversation) => {
              const person = (conversation.participants || []).find(
                (participant) => String(participant._id) !== String(currentUserId),
              );
              const lastMessage = conversation.lastMessage;
              const unread =
                lastMessage &&
                String(lastMessage.sender?._id || lastMessage.sender) !== String(currentUserId) &&
                !(lastMessage.readBy || []).map(String).includes(String(currentUserId));
              return (
                <Link
                  key={conversation._id}
                  href="/messages"
                  className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-red-950/25"
                >
                  <span className="relative shrink-0">
                    <Image src={person?.profilePic || FALLBACK_AVATAR} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10" />
                    {unread && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-black bg-red-500" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-xs text-zinc-200 group-hover:text-white">{person?.username || "Conversation"}</strong>
                    <span className={`block truncate text-[11px] ${unread ? "font-semibold text-red-300" : "text-zinc-600"}`}>
                      {lastMessage?.text || (lastMessage?.media?.length ? "Shared media" : "Open conversation")}
                    </span>
                  </span>
                  <span className="text-red-500/60 transition group-hover:translate-x-0.5">›</span>
                </Link>
              );
            })
          ) : (
            <p className="px-4 py-8 text-center text-xs text-zinc-600">Your recent chats will appear here.</p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[26px] border border-red-500/12 bg-linear-to-b from-red-950/25 to-black/45 shadow-xl backdrop-blur-xl">
        <header className="flex items-center justify-between px-4 pb-2 pt-4">
          <div><h2 className="text-sm font-black">Suggested for you</h2><p className="text-[10px] text-zinc-600">Creators you may know</p></div>
          <Link href="/explore" className="text-xs font-semibold text-red-400">Explore</Link>
        </header>
        <div className="p-2">
          {suggestions.length ? suggestions.map((person) => (
            <motion.div key={person._id} layout className="flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-white/[.035]">
              <Link href={`/profile/${encodeURIComponent(person.username)}`} className="shrink-0">
                <Image src={person.profilePic || FALLBACK_AVATAR} alt="" width={42} height={42} className="h-10 w-10 rounded-full object-cover ring-1 ring-red-500/20" />
              </Link>
              <Link href={`/profile/${encodeURIComponent(person.username)}`} className="min-w-0 flex-1">
                <strong className="block truncate text-xs">{person.username}</strong>
                <span className="block truncate text-[10px] text-zinc-600">
                  {person.mutualCount ? `${person.mutualCount} mutual supporter${person.mutualCount === 1 ? "" : "s"}` : `${person.supportersCount} supporters`}
                </span>
              </Link>
              <button type="button" onClick={() => void onSupport(person._id)} className="rounded-full bg-red-600 px-3 py-1.5 text-[10px] font-bold transition hover:bg-red-500 active:scale-95">
                {person.ishidden ? "Request" : "Support"}
              </button>
            </motion.div>
          )) : <p className="px-4 py-8 text-center text-xs text-zinc-600">You are all caught up.</p>}
        </div>
      </section>
    </aside>
  );
}

function MobileDiscoveryRail({
  conversations,
  suggestions,
  currentUserId,
  onSupport,
}) {
  const recentPeople = conversations
    .map((conversation) =>
      (conversation.participants || []).find(
        (participant) => String(participant._id) !== String(currentUserId),
      ),
    )
    .filter(Boolean)
    .slice(0, 6);
  if (!recentPeople.length && !suggestions.length) return null;
  return (
    <section className="mb-5 space-y-3 lg:hidden">
      {recentPeople.length > 0 && (
        <div className="rounded-3xl border border-white/8 bg-black/45 p-3 backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black">Recent messages</h2><Link href="/messages" className="text-[10px] text-red-400">See all</Link></div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentPeople.map((person) => (
              <Link key={person._id} href="/messages" className="w-16 shrink-0 text-center">
                <Image src={person.profilePic || FALLBACK_AVATAR} alt="" width={48} height={48} className="mx-auto h-12 w-12 rounded-full object-cover ring-2 ring-red-500/20" />
                <span className="mt-1 block truncate text-[10px] text-zinc-400">{person.username}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="rounded-3xl border border-red-500/12 bg-red-950/15 p-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-black">Suggested creators</h2><Link href="/explore" className="text-[10px] text-red-400">Explore</Link></div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {suggestions.slice(0, 5).map((person) => (
              <div key={person._id} className="w-24 shrink-0 rounded-2xl bg-black/25 p-2 text-center">
                <Link href={`/profile/${encodeURIComponent(person.username)}`}><Image src={person.profilePic || FALLBACK_AVATAR} alt="" width={48} height={48} className="mx-auto h-12 w-12 rounded-full object-cover"/><span className="mt-1 block truncate text-[10px] font-semibold">{person.username}</span></Link>
                <button type="button" onClick={() => void onSupport(person._id)} className="mt-2 rounded-full bg-red-600 px-2.5 py-1 text-[9px] font-bold">{person.ishidden ? "Request" : "Support"}</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function HomeClipsRail({ clips }) {
  if (!clips.length) return null;
  return (
    <section aria-label="Recommended clips" className="mb-6 overflow-hidden rounded-[28px] border border-red-500/15 bg-linear-to-br from-red-950/25 via-black/75 to-black/90 p-4 shadow-xl backdrop-blur-xl sm:p-5">
      <header className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.22em] text-red-400">Picked for you</p>
          <h2 className="mt-1 text-lg font-black">Clips you may like</h2>
          <p className="mt-1 text-xs text-zinc-500">Personalized from what you watch, like, and share.</p>
        </div>
        <Link href="/clips" className="shrink-0 rounded-full border border-red-500/25 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-500/10">See all</Link>
      </header>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {clips.map((clip) => {
          const media = clip.mediaItems?.[0] || { url: clip.mediaUrl, type: clip.mediaType };
          const username = clip.user?.username || "creator";
          return (
            <Link key={clip._id} href={`/clips?clip=${encodeURIComponent(clip._id)}`} className="group relative aspect-9/16 w-32 shrink-0 snap-start overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-lg transition duration-300 hover:-translate-y-1 hover:border-red-400/40 sm:w-36">
              {media?.type === "video" ? (
                <video src={media.url} muted loop playsInline preload="metadata" onMouseEnter={(event) => void event.currentTarget.play().catch(() => {})} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0; }} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              ) : media?.url ? (
                <Image src={media.url} alt={clip.caption || `${username}'s clip`} fill unoptimized sizes="144px" className="object-cover transition duration-500 group-hover:scale-105" />
              ) : (
                <span className="grid h-full place-items-center text-3xl text-red-400">▶</span>
              )}
              <span className="absolute inset-0 bg-linear-to-t from-black via-transparent to-black/10" />
              <span className="absolute left-2.5 top-2.5 rounded-full border border-white/10 bg-black/45 px-2 py-1 text-[9px] font-bold backdrop-blur">▶ Clip</span>
              <span className="absolute inset-x-2.5 bottom-2.5">
                <strong className="block truncate text-[11px]">@{username}</strong>
                {clip.caption && <span className="mt-0.5 block truncate text-[10px] text-zinc-300">{clip.caption}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function InlineClipCard({ clip }) {
  const media = clip.mediaItems?.[0] || { url: clip.mediaUrl, type: clip.mediaType };
  const username = clip.user?.username || "creator";
  return <Link href={`/clips?clip=${encodeURIComponent(clip._id)}`} className="group relative w-full max-w-lg overflow-hidden rounded-3xl border border-red-500/20 bg-black shadow-xl transition hover:border-red-400/50">
    <div className="relative aspect-9/14 bg-zinc-950">
      {media?.type === "video" ? <video src={media.url} muted loop playsInline preload="metadata" onMouseEnter={(event) => void event.currentTarget.play().catch(() => {})} onMouseLeave={(event) => { event.currentTarget.pause(); event.currentTarget.currentTime = 0; }} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : media?.url ? <Image src={media.url} alt={clip.caption || `${username}'s clip`} fill unoptimized sizes="(max-width: 640px) 100vw, 512px" className="object-cover transition duration-500 group-hover:scale-105" /> : <span className="grid h-full place-items-center text-4xl text-red-400">▶</span>}
      <div className="absolute inset-0 bg-linear-to-t from-black/90 via-transparent to-black/20" />
      <span className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider">Suggested clip</span>
      <div className="absolute inset-x-4 bottom-4"><p className="font-black">@{username}</p>{clip.caption && <p className="mt-1 line-clamp-2 text-sm text-white/75">{clip.caption}</p>}<p className="mt-2 text-xs text-red-200">Watch clip →</p></div>
    </div>
  </Link>;
}

/* =======================================================
   Stories
======================================================= */

function StoriesGlobeCard() {
  return (
    <Link
      href="/stories-globe"
      className="
        group
        relative
        mb-6
        block
        overflow-hidden
        rounded-3xl
        border
        border-white/10
        bg-black
        shadow-2xl
        shadow-red-950/30
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-red-400
      "
    >
      <Image
        src="/earth-horizon.jpg"
        alt="Explore live stories around the world"
        width={1200}
        height={420}
        priority
        className="
          h-44
          w-full
          object-cover
          transition
          duration-700
          group-hover:scale-105
          sm:h-52
        "
      />

      <div className="absolute inset-0 bg-linear-to-t from-black via-black/30 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>

            <span className="text-xs font-bold uppercase tracking-[0.18em] text-red-200">
              Live stories
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight sm:text-3xl">
            Stories Globe
          </h2>

          <p className="mt-1 text-sm text-zinc-300">
            See what people are sharing around the world.
          </p>
        </div>

        <div
          aria-hidden="true"
          className="
            flex
            h-11
            w-11
            shrink-0
            items-center
            justify-center
            rounded-full
            bg-white/10
            text-xl
            backdrop-blur
            transition
            group-hover:translate-x-1
            group-hover:bg-white
            group-hover:text-black
          "
        >
          →
        </div>
      </div>
    </Link>
  );
}

/* =======================================================
   Feed Post
======================================================= */

function FeedPost({
  post,
  sessionUserId,
  onComment,
  onOptions,
  onShare,
  onLikes,
  onSavedChange,
}) {
  const likeHandlers = useRef(null);

  const [saved, setSaved] = useState(Boolean(post.viewerSaved));

  const [saving, setSaving] = useState(false);

  /*
    Important:
    Keep local bookmark state synced when the parent
    changes viewerSaved from MoreOptions.
  */
  useEffect(() => {
    setSaved(Boolean(post.viewerSaved));
  }, [post.viewerSaved]);

  const likes = Array.isArray(post.likes) ? post.likes : [];
  const likesCount = Number(post.likesCount ?? likes.length);

  const initialLiked = isPostLikedByUser(post, sessionUserId);

  const username = post?.user?.username || "unknown";

  const profilePic = post?.user?.profilePic || FALLBACK_AVATAR;

  const profileHref = post?.user?.username
    ? `/profile/${encodeURIComponent(post.user.username)}`
    : "#";

  async function toggleBookmark() {
    if (saving) return;

    const previousSaved = saved;

    /*
      Optimistic UI:
      button changes immediately.
    */
    setSaved(!previousSaved);
    setSaving(true);

    try {
      const data = await requestJson(`/api/posts/${post._id}/save`, {
        method: "POST",
      });

      const nextSaved = Boolean(data.saved);

      setSaved(nextSaved);
      onSavedChange?.(nextSaved);
    } catch (error) {
      /*
        Roll back optimistic update.
      */
      setSaved(previousSaved);

      console.error("Unable to save post:", error);

      window.alert(error.message || "Unable to save post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article
      className="
        group/post
        w-full
        max-w-lg
        overflow-hidden
        rounded-3xl
        border
        border-white/8
        bg-black/80
        shadow-xl
        shadow-black/20
        backdrop-blur-xl
        transition
        duration-300
        hover:border-white/[0.14]
      "
    >
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3.5">
        <Link
          href={profileHref}
          className="
            flex
            min-w-0
            items-center
            gap-3
            rounded-xl
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-red-400
          "
        >
          <div className="rounded-full bg-linear-to-br from-red-500 via-orange-400 to-purple-500 p-0.5">
            <div className="rounded-full bg-black p-0.5">
              <Image
                src={profilePic}
                alt={`${username}'s profile picture`}
                width={44}
                height={44}
                className="h-10 w-10 rounded-full object-cover"
              />
            </div>
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">{username}</p>

            {post?.location && (
              <p className="truncate text-xs text-zinc-500">{post.location}</p>
            )}
          </div>
        </Link>

        <button
          type="button"
          onClick={onOptions}
          aria-label={`Options for ${username}'s post`}
          className="
            ml-auto
            flex
            h-9
            w-9
            items-center
            justify-center
            rounded-full
            text-zinc-400
            transition
            hover:bg-white/10
            hover:text-white
            focus-visible:outline-none
            focus-visible:ring-2
            focus-visible:ring-red-400
          "
        >
          <MoreIcon />
        </button>
      </header>

      {/* Media */}
      <DoubleTapLike onDoubleTap={() => likeHandlers.current?.likeOnly?.()}>
        <div className="relative bg-zinc-950">
          <PostMediaCarousel
            post={post}
            className="min-h-80"
            imageClassName="max-h-[72vh] object-contain max-w-full"
            videoClassName="max-h-[72vh] object-contain max-w-full"
            sizes="(max-width: 640px) 100vw, 512px"
          />
        </div>
      </DoubleTapLike>

      {/* Body */}
      <div className="px-4 pb-4 pt-3">
        {/* Actions */}
        <div className="flex items-center gap-2">
          <Likebtn
            postId={post._id}
            initialLiked={initialLiked}
            initialCount={likesCount}
            hideCount={Boolean(post.hideCount)}
            onCountClick={onLikes}
            onReady={(handlers) => {
              likeHandlers.current = handlers;
            }}
          />

          <PostActionButton label="Open comments" onClick={onComment}>
            <CommentIcon />
          </PostActionButton>

          <PostActionButton label="Share post" onClick={onShare}>
            <ShareIcon />
          </PostActionButton>

          <button
            type="button"
            disabled={saving}
            onClick={() => void toggleBookmark()}
            aria-label={saved ? "Remove bookmark" : "Bookmark post"}
            className={`
              ml-auto
              flex
              h-10
              w-10
              items-center
              justify-center
              rounded-full
              transition
              active:scale-90
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-red-400
              disabled:cursor-wait
              disabled:opacity-50
              ${
                saved
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
              }
            `}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>

        {/* Share count */}
        {Number(post?.shareCount) > 0 && (
          <p className="mt-1 text-xs font-medium text-zinc-500">
            {post.shareCount}{" "}
            {Number(post.shareCount) === 1 ? "share" : "shares"}
          </p>
        )}

        {/* Caption */}
        {post?.caption && (
          <p className="mt-3 wrap-break-word text-sm leading-6 text-zinc-200">
            <Link
              href={profileHref}
              className="mr-2 font-bold text-white hover:underline"
            >
              {username}
            </Link>

            {post.caption}
          </p>
        )}

        {/* Comment CTA */}
        <button
          type="button"
          onClick={onComment}
          className="mt-2 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          View comments
        </button>
      </div>
    </article>
  );
}

/* =======================================================
   Action button
======================================================= */

function PostActionButton({ label, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="
        flex
        h-10
        w-10
        items-center
        justify-center
        rounded-full
        text-zinc-300
        transition
        hover:bg-white/10
        hover:text-white
        active:scale-90
        focus-visible:outline-none
        focus-visible:ring-2
        focus-visible:ring-red-400
      "
    >
      {children}
    </button>
  );
}

/* =======================================================
   Empty state
======================================================= */

function EmptyFeed() {
  return (
    <div
      className="
        w-full
        max-w-lg
        rounded-3xl
        border
        border-dashed
        border-white/10
        bg-white/3
        px-6
        py-14
        text-center
      "
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 text-2xl">
        ✦
      </div>

      <h2 className="text-lg font-bold">Your feed is quiet</h2>

      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-500">
        Follow people or create a post to start bringing your feed to life.
      </p>

      <Link
        href="/create-post"
        className="
          mt-5
          inline-flex
          rounded-full
          bg-red-500
          px-5
          py-2.5
          text-sm
          font-bold
          text-white
          transition
          hover:bg-red-400
        "
      >
        Create a post
      </Link>
    </div>
  );
}

/* =======================================================
   Loading
======================================================= */

function FeedLoadingScreen() {
  return (
    <div className="min-h-screen flex justify-center items-center bg-zinc-950 px-4 py-8">
      <div className="mx-auto w-full">
        <Image
          src="/zenigram-logo.svg"
          alt="Loading..."
          width={48}
          height={48}
          className="mx-auto h-22 w-22 object-cover"
        />
      </div>
    </div>
  );
}

function PostSkeleton() {
  return (
    <div
      className="
        w-full
        max-w-lg
        animate-pulse
        overflow-hidden
        rounded-3xl
        border
        border-white/6
        bg-black/70
      "
    >
      <div className="flex items-center gap-3 p-4">
        <div className="h-10 w-10 rounded-full bg-zinc-800" />

        <div className="space-y-2">
          <div className="h-3 w-28 rounded-full bg-zinc-800" />
          <div className="h-2.5 w-16 rounded-full bg-zinc-900" />
        </div>
      </div>

      <div className="h-96 bg-zinc-900" />

      <div className="space-y-3 p-4">
        <div className="flex gap-3">
          <div className="h-9 w-9 rounded-full bg-zinc-800" />
          <div className="h-9 w-9 rounded-full bg-zinc-800" />
          <div className="h-9 w-9 rounded-full bg-zinc-800" />
        </div>

        <div className="h-3 w-full rounded bg-zinc-800" />
        <div className="h-3 w-3/4 rounded bg-zinc-800" />
      </div>
    </div>
  );
}

/* =======================================================
   Icons
======================================================= */

function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M21 11.5a8.5 8.5 0 0 1-9 8.48 9.4 9.4 0 0 1-3.7-.9L3 21l1.7-4.7A8.5 8.5 0 1 1 21 11.5Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="m22 2-7 20-4-9-9-4 20-7Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path d="M22 2 11 13" strokeLinecap="round" />
    </svg>
  );
}

function BookmarkIcon({ filled }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}
