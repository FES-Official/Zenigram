"use client";

import { useState } from "react";
import PostCard from "./postCard";
import PostModal from "./postModal";

export default function PostGrid({ posts }) {
  const [activeIndex, setActiveIndex] = useState(null);

  return (
    <>
      <div className="grid grid-cols-3 gap-0.5">
        {posts.map((post, index) => (
          <PostCard
            key={post._id}
            post={post}
            onClick={() => setActiveIndex(index)}
          />
        ))}
      </div>

      {activeIndex !== null && (
        <PostModal
          posts={posts}
          index={activeIndex}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </>
  );
}
