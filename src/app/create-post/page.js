"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FiX } from "react-icons/fi";
import ImageEditor from "./ImageEditor";
import VideoEditor from "./VideoEditor";
import Link from "next/link";

export default function CreatePostPage() {
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleFileChange = (event) => {
    const selectedFiles = Array.from(event.target.files || []).slice(0, 10);
    if (selectedFiles.length === 0) return;
    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "video/mp4",
      "video/webm",
      "video/quicktime",
    ]);
    if (selectedFiles.some((selected) => !allowedTypes.has(selected.type))) {
      setError("Choose a JPG, PNG, WebP, MP4, WebM, or MOV file.");
      return;
    }
    if (
      selectedFiles.some(
        (selected) =>
          selected.type.startsWith("image/") &&
          selected.size > 20 * 1024 * 1024,
      )
    ) {
      setError("Each image must be smaller than 20 MB.");
      return;
    }
    const hasVideo = selectedFiles.some((selected) =>
      selected.type.startsWith("video/"),
    );
    if (hasVideo && selectedFiles.length > 1) {
      setError("Choose one video, or multiple images.");
      return;
    }
    setError(
      (event.target.files?.length || 0) > 10
        ? "Only the first 10 images were selected."
        : "",
    );
    setFile(selectedFiles[0]);
    setFiles(selectedFiles);
  };

  return (
    <motion.main
      className="min-h-screen bg-[#070203] bg-[radial-gradient(circle_at_12%_8%,rgba(185,28,28,.2),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(76,5,25,.28),transparent_34%)] p-4 text-white sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {!file && (
        <Link
          href="/"
          aria-label="Close"
          className="fixed left-5 top-5 z-50 rounded-full border border-red-900/50 bg-[#160709] p-2 text-red-300 hover:text-white"
        >
          <FiX aria-hidden="true" size={24} />
        </Link>
      )}

      {!file ? (
        <div className="min-h-[85vh] flex flex-col items-center justify-center">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[.35em] text-red-500">Post studio</p>
          <h1 className="mb-8 text-3xl font-black text-white">Create a post</h1>
          <label className="w-full max-w-lg cursor-pointer rounded-[32px] border border-dashed border-red-800 bg-[#150608]/90 p-10 text-center shadow-2xl transition hover:border-red-500 hover:bg-red-950/40">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
              multiple
              hidden
              onChange={handleFileChange}
            />
            <span className="text-lg font-semibold">
              Choose images or one video
            </span>
            <span className="block text-sm text-gray-400 mt-2">
              Select up to 10 images for a slider or custom grid layout
            </span>
          </label>
          {error && <p className="mt-4 text-red-300">{error}</p>}
        </div>
      ) : file.type.startsWith("image/") ? (
        <ImageEditor file={file} files={files} />
      ) : (
        <VideoEditor file={file} onSave={() => router.push("/")} />
      )}
    </motion.main>
  );
}
