"use client";

import { useEffect } from "react";

export default function ClusterMarker({ map, lng, lat, count, onClick }) {
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
        !Number.isFinite(Number(lat)) ||
        !Number.isFinite(Number(lng))
      ) {
        return;
      }

      const pin = new PinElement({
        background: "#ec4899",
        borderColor: "#fce7f3",
        glyphColor: "#ffffff",
        glyphText: String(count),
        scale: 1.2,
      });

      marker = new Marker3DInteractiveElement({
        position: {
          lat: Number(lat),
          lng: Number(lng),
          altitude: 0,
        },
        altitudeMode: "CLAMP_TO_GROUND",
        title: `${count} stories`,
        drawsWhenOccluded: true,
        sizePreserved: true,
        zIndex: 1100,
      });

      marker.append(pin);

      handleClick = () => onClick();
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
  }, [map, lng, lat, count, onClick]);

  return null;
}
