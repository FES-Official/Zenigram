/* eslint-disable @next/next/no-img-element */
/* eslint-disable react/jsx-no-comment-textnodes */
"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";

const MAX_DURATION = 120;
const MAX_ITEMS = 20;
const FILTERS = [
  { id: "none", label: "Original", css: "none" },
  { id: "cinema", label: "Cinema", css: "contrast(1.15) saturate(.9) brightness(.92)" },
  { id: "warm", label: "Warm", css: "sepia(.2) saturate(1.15) brightness(1.04)" },
  { id: "cool", label: "Cool", css: "hue-rotate(185deg) saturate(.85)" },
  { id: "mono", label: "Mono", css: "grayscale(1) contrast(1.15)" },
];
const TRANSITIONS = ["cut", "fade", "slide", "zoom"];
const FONT_FAMILIES = ["Arial", "Arial Black", "Bookman", "Brush Script MT", "Comic Sans MS", "Copperplate", "Courier New", "Garamond", "Georgia", "Helvetica", "Impact", "Lucida Console", "Monaco", "Palatino", "Tahoma", "Times New Roman", "Trebuchet MS", "Verdana", "system-ui", "ui-rounded"];

function id() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function readVideoDuration(src) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(Number.isFinite(video.duration) ? video.duration : 10);
    video.onerror = () => resolve(10);
    video.src = src;
  });
}

