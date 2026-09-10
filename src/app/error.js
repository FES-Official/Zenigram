"use client";

import { useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error("Zenigram application error:", error);
  }, [error]);

  return (
    <main className="zen-page grid min-h-screen place-items-center px-5 py-10 text-white">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="zen-glass w-full max-w-lg rounded-3xl p-7 text-center sm:p-9"
      >
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-500/10 text-xl font-black text-red-300">
          !
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.24em] text-red-300/80">
          Something went wrong
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Zenigram hit a bump.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
          The page could not finish rendering. Your data is not intentionally cleared by this screen.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-red-950/30 hover:bg-red-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-bold text-white/80 hover:bg-white/10 hover:text-white"
          >
            Back home
          </Link>
        </div>
      </motion.section>
    </main>
  );
}
