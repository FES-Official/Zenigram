"use client";

import { FEED_TOPICS } from "@/app/lib/feedRanking";

export default function TopicPicker({ selectedTopics = [], onChange, max = 5 }) {
  const selected = Array.isArray(selectedTopics) ? selectedTopics : [];

  function toggle(topicId) {
    if (selected.includes(topicId)) {
      onChange?.(selected.filter((id) => id !== topicId));
      return;
    }
    if (selected.length >= max) return;
    onChange?.([...selected, topicId]);
  }

  return (
    <fieldset className="mt-4 rounded-2xl border border-red-900/35 bg-black/20 p-3">
      <legend className="px-1 text-xs font-bold text-zinc-200">Choose topics</legend>
      <p className="mb-3 text-[11px] leading-5 text-zinc-500">
        Selected topics help the right people find your content. Choose up to {max}; you can leave this blank.
      </p>
      <div className="flex flex-wrap gap-2">
        {FEED_TOPICS.map((topic) => {
          const active = selected.includes(topic.id);
          const disabled = !active && selected.length >= max;
          return (
            <button
              key={topic.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(topic.id)}
              className={
                "rounded-full border px-3 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 " +
                (active
                  ? "border-red-400/60 bg-red-500/15 text-red-100"
                  : "border-white/10 bg-white/[0.025] text-zinc-400 hover:border-red-500/40 hover:text-zinc-100")
              }
            >
              {active ? "✓ " : ""}{topic.label}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-zinc-600" aria-live="polite">
        {selected.length} of {max} selected
      </p>
    </fieldset>
  );
}
