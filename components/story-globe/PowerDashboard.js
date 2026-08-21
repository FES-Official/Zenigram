"use client";

import {
  IoFlash,
  IoGlobeOutline,
  IoLockClosed,
  IoRibbon,
  IoTimeOutline,
} from "react-icons/io5";

export default function PowerDashboard({ data, loading, error }) {
  const progression = data?.progression ?? {};

  const achievementIds = Array.isArray(progression.achievementIds)
    ? progression.achievementIds
    : [];

  const achievements = Array.isArray(data?.achievements)
    ? data.achievements
    : [];

  const storiesViewed = Number(progression.storiesViewed) || 0;
  const lastHoursGoal = Number(progression.lastHoursGoal) || 100;
  const lastHoursPoints = Number(progression.lastHoursPoints) || 0;

  const lastHoursPercent =
    lastHoursGoal > 0
      ? Math.min(
          100,
          Math.max(0, Math.round((lastHoursPoints / lastHoursGoal) * 100)),
        )
      : 0;

  return (
    <aside className="fixed bottom-3 right-3 z-30 max-h-[42vh] w-[min(92vw,360px)] overflow-y-auto border border-cyan-300/25 bg-[#061019]/92 p-4 text-white shadow-[0_0_50px_rgba(34,211,238,.18)] backdrop-blur-xl md:bottom-auto md:right-5 md:top-28 md:max-h-[calc(100vh-8.75rem)] md:w-80">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Power Dashboard
        </p>

        <h2 className="mt-1 text-2xl font-semibold md:text-3xl">
          World progression
        </h2>
      </div>

      {loading ? (
        <div className="grid min-h-72 place-items-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-300/25 border-t-cyan-300" />
        </div>
      ) : error ? (
        <div className="grid min-h-72 place-items-center text-center text-red-200">
          {String(error)}
        </div>
      ) : (
        <>
          {/* Power stats */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            <PowerStat
              label="Current Power"
              value={progression.currentPower ?? 0}
            />

            <PowerStat
              label="Best Power"
              value={progression.bestPower ?? 0}
            />

            <PowerStat
              label="Total Power"
              value={progression.totalPower ?? 0}
            />
          </div>

          {/* Last hours progress */}
          <div className="mt-6 border border-cyan-300/25 bg-black/35 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <IoTimeOutline className="shrink-0 text-2xl text-cyan-300" />

                <div>
                  <p className="font-semibold">Last Hours Master</p>
                  <p className="text-xs text-white/45">
                    Find stories inside their final four hours.
                  </p>
                </div>
              </div>

              <p className="shrink-0 font-semibold text-cyan-200">
                {lastHoursPoints}/{lastHoursGoal}
              </p>
            </div>

            <div className="mt-4 h-4 overflow-hidden bg-white/10">
              <div
                className="h-full bg-linear-to-r from-cyan-500 via-emerald-400 to-yellow-300 transition-[width] duration-500"
                style={{ width: `${lastHoursPercent}%` }}
              />
            </div>
          </div>

          {/* Achievements */}
          <div className="mt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold">
                <IoRibbon className="text-yellow-300" />
                Exploration achievements
              </p>

              <p className="text-sm text-white/45">
                {storiesViewed} stories viewed
              </p>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((achievement) => {
                const unlocked = achievementIds.includes(achievement.id);
                const requiredViews = Number(achievement.requiredViews) || 0;

                const progress =
                  requiredViews > 0
                    ? Math.min(
                        100,
                        Math.max(
                          0,
                          Math.round((storiesViewed / requiredViews) * 100),
                        ),
                      )
                    : 0;

                return (
                  <div
                    key={achievement.id}
                    className={`border p-3 ${
                      unlocked
                        ? "border-yellow-300/45 bg-yellow-300/8"
                        : "border-white/10 bg-black/25"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <IoGlobeOutline
                        className={
                          unlocked
                            ? "text-xl text-yellow-300"
                            : "text-xl text-white/25"
                        }
                      />

                      {!unlocked && (
                        <IoLockClosed className="text-white/25" />
                      )}
                    </div>

                    <p className="mt-3 font-semibold">
                      {achievement.title}
                    </p>

                    <p className="mt-1 text-xs text-white/45">
                      {achievement.description}
                    </p>

                    <div className="mt-3 h-1.5 overflow-hidden bg-white/10">
                      <div
                        className={`h-full transition-[width] duration-500 ${
                          unlocked ? "bg-yellow-300" : "bg-cyan-400"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {achievements.length === 0 && (
                <p className="col-span-full py-4 text-center text-sm text-white/40">
                  No achievements available.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function PowerStat({ label, value }) {
  return (
    <div className="border border-white/10 bg-black/30 px-2 py-4 text-center">
      <div className="flex items-center justify-center gap-1 text-yellow-300">
        <IoFlash />
        <p className="text-2xl font-semibold">{value ?? 0}</p>
      </div>

      <p className="mt-1 text-[10px] font-semibold uppercase text-white/50">
        {label}
      </p>
    </div>
  );
}