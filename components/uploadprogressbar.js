"use client";

import { motion, AnimatePresence } from "framer-motion";

export default function UploadProgressModal({ progress, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-gray-900 text-white p-6 rounded-2xl w-80 shadow-xl"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
          >
            <h3 className="text-lg font-semibold mb-4 text-center">
              Uploading Post
            </h3>

            {/* Progress bar */}
            <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-red-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>

            <p className="text-center mt-3 text-sm text-gray-300">
              {progress}%
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
