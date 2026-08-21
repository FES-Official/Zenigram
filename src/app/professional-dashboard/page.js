"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../../components/navbar";

const FALLBACK_AVATAR = "/user.svg";

export default function ProfessionalDashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeInsight, setActiveInsight] = useState("supporters");
  const [insightDays, setInsightDays] = useState(7);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/professional-dashboard?days=${insightDays}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Unable to load insights");
        return data.dashboard;
      })
      .then(setDashboard)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [insightDays]);

  const maxTopScore = useMemo(
    () =>
      Math.max(
        1,
        ...(dashboard?.topContent || []).map(
          (item) => Number(item.views || 0) + Number(item.interactions || 0) * 3,
        ),
      ),
    [dashboard],
  );

  return (
    <main className="min-h-screen bg-[#070203] pb-24 text-white md:pl-20">
      <Navbar />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(185,28,28,.24),transparent_30%),radial-gradient(circle_at_90%_70%,rgba(76,5,25,.3),transparent_34%)]" />
      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-7">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.32em] text-red-400">Creator tools</p>
            <h1 className="mt-1 text-3xl font-black sm:text-4xl">Professional dashboard</h1>
            <p className="mt-2 text-sm text-zinc-500">Understand your audience and make your next post stronger.</p>
          </div>
          <Link href="/create-post" className="rounded-full bg-linear-to-r from-red-700 to-red-500 px-5 py-2.5 text-sm font-bold shadow-lg shadow-red-950/40 transition hover:-translate-y-0.5">
            Create content
          </Link>
        </header>

        {loading ? (
          <DashboardSkeleton />
        ) : error ? (
          <div className="rounded-3xl border border-red-500/20 bg-red-950/30 p-8 text-center text-red-100">{error}</div>
        ) : dashboard ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <section className="flex flex-col gap-5 rounded-[30px] border border-red-500/15 bg-[#120607]/90 p-5 shadow-2xl sm:flex-row sm:items-center">
              <Image src={dashboard.profile.profilePic || FALLBACK_AVATAR} alt="" width={78} height={78} className="h-20 w-20 rounded-full object-cover ring-2 ring-red-500/30" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black">@{dashboard.profile.username}</h2>
                <p className="mt-1 text-sm text-zinc-500">{dashboard.profile.supporters.toLocaleString()} supporters · {dashboard.profile.supporting.toLocaleString()} supporting</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 px-5 py-3 text-center">
                <p className="text-2xl font-black text-emerald-300">{dashboard.engagementRate}%</p>
                <p className="text-[10px] uppercase tracking-wider text-emerald-200/55">Engagement</p>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <InsightCard label="Total views" value={dashboard.totals.views} accent="red" />
              <InsightCard label="Interactions" value={dashboard.totals.interactions} accent="rose" />
              <InsightCard label="Content shared" value={dashboard.totals.content} accent="amber" />
              <InsightCard label="Total shares" value={dashboard.totals.shares} accent="emerald" />
            </section>

            <section className="rounded-[30px] border border-red-500/15 bg-[#120607]/75 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2 pb-2">
                {[['supporters','Live supporters'],['views','Views over time'],['audience','Supporters vs non-supporters'],['visits','Profile visits']].map(([id, label]) => <button key={id} type="button" onClick={() => setActiveInsight(id)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold transition ${activeInsight === id ? 'bg-red-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>{label}</button>)}
                {(activeInsight === "views" || activeInsight === "visits") && <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">Show<select value={insightDays} onChange={(event) => setInsightDays(Number(event.target.value))} className="rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs font-bold text-white outline-none focus:border-red-500"><option value={7}>7 days</option><option value={14}>14 days</option><option value={30}>30 days</option></select></label>}
              </div>
              <InsightTabs active={activeInsight} insights={dashboard.insights} />
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.3fr_.8fr]">
              <section className="rounded-[30px] border border-white/8 bg-white/[.035] p-5 backdrop-blur-xl sm:p-6">
                <div className="mb-5 flex items-end justify-between">
                  <div>
                    <h2 className="text-lg font-black">Top content</h2>
                    <p className="text-xs text-zinc-500">Ranked by views and interactions</p>
                  </div>
                  <span className="text-xs text-red-300">Performance</span>
                </div>
                {dashboard.topContent.length ? (
                  <div className="space-y-4">
                    {dashboard.topContent.map((item, index) => {
                      const score = Number(item.views || 0) + Number(item.interactions || 0) * 3;
                      return (
                        <div key={`${item.type}-${item.id}`}>
                          <div className="mb-2 flex items-center gap-3 text-sm">
                            <span className="grid h-8 w-8 place-items-center rounded-xl bg-red-950/60 font-black text-red-300">{index + 1}</span>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${item.type === "clip" ? "bg-violet-500/20 text-violet-200" : item.type === "story" ? "bg-cyan-500/20 text-cyan-200" : "bg-red-500/20 text-red-200"}`}>{item.type}</span>
                            <span className="min-w-0 flex-1 truncate">{item.caption || `Untitled ${item.type}`}</span>
                            <span className="text-xs text-zinc-500">{item.views} views · {item.interactions} actions</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-black/50">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(6, (score / maxTopScore) * 100)}%` }} transition={{ delay: index * 0.08, duration: 0.55 }} className="h-full rounded-full bg-linear-to-r from-red-800 via-red-500 to-orange-400" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="py-12 text-center text-sm text-zinc-500">Share your first post or clip to begin collecting insights.</p>
                )}
              </section>

              <section className="rounded-[30px] border border-red-500/15 bg-linear-to-b from-red-950/35 to-black/20 p-5 sm:p-6">
                <p className="text-[10px] font-bold uppercase tracking-[.25em] text-red-400">Smart suggestions</p>
                <h2 className="mt-1 text-lg font-black">Improve your content</h2>
                <div className="mt-5 space-y-3">
                  {dashboard.recommendations.map((item, index) => (
                    <motion.div key={item.title} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.08 }} className="rounded-2xl border border-white/7 bg-black/25 p-4">
                      <div className="flex gap-3">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-red-600/20 text-red-300">✦</span>
                        <div><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{item.detail}</p></div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            </div>

            <section className="grid grid-cols-3 gap-3 rounded-[28px] border border-white/8 bg-white/[.025] p-4 text-center sm:p-5">
              <MiniMetric label="Posts" value={dashboard.totals.posts} />
              <MiniMetric label="Clips" value={dashboard.totals.clips} />
              <MiniMetric label="Stories" value={dashboard.totals.stories} />
            </section>
          </motion.div>
        ) : null}
      </div>
    </main>
  );
}

function InsightCard({ label, value, accent }) {
  const colors = { red: "from-red-950/80 to-red-900/20 text-red-200", rose: "from-rose-950/70 to-black/20 text-rose-200", amber: "from-amber-950/55 to-black/20 text-amber-200", emerald: "from-emerald-950/45 to-black/20 text-emerald-200" };
  return <motion.div whileHover={{ y: -4 }} className={`rounded-[24px] border border-white/8 bg-linear-to-br p-4 sm:p-5 ${colors[accent]}`}><p className="text-2xl font-black sm:text-3xl">{Number(value || 0).toLocaleString()}</p><p className="mt-1 text-xs font-semibold text-white/45">{label}</p></motion.div>;
}

function MiniMetric({ label, value }) {
  return <div><p className="text-xl font-black text-red-200">{Number(value || 0).toLocaleString()}</p><p className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</p></div>;
}

function InsightTabs({ active, insights }) {
  if (active === "supporters") return <div className="pt-5"><p className="text-4xl font-black text-red-200">{Number(insights?.supporters || 0).toLocaleString()}</p><p className="mt-1 text-sm text-zinc-500">People currently supporting your work.</p></div>;
  if (active === "audience") { const total = Math.max(1, Number(insights?.viewedByAudience?.total || 0)); const supporters = Number(insights?.viewedByAudience?.supporters || 0); const nonSupporters = Number(insights?.viewedByAudience?.nonSupporters || 0); return <div className="pt-5"><p className="text-sm text-zinc-400">Unique viewers of your posts, stories, and clips</p><div className="mt-4 flex h-4 overflow-hidden rounded-full bg-black/60"><span className="bg-red-500" style={{ width: `${(supporters / total) * 100}%` }} /><span className="bg-orange-400" style={{ width: `${(nonSupporters / total) * 100}%` }} /></div><div className="mt-3 flex gap-5 text-sm"><span><b className="text-red-300">{supporters}</b> supporters</span><span><b className="text-orange-300">{nonSupporters}</b> non-supporters</span></div></div>; }
  const series = active === "visits" ? insights?.profileVisits?.byDay || [] : insights?.viewsByDay || [];
  const field = active === "visits" ? "visits" : "views";
  const max = Math.max(1, ...series.map((item) => Number(item[field] || 0)));
  const days = Number(insights?.periodDays || series.length || 7);
  const labelStride = days > 14 ? 5 : days > 7 ? 2 : 1;
  return <div className="pt-5"><p className="text-sm text-zinc-500">Last {days} days{active === "visits" ? ` · ${Number(insights?.profileVisits?.total || 0)} total visits` : ""}</p><div className="mt-4 flex h-32 items-end gap-1 sm:gap-2">{series.map((item, index) => <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-[10px] text-zinc-500">{item[field] || 0}</span><span className="w-full rounded-t-md bg-linear-to-t from-red-800 to-red-400" style={{ height: `${Math.max(4, (Number(item[field] || 0) / max) * 88)}px` }} /><span className="text-[9px] text-zinc-600">{index % labelStride === 0 || index === series.length - 1 ? item.day.slice(5) : ""}</span></div>)}</div></div>;
}

function DashboardSkeleton() {
  return <div className="space-y-5 animate-pulse"><div className="h-32 rounded-[30px] bg-white/5"/><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-3xl bg-white/5"/>)}</div><div className="h-80 rounded-[30px] bg-white/5"/></div>;
}
