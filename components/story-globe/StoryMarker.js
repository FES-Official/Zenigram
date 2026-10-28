"use client";

import { useEffect } from "react";

function createPin(story, storyCount, PinElement) {
  const profileImageUrl = story?._id
    ? `/api/story-globe/profile-image?storyId=${encodeURIComponent(story._id)}`
    : "/user.svg";

  const pin = new PinElement({
    background: "#06b6d4",
    borderColor: "#a5f3fc",
    glyphColor: "#ffffff",
    glyphSrc: new URL(profileImageUrl, window.location.origin),
    scale: 1.5,
  });

  pin.title = story?.userId?.username
    ? `${story.userId.username} · ${storyCount} ${storyCount === 1 ? "story" : "stories"}`
    : `${storyCount} ${storyCount === 1 ? "story" : "stories"}`;

  return pin;
}

export default function StoryMarker({ map, maps3d, group, onClick }) {
  useEffect(() => {
    let cancelled = false;
    let marker;
    let handleClick;

    const createMarker = async () => {
      // Use the library instance passed by Globe.js rather than assuming
      // importLibrary always exposes the same global namespace.
      const Marker3DInteractiveElement =
        maps3d?.Marker3DInteractiveElement;
      if (!map || !Marker3DInteractiveElement) return;

      const story = group?.stories?.[0];
      const lat = Number(group?.latitude);
      const lng = Number(group?.longitude);

      if (
        !story?._id ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < -90 ||
        lat > 90 ||
        lng < -180 ||
        lng > 180
      ) {
        return;
      }

      const markerLibrary = await window.google.maps.importLibrary("marker");
      if (cancelled) return;

      const PinElement = markerLibrary?.PinElement;

      marker = new Marker3DInteractiveElement({
        position: { lat, lng, altitude: 0 },
        altitudeMode: "CLAMP_TO_GROUND",
        title: `${group.stories.length} Zenigram ${group.stories.length === 1 ? "story" : "stories"}`,
        drawsWhenOccluded: true,
        sizePreserved: true,
        collisionBehavior: "REQUIRED",
        zIndex: 1000,
      });

      if (PinElement) {
        marker.append(createPin(story, group.stories.length, PinElement));
      } else {
        // Keep a visible clickable marker even if the marker library fails.
        marker.label = String(group.stories.length);
      }

      handleClick = () => onClick?.(group);
      marker.addEventListener("gmp-click", handleClick);
      map.append(marker);
    };

    createMarker().catch((error) => {
      if (!cancelled) {
        console.error("Unable to create Stories Globe marker:", error);
      }
    });

    return () => {
      cancelled = true;
      if (marker && handleClick) {
        marker.removeEventListener("gmp-click", handleClick);
      }
      marker?.remove();
    };
  }, [map, maps3d, group, onClick]);

  return null;
}
