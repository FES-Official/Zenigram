"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_FEED_PREFERENCES,
  FEED_MODES,
  FEED_SOURCE_CONTROLS,
  FEED_TOPICS,
  normalizeFeedPreferences,
} from "@/app/lib/feedRanking";

export default function FeedControlCenter({ preferences, onSaved }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => normalizeFeedPreferences(preferences || DEFAULT_FEED_PREFERENCES));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(normalizeFeedPreferences(preferences || DEFAULT_FEED_PREFERENCES));
  }, [preferences]);

  function changeMode(mode) {
    setDraft((current) => ({ ...current, mode }));
    setMessage("");
  }

  function changeTopic(topicId, value) {
    setDraft((current) => ({
      ...current,
      topicWeights: { ...current.topicWeights, [topicId]: Number(value) },
      mutedTopics: current.mutedTopics.filter((topic) => topic !== topicId),
    }));
    setMessage("");
  }

  function changeSource(sourceId, value) {
    setDraft((current) => ({
      ...current,
      sourceWeights: { ...current.sourceWeights, [sourceId]: Number(value) },
    }));
    setMessage("");
  }

  async function savePreferences() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/feed-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: draft }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Unable to save your feed settings.");

      const saved = normalizeFeedPreferences(data.preferences);
      setDraft(saved);
      setMessage("Your feed rules are saved.");
      onSaved?.(saved);
    } catch (error) {
      setMessage(error.message || "Unable to save your feed settings.");
    } finally {
      setSaving(false);
    }
  }

  function resetPreferences() {
    setDraft(normalizeFeedPreferences(DEFAULT_FEED_PREFERENCES));
    setMessage("Defaults loaded. Apply changes to save them.");
  }

  function unmuteTopic(topicId) {
    setDraft((current) => ({
      ...current,
      mutedTopics: current.mutedTopics.filter((topic) => topic !== topicId),
    }));
  }

  function clearMutedCreators() {
    setDraft((current) => ({ ...current, mutedCreators: [] }));
    setMessage("Hidden creators cleared from this draft. Apply changes to save.");
  }

  return (
    <section className="mb-5 overflow-hidden rounded-3xl border border-red-500/20 bg-gradient-to-br from-[#19090d]/95 via-[#0d0a0d]/95 to-black/95 shadow-xl shadow-red-950/15">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-red-300">Your feed. Your rules.</p>
          <h2 className="mt-1 text-lg font-black text-white">Feed Control Center</h2>
          <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-400">
            Choose what matters. Your saved choices influence ranking, and muted topics or creators are left out.
          </p>
          <p className="mt-2 text-xs font-semibold text-red-200">
            Current mode: {FEED_MODES.find((mode) => mode.id === draft.mode)?.label || "Balanced"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm font-bold text-red-100 transition hover:border-red-400/50 hover:bg-red-500/15"
        >
          {open ? "Close controls" : "Customize my feed"}
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </div>

      {open && (
        <div className="border-t border-white/8 p-4 sm:p-5">
          <div>
            <h3 className="text-sm font-bold text-white">Choose your feed mode</h3>
            <p className="mt-1 text-xs text-zinc-500">You can change this whenever your priorities change.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {FEED_MODES.map((mode) => {
                const selected = draft.mode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => changeMode(mode.id)}
                    aria-pressed={selected}
                    className={
                      "rounded-2xl border p-3 text-left transition " +
                      (selected
                        ? "border-red-400/60 bg-red-500/12 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.10)]"
                        : "border-white/8 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]")
                    }
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-bold text-white">
                      {mode.label}
                      {selected && <span className="text-[10px] font-black uppercase tracking-wider text-red-300">Selected</span>}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">{mode.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-white">What should appear more?</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Higher values give a topic more influence. Lower values reduce its influence.</p>
              <div className="mt-3 space-y-4">
                {FEED_TOPICS.map((topic) => (
                  <div key={topic.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label htmlFor={"feed-topic-" + topic.id} className="text-xs font-medium text-zinc-200">{topic.label}</label>
                      <span className="min-w-8 text-right text-xs tabular-nums text-red-200">{draft.topicWeights[topic.id]}%</span>
                    </div>
                    <input
                      id={"feed-topic-" + topic.id}
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={draft.topicWeights[topic.id]}
                      onChange={(event) => changeTopic(topic.id, event.target.value)}
                      className="h-1.5 w-full cursor-pointer accent-red-500"
                    />
                    {draft.mutedTopics.includes(topic.id) && (
                      <button type="button" onClick={() => unmuteTopic(topic.id)} className="mt-1 text-[11px] font-semibold text-amber-300 hover:text-amber-200">
                        Hidden in feed · Unmute topic
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-white">What should influence ranking?</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">These sliders control how strongly each source contributes. Set one to 0 to ignore it in ranking.</p>
              <div className="mt-4 space-y-5">
                {FEED_SOURCE_CONTROLS.map((source) => (
                  <div key={source.id}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <label htmlFor={"feed-source-" + source.id} className="text-xs font-semibold text-zinc-200">{source.label}</label>
                      <span className="text-xs tabular-nums text-red-200">{draft.sourceWeights[source.id]}%</span>
                    </div>
                    <input
                      id={"feed-source-" + source.id}
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={draft.sourceWeights[source.id]}
                      onChange={(event) => changeSource(source.id, event.target.value)}
                      className="h-1.5 w-full cursor-pointer accent-red-500"
                    />
                    <p className="mt-1 text-[11px] leading-4 text-zinc-600">{source.description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-white/8 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-white">Hidden creators</p>
                    <p className="mt-1 text-[11px] text-zinc-500">{draft.mutedCreators.length} creator(s) hidden from your feed.</p>
                  </div>
                  <button
                    type="button"
                    onClick={clearMutedCreators}
                    disabled={draft.mutedCreators.length === 0}
                    className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-red-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear all
                  </button>
                </div>
                {draft.mutedTopics.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold text-zinc-400">Muted topics</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {draft.mutedTopics.map((topicId) => (
                        <button key={topicId} type="button" onClick={() => unmuteTopic(topicId)} className="rounded-full border border-amber-400/20 bg-amber-400/5 px-2.5 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10">
                          {FEED_TOPICS.find((topic) => topic.id === topicId)?.label || topicId} ×
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p role="status" aria-live="polite" className={"min-h-5 text-xs " + (message.includes("saved") ? "text-emerald-300" : "text-zinc-400")}>{message}</p>
            <div className="flex gap-2">
              <button type="button" onClick={resetPreferences} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition hover:bg-white/5">
                Reset draft
              </button>
              <button type="button" onClick={() => void savePreferences()} disabled={saving} className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-red-500 disabled:cursor-wait disabled:opacity-60">
                {saving ? "Saving…" : "Apply feed rules"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
