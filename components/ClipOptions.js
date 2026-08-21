"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

export default function ClipOptions({ clip, onClose, onPreference, onSave }) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  return (
    <AnimatePresence>
      {clip && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose} className="fixed inset-0 z-80 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center">
          <motion.div role="dialog" aria-modal="true" aria-label="Clip options" initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.97 }} onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-[26px] border border-white/10 bg-[#100607] p-2 text-white shadow-2xl">
            <div className="px-4 pb-3 pt-4">
              <p className="text-sm font-black">Tune your clips feed</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Your choice improves recommendations from similar creators and topics.</p>
            </div>
            <button type="button" onClick={() => onPreference("interested")} className={`w-full rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-emerald-500/10 ${clip.viewerPreference === "interested" ? "bg-emerald-500/10 text-emerald-300" : "text-white"}`}>
              <span className="mr-3">✓</span>{clip.viewerPreference === "interested" ? "Interested · selected" : "Interested"}
            </button>
            <button type="button" onClick={() => onPreference("not_interested")} className="mt-1 w-full rounded-2xl px-4 py-3.5 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10">
              <span className="mr-3">⊘</span>Not interested
            </button>
            <button type="button" onClick={onSave} className={`mt-1 w-full rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-amber-500/10 ${clip.viewerSaved ? "bg-amber-500/10 text-amber-300" : "text-white"}`}>
              <span className="mr-3">🔖</span>{clip.viewerSaved ? "Remove bookmark" : "Bookmark clip"}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full rounded-2xl bg-white/7 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/12">Cancel</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
