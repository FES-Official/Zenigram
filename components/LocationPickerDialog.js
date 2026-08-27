"use client";

import { useEffect, useMemo, useState } from "react";

function valid(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function parseLocation(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const direct = text.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (direct) {
    const lat = Number(direct[1]);
    const lng = Number(direct[2]);
    return valid(lat, lng) ? { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) } : null;
  }
  let url;
  try { url = new URL(text); } catch { return null; }
  const host = url.hostname.toLowerCase();
  if (!(host === "google.com" || host.endsWith(".google.com") || host.endsWith(".google.co.in"))) return null;
  const query = url.searchParams.get("q") || url.searchParams.get("query") || url.searchParams.get("center");
  if (query) {
    const nested = parseLocation(query);
    if (nested) return nested;
  }
  for (const pattern of [/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/]) {
    const match = text.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (valid(lat, lng)) return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    }
  }
  return null;
}

export default function LocationPickerDialog({ onClose, onSelect }) {
  const [value, setValue] = useState("");
  const [selection, setSelection] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const preview = useMemo(() => selection ? `https://www.google.com/maps/@${selection.lat},${selection.lng},17z` : "https://www.google.com/maps", [selection]);

  const readCoordinates = () => {
    const parsed = parseLocation(value);
    if (!parsed) {
      setSelection(null);
      setConfirmed(false);
      setError("Enter valid latitude, longitude coordinates or paste a Google Maps link containing coordinates.");
      return;
    }
    setSelection(parsed);
    setConfirmed(false);
    setError("");
  };

  const confirm = () => {
    if (!selection) return setError("Verify a location first.");
    if (!confirmed) return setError("Please confirm that you checked this exact point in Google Maps.");
    onSelect({ ...selection, source: "google_maps_manual", googleMapsUrl: value.trim(), verified: true });
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="story-location-title" className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-red-500/20 bg-[#100607] text-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between border-b border-white/10 px-5 py-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[.24em] text-red-400">Required before posting</p><h2 id="story-location-title" className="mt-1 text-xl font-black">Verify story location</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Find the exact place in Google Maps and paste the link or coordinates here.</p></div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20" aria-label="Close location picker">×</button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="rounded-2xl border border-red-500/15 bg-red-950/20 p-4"><p className="text-sm font-bold">1. Find the exact location</p><p className="mt-1 text-xs leading-5 text-zinc-400">Open Google Maps and copy the location link.</p><a href="https://www.google.com/maps" target="_blank" rel="noreferrer" className="mt-3 inline-flex rounded-xl bg-red-600 px-4 py-2 text-xs font-bold hover:bg-red-500">Open Google Maps</a></div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><label className="text-sm font-bold" htmlFor="story-location-input">2. Paste link or coordinates</label><textarea id="story-location-input" value={value} onChange={(event) => { setValue(event.target.value); setError(""); setConfirmed(false); }} placeholder="Google Maps URL or 23.259900, 77.412600" rows={4} className="mt-3 w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-xs outline-none focus:border-red-500/50"/><button type="button" onClick={readCoordinates} className="mt-3 w-full rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold hover:bg-red-500">Read coordinates</button></div>
              {error && <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs leading-5 text-red-300" role="alert">{error}</div>}
            </div>
            <div className="space-y-3">
              <iframe title="Google Maps preview" src={preview} className="h-64 w-full rounded-2xl border border-white/10 bg-black sm:h-72" loading="lazy" />
              <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-zinc-500">Verified coordinates</p>{selection ? <div className="mt-2 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white/5 p-3"><span className="text-[10px] text-zinc-500">Latitude</span><p className="font-black">{selection.lat.toFixed(6)}</p></div><div className="rounded-xl bg-white/5 p-3"><span className="text-[10px] text-zinc-500">Longitude</span><p className="font-black">{selection.lng.toFixed(6)}</p></div></div> : <p className="mt-2 text-sm text-zinc-500">No location verified yet.</p>}</div>
              <label className="flex cursor-pointer gap-3 rounded-2xl border border-red-500/20 bg-red-950/20 p-4"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-red-600"/><span className="text-xs leading-5 text-zinc-300">I checked this exact point in Google Maps and confirm these coordinates are the location I want attached to this story.</span></label>
            </div>
          </div>
        </div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-white/10 p-4"><button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">Cancel</button><button type="button" onClick={confirm} disabled={!selection || !confirmed} className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40">Verify location &amp; continue</button></footer>
      </section>
    </div>
  );
}
