"use client";

import { useEffect, useRef, useState } from "react";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";

const FILTERS = [
  { name: "Normal", value: "" },
  { name: "Vintage", value: "sepia(0.5) contrast(1.2)" },
  { name: "Black & White", value: "grayscale(1)" },
  { name: "Bright", value: "brightness(1.3)" },
  { name: "Cool", value: "hue-rotate(180deg)" },
  { name: "Warm", value: "sepia(0.3) saturate(1.4)" },
  { name: "Fade", value: "opacity(0.8)" },
  { name: "Sharp", value: "contrast(1.5)" },
  { name: "Soft", value: "blur(1px)" },
  { name: "Drama", value: "contrast(1.6) brightness(0.9)" },
  { name: "Film", value: "sepia(0.4)" },
  { name: "Night", value: "brightness(0.6)" },
  { name: "Pop", value: "saturate(1.8)" },
  { name: "Retro", value: "sepia(0.6) hue-rotate(-20deg)" },
  { name: "Cold", value: "hue-rotate(200deg) brightness(0.9)" },
];

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export default function VideoEditor({ onSave, file: initialFile }) {
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [filter, setFilter] = useState("");
  const [caption, setCaption] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [saturation, setSaturation] = useState(1);
  const [blur, setBlur] = useState(0);
  const [grayscale, setGrayscale] = useState(0);

  const videoRef = useRef(null);
  const previewUrlRef = useRef(null);

  const setSelectedVideo = (file) => {
    if (!ALLOWED_VIDEO_TYPES.has(file.type)) {
      setError("Choose an MP4, WebM, or MOV video.");
      return;
    }

    setError("");
    setVideoFile(file);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = URL.createObjectURL(file);
    previewUrlRef.current = nextUrl;
    setVideoPreview(nextUrl);
  };

  useEffect(() => {
    if (initialFile) setSelectedVideo(initialFile);

    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, [initialFile]);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    if (file) setSelectedVideo(file);
  };

  const combinedFilter = `
    ${filter}
    brightness(${brightness})
    contrast(${contrast})
    saturate(${saturation})
    blur(${blur}px)
    grayscale(${grayscale})
  `
    .replace(/\s+/g, " ")
    .trim();

  const resetEditor = () => {
    setVideoFile(null);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setVideoPreview(null);
    setCaption("");
    setFilter("");
    setBrightness(1);
    setContrast(1);
    setSaturation(1);
    setBlur(0);
    setGrayscale(0);
  };

  const handleSave = async () => {
    if (!videoFile) {
      setError("No video selected.");
      return;
    }

    if (!caption.trim()) {
      setError("Caption required.");
      return;
    }

    setLoading(true);
    setProgress(0);
    setError("");

    try {
      const uploaded = await uploadMediaDirect(videoFile, {
        onProgress: setProgress,
      });

      const saveRes = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          caption: caption.trim(),
          mediaItems: [{ key: uploaded.key, type: "video" }],
        }),
      });

      const saved = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saved.message || "Failed to save post");
      }

      resetEditor();
      if (onSave) await onSave(saved.post);
    } catch (error) {
      setError(error.message || "Upload failed.");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-black via-[#1a0000] to-black p-4 text-white">
      <div className="mx-auto max-w-6xl rounded-2xl border border-red-900 bg-[#0d0d0d]/90 p-5 shadow-2xl">
        {!initialFile && (
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            onChange={handleFile}
            className="mb-4 w-full rounded-lg border border-red-800 bg-black p-2 text-sm"
          />
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-950/60 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {videoPreview ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <video
                ref={videoRef}
                src={videoPreview}
                controls
                className="w-full rounded-xl border border-red-900 shadow-lg"
                style={{ filter: combinedFilter }}
              />

              <textarea
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Write your caption..."
                className="w-full rounded-lg border border-red-800 bg-black p-3 text-sm"
                maxLength={2200}
              />

              {loading && (
                <div className="w-full space-y-2">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-3 rounded-full bg-linear-to-r from-red-500 via-pink-500 to-red-600 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-gray-300">
                    <span>Uploading...</span>
                    <span>{progress}%</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="mb-2 font-semibold text-red-400">Filters</h3>

                <div className="grid max-h-40 grid-cols-3 gap-2 overflow-y-auto">
                  {FILTERS.map((option) => (
                    <button
                      type="button"
                      key={option.name}
                      onClick={() => setFilter(option.value)}
                      className="rounded-lg bg-red-900/40 p-2 text-xs hover:bg-red-700"
                    >
                      {option.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {[
                  ["Brightness", brightness, setBrightness, 0, 2],
                  ["Contrast", contrast, setContrast, 0, 2],
                  ["Saturation", saturation, setSaturation, 0, 2],
                  ["Blur", blur, setBlur, 0, 5],
                  ["Grayscale", grayscale, setGrayscale, 0, 1],
                ].map(([label, value, setter, min, max]) => (
                  <label key={label} className="block">
                    <span className="text-red-400">{label}</span>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step="0.1"
                      value={value}
                      onChange={(event) => setter(Number(event.target.value))}
                      className="w-full accent-red-600"
                    />
                  </label>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="w-full rounded-xl bg-red-700 py-3 font-semibold shadow-lg transition hover:bg-red-800 disabled:opacity-50"
              >
                {loading ? `Uploading ${progress}%...` : "Post Video"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-red-900 p-10 text-center text-sm text-zinc-400">
            Choose a video to start editing.
          </div>
        )}
      </div>
    </div>
  );
}