function formatTime(value) {
  const seconds = Math.max(0, Math.round(Number(value || 0)));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CreateClipPage() {
  const fileRef = useRef(null);
  const previewRef = useRef(null);
  const videoRef = useRef(null);
  const itemsRef = useRef([]);
  const playbackAnchorRef = useRef(0);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [caption, setCaption] = useState("");
  const [transition, setTransition] = useState("fade");
  const [textLayers, setTextLayers] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const timeline = useMemo(() => {
    let cursor = 0;
    return items.map((item, index) => {
      const entry = { ...item, index, start: cursor, end: cursor + item.duration };
      cursor = entry.end;
      return entry;
    });
  }, [items]);
  const totalDuration = timeline.at(-1)?.end || 0;
  const activeEntry =
    timeline.find((item) => currentTime >= item.start && currentTime < item.end) ||
    timeline.at(-1) ||
    null;
  const selectedItem = items.find((item) => item.id === selectedId) || items[0] || null;
  const selectedText = textLayers.find((item) => item.id === selectedTextId) || null;

  useEffect(() => {
    if (!playing || !totalDuration) return undefined;
    const timer = window.setInterval(() => {
      const next = (performance.now() - playbackAnchorRef.current) / 1000;
      if (next >= totalDuration) {
        setCurrentTime(totalDuration);
        setPlaying(false);
      } else {
        setCurrentTime(next);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [playing, totalDuration]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || activeEntry?.type !== "video") return;
    const target = activeEntry.trimStart + Math.max(0, currentTime - activeEntry.start);
    if (Math.abs(video.currentTime - target) > 0.35) video.currentTime = target;
    if (playing) video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [activeEntry, currentTime, playing]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(
    () => () =>
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.src)),
    [],
  );

  const addMedia = async (event) => {
    const files = Array.from(event.target.files || []).slice(0, MAX_ITEMS - items.length);
    event.target.value = "";
    if (!files.length) return;
    setError("");
    const next = [];
    for (const file of files) {
      const type = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "";
      if (!type) continue;
      const src = URL.createObjectURL(file);
      const sourceDuration = type === "video" ? await readVideoDuration(src) : 10;
      next.push({
        id: id(),
        file,
        src,
        type,
        name: file.name,
        sourceDuration,
        duration: type === "video" ? Math.min(sourceDuration, 15) : 3,
        trimStart: 0,
        filter: "none",
      });
    }
    setItems((current) => [...current, ...next]);
    setSelectedId(next[0]?.id || selectedId);
  };

  const updateItem = (itemId, updates) => {
    setItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    );
  };

  const removeItem = (itemId) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (item) URL.revokeObjectURL(item.src);
    const next = items.filter((candidate) => candidate.id !== itemId);
    setItems(next);
    setSelectedId(next[0]?.id || null);
    setCurrentTime(0);
  };

  const moveItem = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addText = () => {
    const layer = {
      id: id(),
      text: "New text",
      start: Math.min(currentTime, Math.max(0, totalDuration - 1)),
      end: Math.min(totalDuration || 3, currentTime + 3),
      x: 50,
      y: 50,
      size: 32,
      color: "#ffffff",
      background: true,
      backgroundColor: "#000000",
      showBorder: false,
      borderColor: "#ffffff",
      borderWidth: 2,
      rotation: 0,
      fontFamily: "Arial",
      fontWeight: 700,
      italic: false,
      underline: false,
      strike: false,
    };
    setTextLayers((current) => [...current, layer]);
    setSelectedTextId(layer.id);
  };

  const updateText = (updates) => {
    if (!selectedTextId) return;
    setTextLayers((current) =>
      current.map((item) => (item.id === selectedTextId ? { ...item, ...updates } : item)),
    );
  };

  const submit = async () => {
    if (!items.length || saving) return;
    if (totalDuration > MAX_DURATION) {
      setError("Shorten the timeline to 2 minutes or less.");
      return;
    }
    try {
      setSaving(true);
      setProgress(0);
      setError("");
      const mediaItems = [];
      for (let index = 0; index < items.length; index += 1) {
        const uploaded = await uploadMediaDirect(items[index].file, {
          onProgress: (value) => {
            const percent = value <= 1 ? value * 100 : value;
            setProgress(Math.round(((index + percent / 100) / items.length) * 92));
          },
        });
        mediaItems.push({ key: uploaded.key, type: items[index].type });
      }
      const response = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          mediaItems,
          timeline: items.map((item, index) => ({
            mediaIndex: index,
            duration: item.duration,
            trimStart: item.trimStart,
            filter: item.filter,
          })),
          textLayers,
          transition,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create clip");
      setProgress(100);
      window.location.assign("/clips");
    } catch (requestError) {
      setError(requestError.message || "Failed to create clip");
      setSaving(false);
    }
  };

  const visibleText = textLayers.filter(
    (layer) => currentTime >= layer.start && currentTime <= layer.end,
  );
  const activeFilter = FILTERS.find((item) => item.id === activeEntry?.filter)?.css || "none";
  const togglePlayback = () => {
    const nextTime = currentTime >= totalDuration ? 0 : currentTime;
    if (currentTime >= totalDuration) setCurrentTime(0);
    playbackAnchorRef.current = performance.now() - nextTime * 1000;
    setPlaying((current) => !current);
  };

  return (
    <main className="min-h-screen bg-[#070203] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_10%_5%,rgba(220,38,38,.22),transparent_30%),radial-gradient(circle_at_90%_85%,rgba(76,5,25,.35),transparent_32%)]" />
      <input ref={fileRef} hidden multiple type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" onChange={addMedia} />
      <div className="relative mx-auto max-w-[1500px] px-3 py-4 sm:px-6">
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link href="/clips" className="grid h-11 w-11 place-items-center rounded-full border border-red-900/50 bg-[#160709] text-xl text-red-200">×</Link>
          <div className="text-center"><p className="text-[10px] font-bold uppercase tracking-[.32em] text-red-500">Clip studio</p><h1 className="text-xl font-black sm:text-2xl">Create a clip</h1></div>
          <button type="button" onClick={() => void submit()} disabled={!items.length || saving || totalDuration > MAX_DURATION} className="rounded-full bg-linear-to-r from-red-800 to-red-500 px-5 py-2.5 text-sm font-black shadow-lg shadow-red-950/50 disabled:opacity-35">{saving ? `${progress}%` : "Share"}</button>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(360px,1fr)_350px]">
          <aside className="order-2 rounded-[28px] border border-red-900/45 bg-[#120607]/90 p-4 backdrop-blur-xl xl:order-1">
            <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold">Timeline media</h2><p className="text-xs text-zinc-600">{items.length} of {MAX_ITEMS} files</p></div><button type="button" onClick={() => fileRef.current?.click()} disabled={items.length >= MAX_ITEMS} className="grid h-10 w-10 place-items-center rounded-full bg-white text-xl text-black disabled:opacity-30">+</button></div>
            {!items.length ? (
              <button type="button" onClick={() => fileRef.current?.click()} className="grid min-h-64 w-full place-items-center rounded-3xl border border-dashed border-red-900/70 bg-black/20 p-6 text-center hover:border-red-500"><span><strong className="block text-lg">Add photos or videos</strong><span className="mt-2 block text-xs leading-5 text-zinc-600">Combine up to 20 sources into a vertical clip.</span></span></button>
            ) : (
              <div className="max-h-[64vh] space-y-2 overflow-y-auto pr-1">
                {items.map((item, index) => (
                  <motion.div layout key={item.id} className={`flex items-center gap-2 rounded-2xl border p-2 ${selectedItem?.id === item.id ? "border-red-400 bg-red-500/10" : "border-red-950/60 bg-black/20"}`}>
                    <button type="button" onClick={() => { setSelectedId(item.id); setCurrentTime(timeline[index]?.start || 0); }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                      // eslint-disable-next-line @next/next/no-img-element, @next/next/no-img-element
                      {item.type === "video" ? <video src={item.src} className="h-14 w-11 rounded-xl object-cover" muted /> : <img src={item.src} alt="" className="h-14 w-11 rounded-xl object-cover" />}
                      <span className="min-w-0"><strong className="block text-xs">{index + 1}. {item.type}</strong><span className="block truncate text-[10px] text-zinc-600">{item.name}</span><span className="text-[10px] text-red-300">{item.duration.toFixed(1)}s</span></span>
                    </button>
                    <span className="grid grid-cols-2 gap-1 text-xs"><button type="button" disabled={index === 0} onClick={() => moveItem(index, -1)} className="rounded-lg bg-white/7 p-1.5 disabled:opacity-20">↑</button><button type="button" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)} className="rounded-lg bg-white/7 p-1.5 disabled:opacity-20">↓</button><button type="button" onClick={() => removeItem(item.id)} className="col-span-2 rounded-lg bg-red-950/60 p-1.5 text-red-300">Remove</button></span>
                  </motion.div>
                ))}
              </div>
            )}
          </aside>

          <section className="order-1 xl:order-2">
            <div className="mx-auto max-w-[430px]">
              <div className="mb-2 flex justify-between text-xs text-zinc-500"><span>Live 9:16 preview</span><span className={totalDuration > MAX_DURATION ? "text-red-400" : ""}>{formatTime(totalDuration)} / 2:00</span></div>
              <div ref={previewRef} className="relative aspect-9/16 overflow-hidden rounded-[28px] border border-red-900/60 bg-black shadow-[0_30px_100px_rgba(127,29,29,.28)]">
                {activeEntry ? (
                  <AnimatePresence mode="wait">
                    <motion.div key={activeEntry.id} initial={transition === "cut" ? {} : transition === "slide" ? { opacity: 0, x: 70 } : transition === "zoom" ? { opacity: 0, scale: 1.15 } : { opacity: 0 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={transition === "cut" ? {} : { opacity: 0 }} transition={{ duration: transition === "cut" ? 0 : 0.28 }} className="absolute inset-0">
                      {activeEntry.type === "video" ? <video ref={videoRef} key={activeEntry.id} src={activeEntry.src} playsInline className="h-full w-full object-cover" style={{ filter: activeFilter }} /> : <img src={activeEntry.src} alt="Clip preview" className="h-full w-full object-cover" style={{ filter: activeFilter }} />}
                    </motion.div>
                  </AnimatePresence>
                ) : <button type="button" onClick={() => fileRef.current?.click()} className="grid h-full w-full place-items-center text-center text-zinc-600"><span><span className="block text-5xl text-red-900">+</span><strong className="mt-3 block text-sm text-zinc-400">Add media to start</strong></span></button>}
                {visibleText.map((layer) => (
                  <motion.button key={layer.id} type="button" drag dragMomentum={false} onClick={() => setSelectedTextId(layer.id)} onDragEnd={(_, info) => { const rect = previewRef.current?.getBoundingClientRect(); if (!rect) return; setTextLayers((current) => current.map((item) => item.id === layer.id ? { ...item, x: Math.min(95, Math.max(5, item.x + (info.offset.x / rect.width) * 100)), y: Math.min(95, Math.max(5, item.y + (info.offset.y / rect.height) * 100)) } : item)); }} className={`absolute z-20 max-w-[85%] -translate-x-1/2 -translate-y-1/2 cursor-move rounded-lg px-2 py-1 text-center ${selectedTextId === layer.id ? "ring-2 ring-red-400" : ""}`} style={{ left: `${layer.x}%`, top: `${layer.y}%`, fontSize: `${layer.size}px`, color: layer.color, background: layer.background ? layer.backgroundColor : "transparent", border: layer.showBorder ? `${layer.borderWidth}px solid ${layer.borderColor}` : "none", transform: `translate(-50%,-50%) rotate(${layer.rotation}deg)`, fontFamily: layer.fontFamily, fontWeight: layer.fontWeight, fontStyle: layer.italic ? "italic" : "normal", textDecoration: [layer.underline && "underline", layer.strike && "line-through"].filter(Boolean).join(" ") || "none", textShadow: "0 2px 12px #000" }}>{layer.text}</motion.button>
                ))}
                <div className="absolute inset-x-4 bottom-4 z-30 flex items-center gap-2 rounded-2xl bg-black/65 p-2 backdrop-blur"><button type="button" onClick={togglePlayback} className="grid h-9 w-9 place-items-center rounded-full bg-red-600">{playing ? "Ⅱ" : "▶"}</button><input type="range" aria-label="Clip playhead" min={0} max={Math.max(totalDuration, 0.1)} step={0.05} value={Math.min(currentTime, totalDuration)} onChange={(event) => { const next = Number(event.target.value); setPlaying(false); setCurrentTime(next); playbackAnchorRef.current = performance.now() - next * 1000; }} className="min-w-0 flex-1 accent-red-500"/><span className="text-[10px]">{formatTime(currentTime)}</span></div>
              </div>
              <div className="mt-3 flex h-16 overflow-hidden rounded-2xl border border-red-950 bg-black/60 p-1">
                {timeline.map((entry) => <button key={entry.id} type="button" onClick={() => { setCurrentTime(entry.start); setSelectedId(entry.id); }} className={`relative min-w-8 overflow-hidden border-r border-black/70 ${entry.id === activeEntry?.id ? "ring-2 ring-inset ring-red-400" : "opacity-75"}`} style={{ flex: Math.max(entry.duration, 1) }}>{entry.type === "video" ? <video src={entry.src} muted className="h-full w-full object-cover"/> : <img src={entry.src} alt="" className="h-full w-full object-cover"/>}<span className="absolute inset-x-0 bottom-0 bg-black/70 text-[8px]">{entry.duration.toFixed(1)}s</span></button>)}
              </div>
            </div>
          </section>

          <aside className="order-3 rounded-[28px] border border-red-900/45 bg-[#120607]/90 p-4 backdrop-blur-xl">
            <div className="flex gap-2"><button type="button" onClick={addText} disabled={!items.length} className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-bold disabled:opacity-30">Add text</button><button type="button" onClick={() => fileRef.current?.click()} className="flex-1 rounded-xl border border-red-900 py-2.5 text-xs font-bold text-red-200">Add media</button></div>
            <h2 className="mt-5 font-bold">Transition</h2><div className="mt-2 grid grid-cols-4 gap-1.5">{TRANSITIONS.map((item) => <button key={item} type="button" onClick={() => setTransition(item)} className={`rounded-xl py-2 text-[10px] capitalize ${transition === item ? "bg-red-600" : "bg-black/30 text-zinc-500"}`}>{item}</button>)}</div>
            {selectedItem && <div className="mt-5 border-t border-white/7 pt-4"><div className="flex items-center justify-between"><h2 className="font-bold">Selected segment</h2><span className="text-[10px] text-red-300">{selectedItem.type}</span></div><Range label="Duration" value={selectedItem.duration} min={0.5} max={Math.min(30, selectedItem.type === "video" ? Math.max(0.5, selectedItem.sourceDuration - selectedItem.trimStart) : 12)} step={0.5} suffix="s" onChange={(duration) => updateItem(selectedItem.id, { duration })}/>{selectedItem.type === "video" && <Range label="Trim start" value={selectedItem.trimStart} min={0} max={Math.max(0, selectedItem.sourceDuration - selectedItem.duration)} step={0.5} suffix="s" onChange={(trimStart) => updateItem(selectedItem.id, { trimStart })}/>}<p className="mb-2 mt-4 text-xs text-zinc-500">Look</p><div className="grid grid-cols-3 gap-1.5">{FILTERS.map((filter) => <button key={filter.id} type="button" onClick={() => updateItem(selectedItem.id, { filter: filter.id })} className={`rounded-xl border py-2 text-[10px] ${selectedItem.filter === filter.id ? "border-red-400 bg-red-500/15" : "border-red-950 bg-black/25"}`}>{filter.label}</button>)}</div></div>}
            {selectedText && <div className="mt-5 border-t border-white/7 pt-4"><div className="flex items-center justify-between"><h2 className="font-bold">Text overlay</h2><button type="button" onClick={() => { setTextLayers((current) => current.filter((item) => item.id !== selectedText.id)); setSelectedTextId(null); }} className="text-xs text-red-400">Delete</button></div><input value={selectedText.text} onChange={(event) => updateText({ text: event.target.value.slice(0, 180) })} className="mt-3 w-full rounded-xl border border-red-950 bg-black/30 px-3 py-2 text-sm outline-none focus:border-red-500"/><select aria-label="Text font" value={selectedText.fontFamily} onChange={(event) => updateText({ fontFamily: event.target.value })} className="mt-3 w-full rounded-xl border border-red-950 bg-black/50 p-2.5 text-xs">{FONT_FAMILIES.map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}</select><div className="mt-2 grid grid-cols-4 gap-1"><button type="button" onClick={() => updateText({ fontWeight: selectedText.fontWeight === 700 ? 400 : 700 })} className={`rounded-lg py-2 text-xs font-black ${selectedText.fontWeight === 700 ? "bg-red-600" : "bg-black/30"}`}>B</button><button type="button" onClick={() => updateText({ italic: !selectedText.italic })} className={`rounded-lg py-2 text-xs italic ${selectedText.italic ? "bg-red-600" : "bg-black/30"}`}>I</button><button type="button" onClick={() => updateText({ underline: !selectedText.underline })} className={`rounded-lg py-2 text-xs underline ${selectedText.underline ? "bg-red-600" : "bg-black/30"}`}>U</button><button type="button" onClick={() => updateText({ strike: !selectedText.strike })} className={`rounded-lg py-2 text-xs line-through ${selectedText.strike ? "bg-red-600" : "bg-black/30"}`}>S</button></div><div className="mt-3 grid grid-cols-3 gap-2"><label className="text-[10px] text-zinc-500">Text<input type="color" value={selectedText.color} onChange={(event) => updateText({ color: event.target.value })} className="mt-1 h-9 w-full rounded-lg bg-black"/></label><label className="text-[10px] text-zinc-500">Background<input type="color" value={selectedText.backgroundColor} onChange={(event) => updateText({ backgroundColor: event.target.value, background: true })} className="mt-1 h-9 w-full rounded-lg bg-black"/></label><label className="text-[10px] text-zinc-500">Border<input type="color" value={selectedText.borderColor} onChange={(event) => updateText({ borderColor: event.target.value, showBorder: true })} className="mt-1 h-9 w-full rounded-lg bg-black"/></label></div><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => updateText({ background: !selectedText.background })} className={`rounded-xl py-2 text-[10px] ${selectedText.background ? "bg-red-600" : "bg-black/30 text-zinc-500"}`}>Background</button><button type="button" onClick={() => updateText({ showBorder: !selectedText.showBorder })} className={`rounded-xl py-2 text-[10px] ${selectedText.showBorder ? "bg-red-600" : "bg-black/30 text-zinc-500"}`}>Border</button></div><Range label="Font size" value={selectedText.size} min={14} max={72} step={1} suffix="px" onChange={(size) => updateText({ size })}/><Range label="Rotation" value={selectedText.rotation} min={-180} max={180} step={1} suffix="°" onChange={(rotation) => updateText({ rotation })}/><Range label="Starts" value={selectedText.start} min={0} max={Math.max(0, selectedText.end - 0.5)} step={0.5} suffix="s" onChange={(start) => updateText({ start })}/><Range label="Ends" value={selectedText.end} min={Math.min(totalDuration, selectedText.start + 0.5)} max={Math.max(totalDuration, selectedText.start + 0.5)} step={0.5} suffix="s" onChange={(end) => updateText({ end })}/></div>}
            <label className="mt-5 block border-t border-white/7 pt-4"><span className="mb-2 flex justify-between text-xs text-zinc-500"><span>Caption</span><span>{caption.length}/500</span></span><textarea value={caption} onChange={(event) => setCaption(event.target.value.slice(0, 500))} rows={4} placeholder="Write a caption…" className="w-full resize-none rounded-2xl border border-red-950 bg-black/30 p-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-500"/></label>
            {totalDuration > MAX_DURATION && <p className="mt-3 rounded-xl bg-red-950/50 p-3 text-xs text-red-200">Timeline is {formatTime(totalDuration - MAX_DURATION)} too long.</p>}{error && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-950/30 p-3 text-xs text-red-200">{error}</p>}
          </aside>
        </div>
      </div>
    </main>
  );
}

function Range({ label, value, min, max, step, suffix, onChange }) {
  return <label className="mt-4 block"><span className="mb-2 flex justify-between text-xs text-zinc-500"><span>{label}</span><span className="text-zinc-300">{Number(value).toFixed(step < 1 ? 1 : 0)}{suffix}</span></span><input type="range" aria-label={label} value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-red-600"/></label>;
}
