"use client";

import { useEffect } from "react";

function createPin(story, storyCount, PinElement) {
  const pin = new PinElement({
    background: "#06b6d4",
    borderColor: "#a5f3fc",
    glyphColor: "#ffffff",
    glyphText: storyCount > 1 ? String(storyCount) : "S",
    scale: 1.15,
  });

  pin.title = story?.username
    ? `${story.username} · ${storyCount} ${storyCount === 1 ? "story" : "stories"}`
    : `${storyCount} ${storyCount === 1 ? "story" : "stories"}`;

  return pin;
}

export default function StoryMarker({ map, group, onClick }) {
  useEffect(() => {
    let cancelled = false;
    let marker;
    let handleClick;

    const createMarker = async () => {
      const maps3d = window.google?.maps?.maps3d;
      if (!map || !maps3d?.Marker3DInteractiveElement) return;

      const { Marker3DInteractiveElement } = maps3d;
      const { PinElement } =
        (await window.google.maps.importLibrary("marker")) || {};

      if (
        cancelled ||
        !PinElement ||
        !group?.stories?.[0] ||
        !Number.isFinite(Number(group.latitude)) ||
        !Number.isFinite(Number(group.longitude))
      ) {
        return;
      }

      const story = group.stories[0];

      marker = new Marker3DInteractiveElement({
        position: {
          lat: Number(group.latitude),
          lng: Number(group.longitude),
          altitude: 0,
        },
        altitudeMode: "CLAMP_TO_GROUND",
        title: `${group.stories.length} Zenigram ${group.stories.length === 1 ? "story" : "stories"}`,
        drawsWhenOccluded: true,
        sizePreserved: true,
        zIndex: 1000,
      });

      marker.append(createPin(story, group.stories.length, PinElement));

      handleClick = () => onClick(group);
      marker.addEventListener("gmp-click", handleClick);
      map.append(marker);
    };

    void createMarker();

    return () => {
      cancelled = true;
      if (marker && handleClick) {
        marker.removeEventListener("gmp-click", handleClick);
      }
      marker?.remove();
    };
  }, [map, group, onClick]);

  return null;
}
