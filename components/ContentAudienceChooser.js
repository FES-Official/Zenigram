"use client";

import { useEffect, useState } from "react";
import { IoPeopleOutline, IoGlobeOutline } from "react-icons/io5";

export default function ContentAudienceChooser({ target }) {
  const [closeOnesOnly, setCloseOnesOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const key = target === "clip" ? "zenigram-clip-audience" : "zenigram-post-audience";
    setCloseOnesOnly(window.localStorage.getItem(key) === "close");
  }, [target]);

  const choose = async (value) => {
    setCloseOnesOnly(value);
    const key = target === "clip" ? "zenigram-clip-audience" : "zenigram-post-audience";
    window.localStorage.setItem(key, value ? "close" : "all");
    setSaving(true);
    try {
      await fetch("/api/content-audience", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, closeOnesOnly: value }),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pointer-events-auto fixed left-1/2 top-4 z-[80] w-[min(94vw,620px)] -translate-x-1/2 rounded-2xl border border-red-900/50 bg-[#110507]/95 p-2 shadow-2xl backdrop-blur-xl sm:top-5">
      <div className="mb-1 px-2 text-[9px] font-bold uppercase tracking-[0.24em] text-red-300/60">Audience</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={saving} onClick={() => choose(false)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${!closeOnesOnly ? "border-red-400 bg-red-600/20 text-white" : "border-red-950 bg-black/20 text-zinc-500"}`}>
          <IoGlobeOutline /> Everyone
        </button>
        <button type="button" disabled={saving} onClick={() => choose(true)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${closeOnesOnly ? "border-amber-300 bg-amber-300/15 text-amber-100" : "border-red-950 bg-black/20 text-zinc-500"}`}>
          <IoPeopleOutline /> Close Ones only
        </button>
      </div>
    </div>
  );
}
