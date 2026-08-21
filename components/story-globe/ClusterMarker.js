"use client";

import { Marker } from "react-map-gl/mapbox";

export default function ClusterMarker({ lng, lat, count, onClick }) {
  return (
    <Marker longitude={lng} latitude={lat}>
      <button
        type="button"
        onClick={onClick}
        aria-label={`Open ${count} stories`}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-100 bg-[#071019]/90 font-bold text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.75)] transition-transform hover:scale-110"
      >
        {count}
      </button>
    </Marker>
  );
}
