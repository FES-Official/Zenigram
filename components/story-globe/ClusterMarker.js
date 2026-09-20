"use client";

import { useEffect } from "react";

export default function ClusterMarker({ map, lng, lat, count, onClick }) {
  useEffect(() => {
    if (!map || !window.google?.maps?.marker?.AdvancedMarkerElement) {
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
    button.addEventListener("click", onClick);

    const marker =
      new window.google.maps.marker.AdvancedMarkerElement({
        map,
        position: {
          lat: Number(lat),
          lng: Number(lng),
        },
        content: button,
        title: `${count} stories`,
        gmpClickable: true,
      });

    return () => {
      marker.map = null;
    };
  }, [map, lng, lat, count, onClick]);

  return null;
}
