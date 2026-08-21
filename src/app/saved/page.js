"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Navbar from "../../../components/navbar";
import { getPostMediaItems } from "../../../components/PostMediaCarousel";

export default function SavedPage() {
  const [posts, setPosts] = useState([]);
  const [collections, setCollections] = useState([]);

  const [newCollectionName, setNewCollectionName] = useState("");
  const [selectedCollectionId, setSelectedCollectionId] = useState("");

  const [selectedPost, setSelectedPost] = useState(null);
  const [collectionPickerPost, setCollectionPickerPost] = useState(null);

  const [loading, setLoading] = useState(true);
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [updatingPostId, setUpdatingPostId] = useState("");

  const [pageError, setPageError] = useState("");
  const [actionError, setActionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadSaved = useCallback(async () => {
    try {
      setLoading(true);
      setPageError("");

      const [savedData, collectionsData] = await Promise.all([
        requestJson("/api/posts/saved", {
          cache: "no-store",
        }),
        requestJson("/api/saved-collections", {
          cache: "no-store",
        }),
      ]);

      setPosts(Array.isArray(savedData.posts) ? savedData.posts : []);
      setCollections(
        Array.isArray(collectionsData.collections)
          ? collectionsData.collections
          : [],
      );
    } catch (error) {
      setPageError(error.message || "Failed to load saved posts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  /*
   * Prevent the page behind a popup from scrolling and close the top-most
   * popup when Escape is pressed.
   */
  useEffect(() => {
    const popupOpen = Boolean(selectedPost || collectionPickerPost);

    if (!popupOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;

      if (collectionPickerPost) {
        setCollectionPickerPost(null);
      } else {
        setSelectedPost(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedPost, collectionPickerPost]);

  const selectedCollection = useMemo(
    () =>
      collections.find(
        (collection) => String(collection._id) === String(selectedCollectionId),
      ),
    [collections, selectedCollectionId],
  );

  const visiblePosts = useMemo(() => {
    if (!selectedCollection) return posts;

    return (selectedCollection.posts || []).filter(
      (post) => post && typeof post === "object" && post._id,
    );
  }, [posts, selectedCollection]);

  /*
   * Related posts are taken from all saved posts rather than only the
   * currently selected collection.
   */
  const relatedPosts = useMemo(
    () => getRelatedPosts(selectedPost, posts, 6),
    [selectedPost, posts],
  );

  const showSuccess = (message) => {
    setSuccessMessage(message);

    window.setTimeout(() => {
      setSuccessMessage("");
    }, 2500);
  };

  const createCollection = async (event) => {
    event.preventDefault();

    const name = newCollectionName.trim();

    if (!name || creatingCollection) return;

    try {
      setCreatingCollection(true);
      setActionError("");

      const data = await requestJson("/api/saved-collections", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      setCollections(Array.isArray(data.collections) ? data.collections : []);
      setNewCollectionName("");
      showSuccess(`Collection "${name}" created.`);
    } catch (error) {
      setActionError(error.message || "Failed to create collection.");
    } finally {
      setCreatingCollection(false);
    }
  };

  const addToCollection = async (postId, collectionId) => {
    if (!postId || !collectionId || updatingPostId) return false;

    try {
      setUpdatingPostId(String(postId));
      setActionError("");

      const data = await requestJson("/api/saved-collections", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId,
          postId,
          action: "add",
        }),
      });

      setCollections(Array.isArray(data.collections) ? data.collections : []);
      setCollectionPickerPost(null);
      showSuccess("Post added to collection.");

      return true;
    } catch (error) {
      setActionError(error.message || "Failed to add post to collection.");

      return false;
    } finally {
      setUpdatingPostId("");
    }
  };

  const removeFromCollection = async (postId) => {
    if (!selectedCollectionId || !postId || updatingPostId) return;

    try {
      setUpdatingPostId(String(postId));
      setActionError("");

      const data = await requestJson("/api/saved-collections", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          collectionId: selectedCollectionId,
          postId,
          action: "remove",
        }),
      });

      setCollections(Array.isArray(data.collections) ? data.collections : []);

      if (String(selectedPost?._id) === String(postId)) {
        setSelectedPost(null);
      }

      showSuccess("Post removed from collection.");
    } catch (error) {
      setActionError(error.message || "Failed to remove post from collection.");
    } finally {
      setUpdatingPostId("");
    }
  };

  const openPost = (post) => {
    setActionError("");
    setSelectedPost(post);
  };

  return (
    <main className="min-h-screen bg-linear-to-br from-zinc-950 via-red-950 to-black text-white">
      <Navbar />

      <section className="mx-auto min-h-screen w-full max-w-5xl px-4 pb-24 pt-6 md:ml-20 md:pb-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black">Saved</h1>
            <p className="mt-1 text-sm text-red-100/60">
              View and organize your saved posts.
            </p>
          </div>

          {!loading && (
            <button
              type="button"
              onClick={loadSaved}
              className="rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold transition hover:border-red-400/50 hover:bg-red-950/50"
            >
              Refresh
            </button>
          )}
        </div>

        <form
          onSubmit={createCollection}
          className="mt-6 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/60 p-4 shadow-xl shadow-black/20 sm:flex-row"
        >
          <label htmlFor="collection-name" className="sr-only">
            New collection name
          </label>

          <input
            id="collection-name"
            value={newCollectionName}
            onChange={(event) => setNewCollectionName(event.target.value)}
            placeholder="New collection name"
            maxLength={60}
            disabled={creatingCollection}
            className="min-w-0 flex-1 rounded-lg border border-red-400/20 bg-zinc-950 px-4 py-3 text-sm outline-none transition placeholder:text-white/30 focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <button
            type="submit"
            disabled={creatingCollection || !newCollectionName.trim()}
            className="rounded-lg bg-red-500 px-5 py-3 text-sm font-bold transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingCollection ? "Creating..." : "Create collection"}
          </button>
        </form>

        {actionError && (
          <div
            role="alert"
            className="mt-4 flex items-start justify-between gap-4 rounded-lg border border-red-400/30 bg-red-950/60 p-4 text-sm text-red-100"
          >
            <p>{actionError}</p>

            <button
              type="button"
              onClick={() => setActionError("")}
              aria-label="Dismiss error"
              className="shrink-0 text-red-100/60 transition hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-950/50 p-4 text-sm text-emerald-100"
          >
            {successMessage}
          </div>
        )}

        {collections.length > 0 && (
          <div
            className="mt-4 flex gap-3 overflow-x-auto pb-2"
            aria-label="Saved collections"
          >
            <button
              type="button"
              onClick={() => setSelectedCollectionId("")}
              className={`min-w-40 rounded-lg border p-3 text-left transition ${
                !selectedCollectionId
                  ? "border-red-400 bg-red-950/50"
                  : "border-white/10 bg-black/50 hover:border-red-400/40"
              }`}
            >
              <p className="font-semibold">All saved</p>
              <p className="text-xs text-red-100/50">
                {posts.length} {posts.length === 1 ? "post" : "posts"}
              </p>
            </button>

            {collections.map((collection) => {
              const active =
                String(selectedCollectionId) === String(collection._id);
              const postCount = collection.posts?.length || 0;

              return (
                <button
                  type="button"
                  key={collection._id}
                  onClick={() =>
                    setSelectedCollectionId(String(collection._id))
                  }
                  className={`min-w-48 rounded-lg border p-3 text-left transition ${
                    active
                      ? "border-red-400 bg-red-950/50"
                      : "border-red-400/20 bg-black/50 hover:border-red-400/50"
                  }`}
                >
                  <p className="truncate font-semibold">{collection.name}</p>
                  <p className="text-xs text-red-100/50">
                    {postCount} {postCount === 1 ? "post" : "posts"}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {selectedCollection && (
          <div className="mt-6 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-widest text-red-300/60">
                Collection
              </p>
              <h2 className="truncate text-2xl font-bold">
                {selectedCollection.name}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setSelectedCollectionId("")}
              className="shrink-0 rounded-full bg-white/10 px-4 py-2 text-sm transition hover:bg-white/15"
            >
              Show all saved
            </button>
          </div>
        )}

        {loading ? (
          <SavedPostsSkeleton />
        ) : pageError ? (
          <div className="mt-6 rounded-xl border border-red-400/30 bg-red-950/40 p-6 text-red-100">
            <p>{pageError}</p>

            <button
              type="button"
              onClick={loadSaved}
              className="mt-4 rounded-full bg-red-500 px-5 py-2 text-sm font-bold transition hover:bg-red-400"
            >
              Try again
            </button>
          </div>
        ) : visiblePosts.length === 0 ? (
          <p className="mt-6 rounded-xl border border-white/10 bg-black/60 p-8 text-center text-red-100/60">
            {selectedCollection
              ? "This collection has no posts yet."
              : "Saved posts will appear here."}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visiblePosts.map((post) => (
              <SavedPostTile
                key={post._id}
                post={post}
                updating={String(updatingPostId) === String(post._id)}
                onOpen={() => openPost(post)}
                onAddToCollection={() => setCollectionPickerPost(post)}
                onRemoveFromCollection={
                  selectedCollection
                    ? () => removeFromCollection(post._id)
                    : null
                }
              />
            ))}
          </div>
        )}
      </section>

      {selectedPost && (
        <PostDetailsModal
          post={selectedPost}
          relatedPosts={relatedPosts}
          selectedCollection={selectedCollection}
          updating={String(updatingPostId) === String(selectedPost._id)}
          onClose={() => setSelectedPost(null)}
          onSelectPost={openPost}
          onAddToCollection={() => setCollectionPickerPost(selectedPost)}
          onRemoveFromCollection={() => removeFromCollection(selectedPost._id)}
        />
      )}

      {collectionPickerPost && (
        <CollectionPickerModal
          post={collectionPickerPost}
          collections={collections}
          updating={String(updatingPostId) === String(collectionPickerPost._id)}
          onChoose={(collectionId) =>
            addToCollection(collectionPickerPost._id, collectionId)
          }
          onClose={() => setCollectionPickerPost(null)}
        />
      )}
    </main>
  );
}

function SavedPostTile({
  post,
  updating,
  onOpen,
  onAddToCollection,
  onRemoveFromCollection,
}) {
  const mediaItems = getPostMediaItems(post);
  const firstMedia = mediaItems[0];

  return (
    <article className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black shadow-lg shadow-black/20">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open saved post${post.caption ? `: ${post.caption}` : ""}`}
        className="block h-full w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400"
      >
        {firstMedia?.type === "video" ? (
          <video
            src={firstMedia.url}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            muted
            playsInline
            preload="metadata"
          />
        ) : firstMedia?.type === "image" ? (
          <Image
            src={firstMedia.url}
            alt={post.caption || "Saved post"}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, 33vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-white/40">
            No media available
          </div>
        )}

        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-transparent to-black/10 opacity-80 transition group-hover:opacity-100" />

        {mediaItems.length > 1 && (
          <div className="absolute right-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
            {mediaItems.length} items
          </div>
        )}

        <div className="absolute bottom-14 left-3 right-3">
          {post.caption && (
            <p className="line-clamp-2 text-xs font-medium text-white/90">
              {post.caption}
            </p>
          )}
        </div>
      </button>

      <button
        type="button"
        disabled={updating}
        onClick={
          onRemoveFromCollection ? onRemoveFromCollection : onAddToCollection
        }
        className="absolute bottom-2 left-2 right-2 rounded-full bg-black/85 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {updating
          ? "Updating..."
          : onRemoveFromCollection
            ? "Remove from collection"
            : "Add to collection"}
      </button>
    </article>
  );
}

function PostDetailsModal({
  post,
  relatedPosts,
  selectedCollection,
  updating,
  onClose,
  onSelectPost,
  onAddToCollection,
  onRemoveFromCollection,
}) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const closeButtonRef = useRef(null);

  const mediaItems = getPostMediaItems(post);
  const activeMedia = mediaItems[activeMediaIndex];
  const author = getPostAuthor(post);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveMediaIndex(0);
  }, [post._id]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  const showPreviousMedia = () => {
    setActiveMediaIndex((currentIndex) =>
      currentIndex === 0 ? mediaItems.length - 1 : currentIndex - 1,
    );
  };

  const showNextMedia = () => {
    setActiveMediaIndex((currentIndex) =>
      currentIndex === mediaItems.length - 1 ? 0 : currentIndex + 1,
    );
  };

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/85 p-2 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="saved-post-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative grid max-h-[95vh] w-full max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Close post"
          className="absolute right-3 top-3 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/80 text-xl text-white backdrop-blur transition hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        >
          ×
        </button>

        <section className="relative flex min-h-80 items-center justify-center bg-black lg:min-h-[650px]">
          {activeMedia?.type === "video" ? (
            <video
              key={activeMedia.url}
              src={activeMedia.url}
              controls
              autoPlay
              playsInline
              className="max-h-[65vh] w-full object-contain lg:max-h-[95vh]"
            />
          ) : activeMedia?.type === "image" ? (
            <div className="relative h-[55vh] min-h-80 w-full lg:h-[95vh]">
              <Image
                src={activeMedia.url}
                alt={post.caption || "Saved post"}
                fill
                unoptimized
                priority
                sizes="(max-width: 1024px) 100vw, 70vw"
                className="object-contain"
              />
            </div>
          ) : (
            <div className="p-10 text-center text-white/40">
              This post has no available media.
            </div>
          )}

          {mediaItems.length > 1 && (
            <>
              <button
                type="button"
                onClick={showPreviousMedia}
                aria-label="Previous media"
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-2xl text-white backdrop-blur transition hover:bg-red-500"
              >
                ‹
              </button>

              <button
                type="button"
                onClick={showNextMedia}
                aria-label="Next media"
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/70 text-2xl text-white backdrop-blur transition hover:bg-red-500"
              >
                ›
              </button>

              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/65 px-3 py-2 backdrop-blur">
                {mediaItems.map((media, index) => (
                  <button
                    type="button"
                    key={`${media.url}-${index}`}
                    onClick={() => setActiveMediaIndex(index)}
                    aria-label={`Show media ${index + 1}`}
                    aria-current={
                      activeMediaIndex === index ? "true" : undefined
                    }
                    className={`h-2 rounded-full transition ${
                      activeMediaIndex === index
                        ? "w-5 bg-white"
                        : "w-2 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <aside className="flex max-h-[40vh] flex-col overflow-y-auto lg:max-h-[95vh]">
          <div className="border-b border-white/10 p-5 pr-16">
            <div className="flex items-center gap-3">
              {author.avatar ? (
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-white/10">
                  <Image
                    src={author.avatar}
                    alt={author.name}
                    fill
                    unoptimized
                    sizes="44px"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-500 text-sm font-black">
                  {author.name.charAt(0).toUpperCase()}
                </div>
              )}

              <div className="min-w-0">
                <h2 id="saved-post-title" className="truncate font-bold">
                  {author.name}
                </h2>

                {post.createdAt && (
                  <p className="text-xs text-white/45">
                    {formatPostDate(post.createdAt)}
                  </p>
                )}
              </div>
            </div>

            {post.caption && (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-white/85">
                {post.caption}
              </p>
            )}

            <button
              type="button"
              disabled={updating}
              onClick={
                selectedCollection ? onRemoveFromCollection : onAddToCollection
              }
              className="mt-5 w-full rounded-full bg-red-500 px-4 py-2.5 text-sm font-bold transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {updating
                ? "Updating..."
                : selectedCollection
                  ? `Remove from ${selectedCollection.name}`
                  : "Add to collection"}
            </button>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-bold">Related saved posts</h3>
              <span className="text-xs text-white/40">
                {relatedPosts.length} shown
              </span>
            </div>

            {relatedPosts.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {relatedPosts.map((relatedPost) => (
                  <RelatedPostTile
                    key={relatedPost._id}
                    post={relatedPost}
                    onClick={() => onSelectPost(relatedPost)}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/45">
                No other saved posts are available.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function RelatedPostTile({ post, onClick }) {
  const firstMedia = getPostMediaItems(post)[0];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open related post${post.caption ? `: ${post.caption}` : ""}`}
      className="group relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-black transition hover:border-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
    >
      {firstMedia?.type === "video" ? (
        <video
          src={firstMedia.url}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : firstMedia?.type === "image" ? (
        <Image
          src={firstMedia.url}
          alt={post.caption || "Related saved post"}
          fill
          unoptimized
          sizes="120px"
          className="object-cover transition group-hover:scale-105"
        />
      ) : (
        <span className="flex h-full items-center justify-center p-2 text-center text-[10px] text-white/35">
          No media
        </span>
      )}

      <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/20" />
    </button>
  );
}

function CollectionPickerModal({
  post,
  collections,
  updating,
  onChoose,
  onClose,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-picker-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div>
            <h2 id="collection-picker-title" className="text-lg font-bold">
              Add to collection
            </h2>
            <p className="mt-1 text-sm text-white/45">
              Choose where this post should be added.
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close collection picker"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-red-500"
          >
            ×
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-3">
          {collections.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
              <p className="text-sm text-white/60">
                Create a collection before adding this post.
              </p>

              <button
                type="button"
                onClick={onClose}
                className="mt-4 rounded-full bg-red-500 px-5 py-2 text-sm font-bold transition hover:bg-red-400"
              >
                Close
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {collections.map((collection) => {
                const alreadyAdded = collectionContainsPost(
                  collection,
                  post._id,
                );

                return (
                  <button
                    type="button"
                    key={collection._id}
                    disabled={updating || alreadyAdded}
                    onClick={() => onChoose(collection._id)}
                    className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-red-400/50 hover:bg-red-950/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {collection.name}
                      </p>
                      <p className="text-xs text-white/40">
                        {collection.posts?.length || 0} posts
                      </p>
                    </div>

                    <span className="shrink-0 text-xs font-bold text-red-300">
                      {updating
                        ? "Adding..."
                        : alreadyAdded
                          ? "Already added"
                          : "Add"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SavedPostsSkeleton() {
  return (
    <div
      className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3"
      aria-label="Loading saved posts"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="aspect-square animate-pulse rounded-xl border border-white/5 bg-white/5"
        />
      ))}
    </div>
  );
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
        data.error ||
        `Request failed with status ${response.status}.`,
    );
  }

  return data;
}

function collectionContainsPost(collection, postId) {
  return (collection.posts || []).some((post) => {
    const currentId = post && typeof post === "object" ? post._id : post;

    return String(currentId) === String(postId);
  });
}

function getPostAuthor(post) {
  const author = post.author || post.user || post.owner || post.createdBy || {};

  return {
    name:
      author.name ||
      author.username ||
      author.displayName ||
      post.username ||
      "User",
    avatar:
      author.avatar ||
      author.profilePicture ||
      author.profileImage ||
      author.image ||
      "",
  };
}

function getPostOwnerId(post) {
  const author = post.author || post.user || post.owner || post.createdBy || {};

  return String(author._id || author.id || post.authorId || post.userId || "");
}

function getPostTags(post) {
  const explicitTags = Array.isArray(post.tags)
    ? post.tags
    : Array.isArray(post.hashtags)
      ? post.hashtags
      : [];

  const captionTags =
    typeof post.caption === "string"
      ? post.caption.match(/#[\p{L}\p{N}_]+/gu) || []
      : [];

  return [...explicitTags, ...captionTags]
    .map((tag) =>
      String(typeof tag === "object" ? tag.name || tag.label || "" : tag)
        .replace(/^#/, "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

/*
 * Related-post scoring:
 * - Same author receives the strongest score.
 * - Matching category receives a score.
 * - Shared tags increase relevance.
 * - Remaining saved posts are used as a fallback.
 */
function getRelatedPosts(selectedPost, posts, limit = 6) {
  if (!selectedPost || !Array.isArray(posts)) return [];

  const selectedId = String(selectedPost._id);
  const selectedOwnerId = getPostOwnerId(selectedPost);
  const selectedTags = new Set(getPostTags(selectedPost));
  const selectedCategory = String(
    selectedPost.category?._id ||
      selectedPost.category?.name ||
      selectedPost.category ||
      "",
  ).toLowerCase();

  return posts
    .filter((post) => post?._id && String(post._id) !== selectedId)
    .map((post, originalIndex) => {
      let score = 0;

      const ownerId = getPostOwnerId(post);
      const category = String(
        post.category?._id || post.category?.name || post.category || "",
      ).toLowerCase();

      if (selectedOwnerId && ownerId && ownerId === selectedOwnerId) {
        score += 5;
      }

      if (selectedCategory && category && category === selectedCategory) {
        score += 3;
      }

      for (const tag of getPostTags(post)) {
        if (selectedTags.has(tag)) {
          score += 2;
        }
      }

      return {
        post,
        score,
        originalIndex,
      };
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        first.originalIndex - second.originalIndex,
    )
    .slice(0, limit)
    .map(({ post }) => post);
}

function formatPostDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}
