"use client";

import { useEffect } from "react";

function createMarkerContent(story, storyCount) {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute(
    "aria-label",
    `Open ${storyCount} ${storyCount === 1 ? "story" : "stories"}`
  );
  button.style.position = "relative";
  button.style.display = "block";
  button.style.width = "48px";
  button.style.height = "64px";
  button.style.padding = "0";
  button.style.border = "0";
  button.style.background = "transparent";
  button.style.cursor = "pointer";
  button.style.filter =
    "drop-shadow(0 0 10px rgba(34,211,238,.65))";

  const frame = document.createElement("span");
  frame.style.position = "absolute";
  frame.style.inset = "0";
  frame.style.transform = "rotate(3deg)";
  frame.style.border = "1px solid rgba(165,243,252,.75)";
  frame.style.background = "rgba(103,232,249,.15)";
  frame.style.boxShadow = "0 0 18px rgba(34,211,238,.8)";
  frame.style.transition = "transform 180ms ease, scale 180ms ease";
  frame.style.overflow = "hidden";

  const image = document.createElement("img");
  image.src = story?.mediaUrl || "/user.svg";
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
  image.style.padding = "4px";

  const dot = document.createElement("span");
  dot.style.position = "absolute";
  dot.style.left = "50%";
  dot.style.bottom = "-8px";
  dot.style.width = "8px";
  dot.style.height = "8px";
  dot.style.transform = "translateX(-50%)";
  dot.style.borderRadius = "999px";
  dot.style.background = "#a5f3fc";
  dot.style.boxShadow = "0 0 12px 4px rgba(34,211,238,.8)";

  button.append(frame);
  frame.append(image);
  button.append(dot);

  if (storyCount > 1) {
    const badge = document.createElement("span");
    badge.textContent = String(storyCount);
    badge.style.position = "absolute";
    badge.style.right = "-8px";
    badge.style.top = "-8px";
    badge.style.zIndex = "2";
    badge.style.display = "grid";
    badge.style.placeItems = "center";
    badge.style.minWidth = "24px";
    badge.style.height = "24px";
    badge.style.padding = "0 4px";
    badge.style.borderRadius = "999px";
    badge.style.background = "#ec4899";
    badge.style.color = "#fff";
    badge.style.fontSize = "12px";
    badge.style.fontWeight = "700";
    badge.style.boxShadow = "0 0 12px rgba(236,72,153,.8)";
    button.append(badge);
  }

  button.addEventListener("mouseenter", () => {
    frame.style.transform = "rotate(0deg)";
    frame.style.scale = "1.1";
  });

  button.addEventListener("mouseleave", () => {
    frame.style.transform = "rotate(3deg)";
    frame.style.scale = "1";
  });

  return button;
}

export default function StoryMarker({ map, group, onClick }) {
  useEffect(() => {
    const Marker3DInteractiveElement =
      window.google?.maps?.maps3d?.Marker3DInteractiveElement;

    if (!map || !Marker3DInteractiveElement) {
      return undefined;
    }

    const story = group?.stories?.[0];
    if (!story) return undefined;

    const marker = new Marker3DInteractiveElement({
      position: {
        lat: Number(group.latitude),
        lng: Number(group.longitude),
        altitude: 0,
      },
      altitudeMode: "CLAMP_TO_GROUND",
      title: `${group.stories.length} Zenigram ${group.stories.length === 1 ? "story" : "stories"}`,
      drawsWhenOccluded: true,
    });

    marker.append(createMarkerContent(story, group.stories.length));

    const handleClick = () => onClick(group);
    marker.addEventListener("gmp-click", handleClick);

    map.append(marker);

    return () => {
      marker.removeEventListener("gmp-click", handleClick);
      marker.remove();
    };
  }, [map, group, onClick]);

  return null;
}
