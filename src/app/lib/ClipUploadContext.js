"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";

const ClipUploadContext = createContext(null);

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `clip-${Date.now()}`;
}

export function ClipUploadProvider({ children }) {
  const [task, setTask] = useState(null);
  const activeRef = useRef(false);

  const startClipUpload = useCallback((payload) => {
    if (activeRef.current) {
      throw new Error("A clip upload is already in progress.");
    }

    const files = Array.isArray(payload?.items)
      ? payload.items.map((item) => ({ ...item }))
      : [];

    if (!files.length || files.some((item) => !(item.file instanceof File))) {
      throw new Error("Add at least one valid photo or video.");
    }

    const taskId = makeId();
    activeRef.current = true;

    setTask({
      id: taskId,
      status: "uploading",
      progress: 0,
      step: "Preparing your clip",
      caption: String(payload.caption || "").slice(0, 500),
      fileCount: files.length,
      uploadedCount: 0,
      error: "",
      clip: null,
      createdAt: Date.now(),
    });

    void (async () => {
      try {
        const totalBytes = files.reduce(
          (sum, item) => sum + Math.max(1, Number(item.file.size) || 1),
          0,
        );
        const progressByItem = files.map(() => 0);
        const uploadedItems = new Array(files.length);
        let nextIndex = 0;
        let uploadError = null;

        const reportProgress = () => {
          const loadedBytes = files.reduce((sum, item, index) => {
            const size = Math.max(1, Number(item.file.size) || 1);
            return sum + size * (progressByItem[index] / 100);
          }, 0);
          const percent = Math.min(90, Math.round((loadedBytes / totalBytes) * 90));
          setTask((current) =>
            current?.id === taskId
              ? {
                  ...current,
                  progress: percent,
                  step: "Uploading media to Zenigram",
                  uploadedCount: progressByItem.filter((value) => value >= 100).length,
                }
              : current,
          );
        };

        const workerCount = Math.min(
          files.length,
          files.some((item) => item.type === "video" && item.file.size >= 10 * 1024 * 1024)
            ? 2
            : 4,
        );

        const workers = Array.from({ length: workerCount }, async () => {
          while (!uploadError) {
            const index = nextIndex++;
            if (index >= files.length) return;

            try {
              const uploaded = await uploadMediaDirect(files[index].file, {
                onProgress: (value) => {
                  progressByItem[index] = Math.max(
                    progressByItem[index],
                    Math.min(100, Math.max(0, Number(value) || 0)),
                  );
                  reportProgress();
                },
              });
              uploadedItems[index] = {
                key: uploaded.key,
                type: files[index].type,
              };
              progressByItem[index] = 100;
              reportProgress();
            } catch (error) {
              uploadError = error;
              return;
            }
          }
        });

        await Promise.all(workers);
        if (uploadError) throw uploadError;

        setTask((current) =>
          current?.id === taskId
            ? { ...current, progress: 92, step: "Publishing your clip" }
            : current,
        );

        const response = await fetch("/api/clips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            caption: payload.caption || "",
            topics: payload.topics || [],
            mediaItems: uploadedItems,
            timeline: files.map((item, index) => ({
              mediaIndex: index,
              duration: item.duration,
              trimStart: item.trimStart,
              filter: item.filter,
            })),
            textLayers: payload.textLayers || [],
            transition: payload.transition || "fade",
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.message || "Clip publishing failed.");
        }

        setTask((current) =>
          current?.id === taskId
            ? {
                ...current,
                status: "published",
                progress: 100,
                step: "Your clip is live",
                clip: data.clip || null,
                uploadedCount: files.length,
              }
            : current,
        );
      } catch (error) {
        setTask((current) =>
          current?.id === taskId
            ? {
                ...current,
                status: "failed",
                step: "Upload failed",
                error: error?.message || "Unable to upload your clip.",
              }
            : current,
        );
      } finally {
        activeRef.current = false;
      }
    })();

    return taskId;
  }, []);

  const dismissTask = useCallback(() => {
    if (activeRef.current) return;
    setTask(null);
  }, []);

  const value = useMemo(
    () => ({ task, startClipUpload, dismissTask, isUploading: task?.status === "uploading" || task?.status === "publishing" }),
    [task, startClipUpload, dismissTask],
  );

  return (
    <ClipUploadContext.Provider value={value}>
      {children}
    </ClipUploadContext.Provider>
  );
}

export function useClipUpload() {
  const context = useContext(ClipUploadContext);
  if (!context) {
    throw new Error("useClipUpload must be used inside ClipUploadProvider.");
  }
  return context;
}
