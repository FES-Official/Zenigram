export default function Loading() {
  return (
    <main
      className="zen-page grid min-h-screen place-items-center px-6 text-white"
      aria-busy="true"
      aria-label="Loading Zenigram"
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-red-400/25 bg-red-950/30 shadow-2xl shadow-red-950/30">
          <span className="absolute inset-0 rounded-2xl border border-red-400/20 zen-pulse" />
          <span className="text-xl font-black tracking-tight text-red-300">Z+</span>
        </div>
        <div>
          <p className="text-lg font-black tracking-tight">Loading Zenigram</p>
          <p className="mt-1 text-sm text-zinc-500">Preparing your world…</p>
        </div>
        <div className="zen-skeleton h-1.5 w-48 rounded-full" />
      </div>
    </main>
  );
}
