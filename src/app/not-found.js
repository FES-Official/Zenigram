import Link from "next/link";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <main className="zen-page grid min-h-screen place-items-center px-5 py-10 text-white">
      <motion.section
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="zen-glass w-full max-w-lg rounded-3xl p-8 text-center"
      >
        <p className="text-7xl font-black tracking-[-0.08em] text-red-400/80">404</p>
        <h1 className="mt-2 text-2xl font-black">This page drifted off the map.</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
          The destination does not exist or is no longer available.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex rounded-full bg-red-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-red-950/30 hover:bg-red-500"
        >
          Return to Zenigram
        </Link>
      </motion.section>
    </main>
  );
}
