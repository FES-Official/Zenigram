"use client";

import { useEffect } from "react";

export default function ClusterMarker({ map, lng, lat, count, onClick }) {
  useEffect(() => {
    const Marker3DInteractiveElement =
      window.google?.maps?.maps3d?.Marker3DInteractiveElement;

    if (!map || !Marker3DInteractiveElement) {
      return undefined;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", `Open ${count} stories`);
    button.textContent = String(count);

    Object.assign(button.style, {
      width: "48px",
      height: "48px",
      borderRadius: "999px",
      border: "1px solid rgba(207,250,254,.95)",
      background: "rgba(7,16,25,.92)",
      color: "#cffafe",
      fontWeight: "700",
      cursor: "pointer",
      boxShadow: "0 0 22px rgba(34,211,238,.75)",
      transition: "transform 160ms ease",
    });

    button.addEventListener("mouseenter", () => {
      button.style.transform = "scale(1.1)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.transform = "scale(1)";
    });

    const marker = new Marker3DInteractiveElement({
      position: {
        lat: Number(lat),
        lng: Number(lng),
        altitude: 0,
      },
      altitudeMode: "CLAMP_TO_GROUND",
      title: `${count} stories`,
      drawsWhenOccluded: true,
    });

    marker.append(button);

    const handleClick = () => onClick();
    marker.addEventListener("gmp-click", handleClick);
    map.append(marker);

    return () => {
      marker.removeEventListener("gmp-click", handleClick);
      marker.remove();
    };
  }, [map, lng, lat, count, onClick]);

  return null;
}
