"use client";

import { Marker } from "react-map-gl/mapbox";
import Image from "next/image";

export default function StoryMarker({ group, onClick }) {
  const story = group.stories[0];
  const storyCount = group.stories.length;

  return (
    <Marker
      longitude={group.longitude}
      latitude={group.latitude}
      anchor="bottom"
    >
      <button
        type="button"
        onClick={() => onClick(group)}
        aria-label={`Open ${storyCount} ${storyCount === 1 ? "story" : "stories"}`}
        className="group relative h-16 w-12"
      >
        <span className="absolute inset-0 rotate-3 border border-cyan-200/70 bg-cyan-300/15 shadow-[0_0_18px_rgba(34,211,238,0.8)] transition-transform group-hover:rotate-0 group-hover:scale-110" />
        <Image
          src={story.mediaUrl}
          alt=""
          fill
          sizes="48px"
          unoptimized
          className="object-cover p-1"
        />
        {storyCount > 1 && (
          <span className="absolute -right-2 -top-2 z-10 grid h-6 min-w-6 place-items-center rounded-full bg-pink-500 px-1 text-xs font-bold text-white shadow-[0_0_12px_rgba(236,72,153,.8)]">
            {storyCount}
          </span>
        )}
        <span className="absolute -bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-200 shadow-[0_0_12px_4px_rgba(34,211,238,0.8)]" />
      </button>
    </Marker>
  );
}
