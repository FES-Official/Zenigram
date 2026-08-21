import { useState, useEffect, useCallback } from "react";

export function usePostModal(posts = [], initialIndex = 0, onClose) {
  const [current, setCurrent] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [comments, setComments] = useState([]);

  const post = posts[current];

  useEffect(() => {
    if (!post?._id) return;

    let ignore = false;

    async function loadComments() {
      try {
        setLoading(true);
        setComments([]);

        const res = await fetch(`/api/post/comment?post=${post._id}`);
        const data = await res.json();

        if (!ignore) {
          setComments(Array.isArray(data.comments) ? data.comments : []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    loadComments();
    return () => (ignore = true);
  }, [post?._id]);

  const next = useCallback(() => {
    setCurrent((prev) => Math.min(prev + 1, posts.length - 1));
  }, [posts.length]);

  const prev = useCallback(() => {
    setCurrent((prev) => Math.max(prev - 1, 0));
  }, []);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") onClose?.();
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [next, prev, onClose]);

  const addComment = async () => {
    if (!text.trim() || !post?._id) return;

    try {
      const res = await fetch("/api/post/comment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: post._id, text }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to add comment");
      const newComment = data.comment || data;

      setComments((prev) => [...prev, newComment]);
      setText("");
    } catch (err) {
      console.error(err);
    }
  };

  return {
    post,
    current,
    comments,
    loading,
    text,
    setText,
    addComment,
    next,
    prev,
  };
}
