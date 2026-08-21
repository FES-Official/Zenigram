"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function PostOptions({
  isOpen,
  onClose,
  isOwner,
  onDelete,
  onHidecount,
  hideCountHidden = false,
  isSaved = false,
  onSave,
  onReport,
  onHide,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed h-full inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-xs rounded-lg border border-white/10 bg-black p-3 text-white shadow-2xl"
            initial={{ scale: 0.92, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 24 }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {isOwner ? (
              <>
                <button
                  type="button"
                  onClick={onHidecount}
                  className="w-full rounded-md px-4 py-3 text-left transition hover:bg-zinc-800"
                >
                  {hideCountHidden ? "Show like count" : "Hide like count"}
                </button>

                <button
                  type="button"
                  onClick={onDelete}
                  className="w-full rounded-md px-4 py-3 text-left text-red-300 transition hover:bg-red-600 hover:text-white"
                >
                  Delete post
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onSave}
                  className="w-full rounded-md px-4 py-3 text-left transition hover:bg-zinc-800"
                >
                  {isSaved ? "Remove bookmark" : "Save post"}
                </button>

                <button
                  type="button"
                  onClick={onReport}
                  className="w-full rounded-md px-4 py-3 text-left text-amber-200 transition hover:bg-zinc-800"
                >
                  Report post
                </button>

                <button
                  type="button"
                  onClick={onHide}
                  className="w-full rounded-md px-4 py-3 text-left transition hover:bg-zinc-800"
                >
                  Hide from this feed
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="mt-2 w-full rounded-md bg-zinc-800 px-4 py-3 transition hover:bg-zinc-700"
            >
              Cancel
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
