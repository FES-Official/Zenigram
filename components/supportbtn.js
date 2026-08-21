"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function SupportButton({
  targetUserId,
  isHiddenAccount = false,
  initialSupported = false,
  initialRequested = false,
}) {
  const [supported, setSupported] = useState(initialSupported);
  const [requested, setRequested] = useState(initialRequested);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    if (loading) return;

    try {
      setLoading(true);

      // 🔒 Hidden account logic
      if (isHiddenAccount && !supported) {
        if (requested) {
          // ❌ CANCEL REQUEST
          await fetch("/api/support/cancel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUserId }),
          });

          setRequested(false);
        } else {
          // 📩 SEND REQUEST
          const res = await fetch("/api/support", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetUserId }),
          });
          if (!res.ok) {
            throw new Error("Request failed");
          }
          const data = await res.json();
          if (data.requested) setRequested(true);
        }

        return;
      }

      // 🌍 Normal support (public account)
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await res.json();
      // reload the page when the user clicks to unsupport
      setSupported(data.supported);
      setRequested(false);
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 🔥 Button Text Logic
  const getText = () => {
    if (loading) return "Loading...";
    if (supported) return "Supporting";
    if (requested) return "Requested";
    return "Support";
  };

  // 🔥 Style Logic
  const getStyle = () => {
    if (supported) {
      return "border-white/15 bg-white/10 text-white hover:bg-red-950/45";
    }

    if (requested) {
      return "border-red-500/25 bg-red-950/55 text-red-200 hover:bg-red-900/60";
    }

    return "border-red-400/20 bg-linear-to-r from-red-700 to-red-500 text-white shadow-lg shadow-red-950/35 hover:-translate-y-0.5";
  };

  return (
    <>
      <div className="relative inline-block group">
        <motion.button
          onClick={handleClick}
          whileTap={{ scale: 0.95 }}
          className={`min-h-10 rounded-xl border px-5 py-2 text-sm font-semibold transition ${getStyle()}`}
        >
          {getText()}
        </motion.button>

        {/* 🔥 TOOLTIP (only when requested) */}
        {requested && !supported && (
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 opacity-0 group-hover:opacity-100 transition pointer-events-none">
            <div className="bg-black text-white text-xs px-3 py-1 rounded-lg shadow-lg whitespace-nowrap">
              Cancel Request
            </div>

            {/* 🔻 Tooltip Arrow */}
            <div className="w-2 h-2 bg-black rotate-45 absolute left-1/2 -translate-x-1/2 -top-1"></div>
          </div>
        )}
      </div>
    </>
  );
}
