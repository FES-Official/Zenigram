"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { FEED_TOPICS } from "@/app/lib/feedRanking";

export default function ClipOptions({
  clip,
  onClose,
  onPreference,
  onSave,
  onFeedFeedback,
  currentUserId = "",
}) {
  useEffect(() => {
    const close = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);

  const topicId = Array.isArray(clip?.feedTopics) ? clip.feedTopics[0] : null;
  const topicLabel = FEED_TOPICS.find((topic) => topic.id === topicId)?.label || topicId;
  const creatorId = String(clip?.userId || clip?.user?._id || "");
  const canAdjustCreator = Boolean(creatorId && creatorId !== String(currentUserId || ""));

  return (
    <AnimatePresence>
      {clip && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={onClose}
          className="fixed inset-0 z-80 flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Clip options"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            onMouseDown={(event) => event.stopPropagation()}
            className="max-h-[90dvh] w-full max-w-sm overflow-y-auto rounded-[26px] border border-white/10 bg-[#100607] p-2 text-white shadow-2xl"
          >
            <div className="px-4 pb-3 pt-4">
              <p className="text-sm font-black">Tune your clips feed</p>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Your direct choices update your saved feed rules and affect both clips and posts.
              </p>
            </div>

            <div className="mx-2 mb-2 rounded-2xl border border-white/8 bg-white/[0.025] p-3">
              <p className="text-xs font-bold text-zinc-100">Why this clip?</p>
              <ul className="mt-2 space-y-1 text-[11px] leading-5 text-zinc-400">
                {(Array.isArray(clip.feedReasons) && clip.feedReasons.length
                  ? clip.feedReasons
                  : ["Ranked using your selected feed mode and preferences."]
                ).map((reason) => <li key={reason}>• {reason}</li>)}
              </ul>
              {Array.isArray(clip.feedTopics) && clip.feedTopics.length > 0 && (
                <p className="mt-2 text-[10px] text-zinc-600">
                  Topics: {clip.feedTopics.map((id) => FEED_TOPICS.find((topic) => topic.id === id)?.label || id).join(", ")}
                </p>
              )}
            </div>

            {topicId ? (
              <div className="px-2 pb-2">
                <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {topicLabel}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => void onFeedFeedback?.({ action: "moreTopic", topic: topicId })} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-left text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/10">
                    + Show more
                  </button>
                  <button type="button" onClick={() => void onFeedFeedback?.({ action: "lessTopic", topic: topicId })} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-left text-[11px] font-semibold text-amber-200 hover:bg-amber-500/10">
                    − Show less
                  </button>
                  <button type="button" onClick={() => void onFeedFeedback?.({ action: "muteTopic", topic: topicId })} className="col-span-2 rounded-xl border border-white/10 px-3 py-3 text-left text-[11px] font-semibold text-zinc-300 hover:bg-white/5">
                    Hide {topicLabel} from my feed
                  </button>
                </div>
              </div>
            ) : (
              <p className="mx-3 mb-2 rounded-xl bg-black/20 p-3 text-[11px] leading-5 text-zinc-500">
                This clip has no detected topic. Creator-level controls are still available below.
              </p>
            )}

            {canAdjustCreator && (
              <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
                <button type="button" onClick={() => void onFeedFeedback?.({ action: "moreCreator", creatorId })} className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-left text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/10">
                  More from creator
                </button>
                <button type="button" onClick={() => void onFeedFeedback?.({ action: "lessCreator", creatorId })} className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-3 text-left text-[11px] font-semibold text-amber-200 hover:bg-amber-500/10">
                  Less from creator
                </button>
                <button type="button" onClick={() => void onFeedFeedback?.({ action: "muteCreator", creatorId })} className="col-span-2 rounded-xl border border-red-500/20 px-3 py-3 text-left text-[11px] font-semibold text-red-200 hover:bg-red-500/10">
                  Hide this creator
                </button>
              </div>
            )}

            <button type="button" onClick={() => onPreference("interested")} className={"w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition hover:bg-emerald-500/10 " + (clip.viewerPreference === "interested" ? "bg-emerald-500/10 text-emerald-300" : "text-white")}>
              <span className="mr-3">✓</span>{clip.viewerPreference === "interested" ? "Interested · selected" : "Interested"}
            </button>
            <button type="button" onClick={() => onPreference("not_interested")} className="mt-1 w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10">
              <span className="mr-3">⊘</span>Not interested in this clip
            </button>
            <button type="button" onClick={onSave} className={"mt-1 w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition hover:bg-amber-500/10 " + (clip.viewerSaved ? "bg-amber-500/10 text-amber-300" : "text-white")}>
              <span className="mr-3">🔖</span>{clip.viewerSaved ? "Remove bookmark" : "Bookmark clip"}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full rounded-2xl bg-white/7 px-4 py-3 text-sm font-bold text-zinc-300 transition hover:bg-white/12">Cancel</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
