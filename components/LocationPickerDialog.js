"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useEffect, useState, useSyncExternalStore } from "react";

function roundCoordinate(value) {
  return Number(Number(value).toFixed(6));
}

function validCoordinates(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function parseCoordinatePair(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const match = text.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  return validCoordinates(lat, lng)
    ? { lat: roundCoordinate(lat), lng: roundCoordinate(lng) }
    : null;
}

const subscribe = () => () => {};

export default function LocationPickerDialog({ onClose, onSelect }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const applySelection = (lat, lng) => {
    if (!validCoordinates(lat, lng)) {
      setSelection(null);
      setError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return false;
    }

    const next = {
      lat: roundCoordinate(lat),
      lng: roundCoordinate(lng),
    };
    setSelection(next);
    setLatitude(String(next.lat));
    setLongitude(String(next.lng));
    setError("");
    return true;
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("Location access is not available in this browser.");
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        applySelection(coords.latitude, coords.longitude);
        setLocating(false);
      },
      (geoError) => {
        setLocating(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied. Enter the coordinates manually instead."
            : "Unable to read your current location. Enter the coordinates manually instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const readCoordinates = () => {
    const parsed = parseCoordinatePair(`${latitude},${longitude}`);
    if (!parsed) {
      setSelection(null);
      setError("Enter a valid latitude and longitude.");
      return;
    }
    applySelection(parsed.lat, parsed.lng);
  };

  const save = () => {
    const parsed = selection || parseCoordinatePair(`${latitude},${longitude}`);
    if (!parsed) {
      setError("Select or enter a valid latitude and longitude before continuing.");
      return;
    }

    onSelect({ lat: parsed.lat, lng: parsed.lng });
  };

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md"
    >
      <motion.section
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Select story coordinates"
        className="flex max-h-[94vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-red-500/20 bg-[#100607] text-white shadow-2xl"
      >
        <header className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.24em] text-red-400">
                Story location
              </p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">
                Place your story on the globe
              </h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
                Zenigram only needs the latitude and longitude. No map-link verification is required.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-500/15 bg-red-950/20 p-4">
              <p className="text-sm font-bold">Use your current location</p>
              <p className="mt-1 text-xs leading-5 text-zinc-400">
                Your browser can provide the coordinates directly. Zenigram stores the numeric coordinates used by the globe.
              </p>
              <button
                type="button"
                onClick={useCurrentLocation}
                disabled={locating}
                className="mt-3 inline-flex rounded-xl bg-red-600 px-4 py-2 text-xs font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {locating ? "Getting location…" : "Use my current location"}
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-sm font-bold">Or enter coordinates manually</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Latitude must be between -90 and 90. Longitude must be between -180 and 180.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[.16em] text-zinc-500">
                    Latitude
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="-90"
                    max="90"
                    value={latitude}
                    onChange={(event) => {
                      setLatitude(event.target.value);
                      setSelection(null);
                      setError("");
                    }}
                    placeholder="23.259900"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-white outline-none focus:border-red-500/50"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[.16em] text-zinc-500">
                    Longitude
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="-180"
                    max="180"
                    value={longitude}
                    onChange={(event) => {
                      setLongitude(event.target.value);
                      setSelection(null);
                      setError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") readCoordinates();
                    }}
                    placeholder="77.412600"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-white outline-none focus:border-red-500/50"
                  />
                </label>
              </div>

              <button
                type="button"
                onClick={readCoordinates}
                className="mt-3 w-full rounded-xl border border-red-500/30 bg-red-600/15 px-4 py-2.5 text-xs font-bold text-red-200 transition hover:bg-red-600/25"
              >
                Use these coordinates
              </button>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
                {error}
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-zinc-500">
                Selected coordinates
              </p>
              {selection ? (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white/5 p-3">
                    <p className="text-[10px] text-zinc-500">Latitude</p>
                    <p className="mt-1 text-sm font-black">{selection.lat.toFixed(6)}</p>
                  </div>
                  <div className="rounded-xl bg-white/5 p-3">
                    <p className="text-[10px] text-zinc-500">Longitude</p>
                    <p className="mt-1 text-sm font-black">{selection.lng.toFixed(6)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">No coordinates selected yet.</p>
              )}
            </div>

            <p className="text-[11px] leading-4 text-zinc-600">
              These coordinates are used only to position the story on Zenigram’s global story map.
            </p>
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-4 sm:p-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!selection}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Select location & continue
          </button>
        </footer>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
