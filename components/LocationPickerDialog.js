/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

const INITIAL_LOCATION = {
  lat: 20.5937,
  lng: 78.9629,
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function latToWorldY(lat) {
  const radians = (clamp(lat, -85, 85) * Math.PI) / 180;

  return (
    (1 - Math.asinh(Math.tan(radians)) / Math.PI) /
    2
  );
}

function worldYToLat(value) {
  return (
    (Math.atan(
      Math.sinh(Math.PI * (1 - 2 * value))
    ) *
      180) /
    Math.PI
  );
}

export default function LocationPickerDialog({
  onClose,
  onSelect,
}) {
  const [mounted, setMounted] = useState(false);

  const [selection, setSelection] =
    useState(INITIAL_LOCATION);

  const [center, setCenter] =
    useState(INITIAL_LOCATION);

  const [pinPosition, setPinPosition] = useState({
    x: 50,
    y: 50,
  });

  const [zoom, setZoom] = useState(11);

  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [onClose]);

  const mapUrl = useMemo(() => {
    return `https://www.google.com/maps?q=${center.lat},${center.lng}&z=${zoom}&output=embed`;
  }, [center.let, center.lng, zoom]);

  const setCoordinates = (
    lat,
    lng,
    { recenter = true } = {}
  ) => {
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return;
    }

    const next = {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    };

    setSelection(next);

    if (recenter) {
      setCenter(next);

      setPinPosition({
        x: 50,
        y: 50,
      });
    }

    setError("");
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setError(
        "Location is not supported by this browser."
      );
      return;
    }

    setError("");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setCoordinates(
          coords.latitude,
          coords.longitude
        );
      },
      (locationError) => {
        console.error(
          "Geolocation error:",
          locationError
        );

        setError(
          "Unable to get your location. Allow location access or choose a point on the map."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const choosePoint = (event) => {
    const rect =
      event.currentTarget.getBoundingClientRect();

    if (!rect.width || !rect.height) {
      return;
    }

    const relativeX = clamp(
      (event.clientX - rect.left) / rect.width,
      0,
      1
    );

    const relativeY = clamp(
      (event.clientY - rect.top) / rect.height,
      0,
      1
    );

    const worldSize =
      256 * 2 ** zoom;

    const centerX =
      ((center.lng + 180) / 360) *
      worldSize;

    const centerY =
      latToWorldY(center.lat) *
      worldSize;

    const pointX =
      centerX +
      (relativeX - 0.5) *
        rect.width;

    const pointY =
      centerY +
      (relativeY - 0.5) *
        rect.height;

    const lng =
      ((((pointX / worldSize) * 360 + 540) %
        360) -
        180);

    const lat = worldYToLat(
      clamp(
        pointY / worldSize,
        0.001,
        0.999
      )
    );

    setCoordinates(lat, lng, {
      recenter: false,
    });

    setPinPosition({
      x: relativeX * 100,
      y: relativeY * 100,
    });
  };

  const pan = (latAmount, lngAmount) => {
    const scale =
      0.55 *
      2 ** Math.max(0, 11 - zoom);

    setCenter((current) => ({
      lat: clamp(
        current.lat +
          latAmount * scale,
        -85,
        85
      ),

      lng:
        ((((current.lng +
          lngAmount * scale) +
          540) %
          360) -
          180),
    }));
  };

  const save = () => {
    const { lat, lng } = selection;

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setError(
        "Choose a valid point on the map."
      );
      return;
    }

    onSelect({
      lat,
      lng,
    });
  };

  if (!mounted) {
    return null;
  }

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-99999 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md"
    >
      <motion.section
        initial={{
          opacity: 0,
          y: 22,
          scale: 0.97,
        }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}
        exit={{
          opacity: 0,
          y: 22,
        }}
        transition={{
          duration: 0.2,
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Choose story location"
        className="flex max-h-[95vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-red-500/20 bg-[#100607] text-white shadow-2xl"
      >
        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.24em] text-red-400">
              Required to post
            </p>

            <h2 className="mt-1 text-xl font-black sm:text-2xl">
              Choose your story location
            </h2>

            <p className="mt-1 text-xs text-zinc-500">
              Click a point on the map to set
              the latitude and longitude.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-lg transition hover:bg-white/20"
            aria-label="Close location picker"
          >
            ×
          </button>
        </header>

        {/* Content */}
        <div className="min-h-0 overflow-y-auto">
          <div className="grid gap-4 p-4 sm:grid-cols-[1.2fr_.8fr] sm:p-5">
            {/* Map */}
            <div className="relative h-72 overflow-hidden rounded-2xl border border-white/10 bg-black sm:h-[380px]">
              <iframe
                title="Google Maps location picker"
                src={mapUrl}
                className="pointer-events-none absolute inset-0 h-full w-full border-0"
                loading="lazy"
              />

              {/* Click layer */}
              <button
                type="button"
                onClick={choosePoint}
                className="absolute inset-0 z-10 cursor-crosshair"
                aria-label="Click to choose location"
              >
                <span
                  className="pointer-events-none absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-red-500 bg-red-500/20 shadow-[0_0_0_4px_rgba(0,0,0,.35)]"
                  style={{
                    left: `${pinPosition.x}%`,
                    top: `${pinPosition.y}%`,
                  }}
                />

                <span
                  className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"
                  style={{
                    left: `${pinPosition.x}%`,
                    top: `${pinPosition.y}%`,
                  }}
                />
              </button>

              {/* Pan Controls */}
              <div className="absolute bottom-2 left-2 z-20 flex gap-1">
                <button
                  type="button"
                  onClick={() => pan(1, 0)}
                  className="rounded-lg bg-black/75 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black"
                  aria-label="Pan map north"
                >
                  ↑
                </button>

                <button
                  type="button"
                  onClick={() => pan(0, -1)}
                  className="rounded-lg bg-black/75 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black"
                  aria-label="Pan map west"
                >
                  ←
                </button>

                <button
                  type="button"
                  onClick={() => pan(0, 1)}
                  className="rounded-lg bg-black/75 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black"
                  aria-label="Pan map east"
                >
                  →
                </button>

                <button
                  type="button"
                  onClick={() => pan(-1, 0)}
                  className="rounded-lg bg-black/75 px-3 py-2 text-xs font-bold text-white backdrop-blur hover:bg-black"
                  aria-label="Pan map south"
                >
                  ↓
                </button>
              </div>

              {/* Zoom Controls */}
              <div className="absolute bottom-2 right-2 z-20 flex gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) =>
                      clamp(
                        value + 1,
                        2,
                        19
                      )
                    )
                  }
                  className="rounded-lg bg-black/75 px-3 py-2 text-sm font-bold text-white backdrop-blur hover:bg-black"
                  aria-label="Zoom in"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setZoom((value) =>
                      clamp(
                        value - 1,
                        2,
                        19
                      )
                    )
                  }
                  className="rounded-lg bg-black/75 px-3 py-2 text-sm font-bold text-white backdrop-blur hover:bg-black"
                  aria-label="Zoom out"
                >
                  −
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={useDeviceLocation}
                className="w-full rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold transition hover:bg-red-500 active:scale-[0.99]"
              >
                Use my current location
              </button>

              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-zinc-500">
                  Latitude

                  <input
                    type="number"
                    readOnly
                    value={selection.lat}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>

                <label className="text-xs text-zinc-500">
                  Longitude

                  <input
                    type="number"
                    readOnly
                    value={selection.lng}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
              </div>

              {/* Information */}
              <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-[11px] leading-4 text-zinc-400">
                Pan or zoom the map, then click
                the exact place. Only latitude
                and longitude are saved with your
                story.
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
                  {error}
                </div>
              )}

              {/* Current location */}
              <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-400">
                  Selected location
                </p>

                <p className="mt-1 text-sm font-semibold text-white">
                  {selection.lat.toFixed(6)},{" "}
                  {selection.lng.toFixed(6)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={save}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold transition hover:bg-red-500"
          >
            Use this location
          </button>
        </footer>
      </motion.section>
    </motion.div>,
    document.body
  );
}
