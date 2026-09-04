"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

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

function extractCoordinatePair(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const direct = text.match(
    /^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/,
  );
  if (direct) {
    const lat = Number(direct[1]);
    const lng = Number(direct[2]);
    return validCoordinates(lat, lng) ? { lat, lng } : null;
  }

  let url;
  try {
    url = new URL(text);
  } catch {
    return null;
  }


  const q =
    url.searchParams.get("q") ||
    url.searchParams.get("query") ||
    url.searchParams.get("center");
  const fromQuery = q ? extractCoordinatePair(q) : null;
  if (fromQuery) return fromQuery;

  for (const pattern of [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  ]) {
    const match = text.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (validCoordinates(lat, lng)) return { lat, lng };
  }

  return null;
}

const subscribe = () => () => {};

export default function LocationPickerDialog({ onClose, onSelect }) {
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const mapsPreviewUrl = useMemo(
    () =>
      selection
        ? `https://www.google.com/maps/@${selection.lat},${selection.lng},17z`
        : "https://www.google.com/maps",
    [selection],
  );

  const parseGoogleMapsLink = (value = googleMapsUrl) => {
    const parsed = extractCoordinatePair(value);
    if (!parsed) {
      setSelection(null);
      setConfirmed(false);
      setError(
        "Paste a valid Google Maps link containing latitude and longitude, or enter the coordinates shown by Google Maps.",
      );
      return;
    }

    setSelection({
      lat: roundCoordinate(parsed.lat),
      lng: roundCoordinate(parsed.lng),
    });
    setConfirmed(false);
    setError("");
  };

  const save = () => {
    if (!selection || !validCoordinates(selection.lat, selection.lng)) {
      setError("A valid Google Maps location is required before posting.");
      return;
    }
    if (!confirmed) {
      setError("Please confirm that you checked the exact location in Google Maps.");
      return;
    }

    onSelect({
      lat: selection.lat,
      lng: selection.lng,
      verified: true,
    });
  };

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-99999 flex items-center justify-center bg-black/85 p-3 backdrop-blur-md"
    >
      <motion.section
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Verify story location with Google Maps"
        className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-red-500/20 bg-[#100607] text-white shadow-2xl"
      >
        <header className="shrink-0 border-b border-white/10 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.24em] text-red-400">
                Required before posting
              </p>
              <h2 className="mt-1 text-xl font-black sm:text-2xl">
                Verify story location
              </h2>
              <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
                Find the exact place in Google Maps yourself, then paste the Google Maps link here.
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
          <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
            <div className="space-y-3">
              <div className="rounded-2xl border border-red-500/15 bg-red-950/20 p-4">
                <p className="text-sm font-bold">1. Find the exact location</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Open Google Maps, find the exact place, then copy the Maps URL.
                </p>
                <a
                  href="https://www.google.com/maps"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex rounded-xl bg-red-600 px-4 py-2 text-xs font-bold transition hover:bg-red-500"
                >
                  Open Google Maps
                </a>
              </div>

              <label className="block rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="text-sm font-bold">2. Paste Google Maps link</span>
                <textarea
                  value={googleMapsUrl}
                  onChange={(event) => {
                    setGoogleMapsUrl(event.target.value);
                    setConfirmed(false);
                    setError("");
                  }}
                  placeholder="https://www.google.com/maps/@23.2599,77.4126,17z"
                  rows={3}
                  className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-xs text-white outline-none focus:border-red-500/50"
                />
                <button
                  type="button"
                  onClick={() => parseGoogleMapsLink()}
                  className="mt-3 w-full rounded-xl border border-red-500/30 bg-red-600/15 px-4 py-2.5 text-xs font-bold text-red-200 transition hover:bg-red-600/25"
                >
                  Read coordinates
                </button>
              </label>

              <label className="block rounded-2xl border border-white/10 bg-black/30 p-4">
                <span className="text-sm font-bold">3. Coordinate fallback</span>
                <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                  Enter the exact latitude, longitude pair displayed by Google Maps.
                </p>
                <input
                  type="text"
                  placeholder="23.259900, 77.412600"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const value = event.currentTarget.value;
                      setGoogleMapsUrl(value);
                      parseGoogleMapsLink(value);
                    }
                  }}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white outline-none focus:border-red-500/50"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300">
                  {error}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
                <iframe
                  title="Google Maps location preview"
                  src={mapsPreviewUrl}
                  className="h-64 w-full border-0 sm:h-72"
                  loading="lazy"
                />
              </div>

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
                  <p className="mt-2 text-sm text-zinc-500">No location verified yet.</p>
                )}
              </div>

              <label className="flex cursor-pointer gap-3 rounded-2xl border border-red-500/20 bg-red-950/20 p-4">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-600"
                />
                <span className="text-xs leading-5 text-zinc-300">
                  I checked this exact point in Google Maps and confirm these coordinates are the location I want attached to this story.
                </span>
              </label>

              <p className="text-[11px] leading-4 text-zinc-600">
                This confirms the selected Google Maps coordinates; it does not prove physical presence.
              </p>
            </div>
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
            disabled={!selection || !confirmed}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Verify location & continue
          </button>
        </footer>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
