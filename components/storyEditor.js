"use client";

/* Local file previews use data URLs, so Next Image optimization is not applicable. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toBlob } from "html-to-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IoAdd,
  IoAt,
  IoArrowDown,
  IoArrowUp,
  IoBrush,
  IoClose,
  IoColorPaletteOutline,
  IoCopyOutline,
  IoGridOutline,
  IoImagesOutline,
  IoLocationOutline,
  IoText,
  IoTimeOutline,
  IoTrashOutline,
} from "react-icons/io5";
import UploadProgressModal from "./uploadprogressbar";
import LocationPickerDialog from "./LocationPickerDialog";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";

const STORY_WIDTH = 360;
const STORY_HEIGHT = 640;
const MAX_IMAGES = 6;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const FILTERS = [
  { name: "Original", value: "none" },
  { name: "Oslo", value: "brightness(1.08) saturate(.82) contrast(.94)" },
  { name: "Tokyo", value: "brightness(1.05) saturate(1.3) contrast(1.06)" },
  { name: "Rio", value: "saturate(1.55) contrast(1.12)" },
  { name: "Paris", value: "sepia(.18) brightness(1.06) contrast(.94)" },
  { name: "Mono", value: "grayscale(1) contrast(1.12)" },
  { name: "Noir", value: "grayscale(1) contrast(1.6) brightness(.82)" },
  { name: "Golden", value: "sepia(.4) saturate(1.25) brightness(1.05)" },
];

const BACKGROUNDS = [
  {
    name: "Black cherry",
    value: "linear-gradient(145deg,#050203,#160307,#30070d)",
  },
  { name: "Crimson", value: "linear-gradient(145deg,#21050a,#7f1d1d,#dc2626)" },
  {
    name: "Burgundy",
    value: "linear-gradient(145deg,#190308,#4c0519,#881337)",
  },
  { name: "Ember", value: "linear-gradient(145deg,#1c0505,#7f1d1d,#ea580c)" },
  { name: "Ruby", value: "linear-gradient(145deg,#260407,#9f1239,#fb7185)" },
  { name: "Wine", value: "linear-gradient(145deg,#120208,#4a044e,#881337)" },
];

const FONT_FAMILIES = [
  "Arial",
  "Arial Black",
  "Bookman",
  "Brush Script MT",
  "Comic Sans MS",
  "Copperplate",
  "Courier New",
  "Garamond",
  "Georgia",
  "Helvetica",
  "Impact",
  "Lucida Console",
  "Monaco",
  "Palatino",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
  "system-ui",
  "ui-rounded",
];

const LAYOUTS = {
  one: {
    name: "Full",
    count: 1,
    cells: [{ x: 0, y: 0, w: 100, h: 100 }],
  },
  split: {
    name: "Split",
    count: 2,
    cells: [
      { x: 0, y: 0, w: 100, h: 50 },
      { x: 0, y: 50, w: 100, h: 50 },
    ],
  },
  duo: {
    name: "Duo",
    count: 2,
    cells: [
      { x: 0, y: 0, w: 50, h: 100 },
      { x: 50, y: 0, w: 50, h: 100 },
    ],
  },
  hero: {
    name: "Hero",
    count: 3,
    cells: [
      { x: 0, y: 0, w: 100, h: 62 },
      { x: 0, y: 62, w: 50, h: 38 },
      { x: 50, y: 62, w: 50, h: 38 },
    ],
  },
  columns: {
    name: "Columns",
    count: 3,
    cells: [
      { x: 0, y: 0, w: 33.34, h: 100 },
      { x: 33.34, y: 0, w: 33.33, h: 100 },
      { x: 66.67, y: 0, w: 33.33, h: 100 },
    ],
  },
  quad: {
    name: "Grid",
    count: 4,
    cells: [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 50, y: 0, w: 50, h: 50 },
      { x: 0, y: 50, w: 50, h: 50 },
      { x: 50, y: 50, w: 50, h: 50 },
    ],
  },
  mosaic: {
    name: "Mosaic",
    count: 5,
    cells: [
      { x: 0, y: 0, w: 62, h: 62 },
      { x: 62, y: 0, w: 38, h: 31 },
      { x: 62, y: 31, w: 38, h: 31 },
      { x: 0, y: 62, w: 50, h: 38 },
      { x: 50, y: 62, w: 50, h: 38 },
    ],
  },
  six: {
    name: "Six",
    count: 6,
    cells: Array.from({ length: 6 }, (_, index) => ({
      x: (index % 2) * 50,
      y: Math.floor(index / 2) * (100 / 3),
      w: 50,
      h: 100 / 3,
    })),
  },
};

const TABS = [
  { id: "layout", label: "Layout", icon: IoGridOutline },
  { id: "adjust", label: "Adjust", icon: IoColorPaletteOutline },
  { id: "text", label: "Text", icon: IoText },
  { id: "draw", label: "Draw", icon: IoBrush },
];

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function createText() {
  return {
    id: createId(),
    value: "Tap to edit",
    x: 54,
    y: 90,
    size: 30,
    color: "#ffffff",
    backgroundColor: "#000000",
    showBackground: true,
    showBorder: false,
    borderColor: "#ffffff",
    borderWidth: 2,
    rotation: 0,
    fontFamily: "Arial",
    fontWeight: 700,
    italic: false,
    underline: false,
    strike: false,
  };
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function LayoutIcon({ layout }) {
  return (
    <span className="relative block h-11 w-7 overflow-hidden rounded-md border border-white/25 bg-black/60">
      {layout.cells.map((cell, index) => (
        <span
          key={index}
          className="absolute border border-black/60 bg-white/70"
          style={{
            left: `${cell.x}%`,
            top: `${cell.y}%`,
            width: `${cell.w}%`,
            height: `${cell.h}%`,
          }}
        />
      ))}
    </span>
  );
}

export default function StoryEditor() {
  const router = useRouter();
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const activeImageDragRef = useRef(null);
  const [images, setImages] = useState([]);
  const [layoutId, setLayoutId] = useState("one");
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [background, setBackground] = useState(BACKGROUNDS[1].value);
  const [gap, setGap] = useState(4);
  const [radius, setRadius] = useState(14);
  const [texts, setTexts] = useState([]);
  const [selectedTextId, setSelectedTextId] = useState(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [brushColor, setBrushColor] = useState("#ffffff");
  const [brushSize, setBrushSize] = useState(6);
  const [strokes, setStrokes] = useState([]);
  const [activeTab, setActiveTab] = useState("layout");
  const [duration, setDuration] = useState(20);
  const [missions, setMissions] = useState([]);
  const [missionId, setMissionId] = useState("");
  const [caption, setCaption] = useState("");
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const [progress, setProgress] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [postStage, setPostStage] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const layout = LAYOUTS[layoutId];
  const visibleCells = useMemo(
    () => layout.cells.map((cell, index) => ({ cell, image: images[index] || null })),
    [layout, images],
  );
  const selectedImage =
    images.find((item) => item.id === selectedImageId) || images[0] || null;
  const selectedText = texts.find((item) => item.id === selectedTextId) || null;

  useEffect(() => {
    fetch("/api/missions")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        setMissions(Array.isArray(data?.missions) ? data.missions : []),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    const query = mentionQuery.trim().replace(/^@/, "");
    if (query.length < 2) {
      setMentionResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          {
            signal: controller.signal,
          },
        );
        const data = response.ok ? await response.json() : null;
        const selected = new Set(mentionedUsers.map((user) => user._id));
        setMentionResults(
          (data?.users || []).filter((user) => !selected.has(user._id)),
        );
      } catch (error) {
        if (error.name !== "AbortError") setMentionResults([]);
      }
    }, 250);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [mentionQuery, mentionedUsers]);

  const addImages = async (event) => {
    const chosen = Array.from(event.target.files || []);
    event.target.value = "";
    if (!chosen.length) return;
    const remaining = MAX_IMAGES - images.length;
    const valid = chosen.slice(0, remaining).filter((file) => {
      if (!file.type.startsWith("image/")) return false;
      if (file.size > MAX_FILE_SIZE) return false;
      return true;
    });
    if (!valid.length) {
      window.alert("Choose JPG, PNG, WebP or GIF images smaller than 15 MB.");
      return;
    }
    const next = await Promise.all(
      valid.map(async (file) => ({
        id: createId(),
        name: file.name,
        src: await readFile(file),
        scale: 1,
        x: 50,
        y: 50,
        filter: "none",
      })),
    );
    setImages((current) => [...current, ...next]);
    setSelectedImageId(next[0].id);
    const total = images.length + next.length;
    const fitting = Object.entries(LAYOUTS).find(
      ([, item]) => item.count === Math.min(total, MAX_IMAGES),
    );
    if (fitting) setLayoutId(fitting[0]);
  };

  const updateImage = (changes) => {
    if (!selectedImage) return;
    setImages((current) =>
      current.map((item) =>
        item.id === selectedImage.id ? { ...item, ...changes } : item,
      ),
    );
  };

  const startImageDrag = useCallback(
    (event, image) => {
      if (!image || drawingMode || event.button !== 0) return;
      event.stopPropagation();
      if (selectedImageId !== image.id) {
        setSelectedImageId(image.id);
        return;
      }
      event.preventDefault();
      activeImageDragRef.current = {
        id: image.id,
        clientX: event.clientX,
        clientY: event.clientY,
        x: image.x,
        y: image.y,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [drawingMode, selectedImageId],
  );

  const moveImageDrag = useCallback((event) => {
    const drag = activeImageDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return;

    const deltaX =
      ((event.clientX - drag.clientX) / Math.max(rect.width, 1)) * 100;
    const deltaY =
      ((event.clientY - drag.clientY) / Math.max(rect.height, 1)) * 100;

    setImages((current) =>
      current.map((item) =>
        item.id === drag.id
          ? {
              ...item,
              x: Math.min(100, Math.max(0, drag.x + deltaX)),
              y: Math.min(100, Math.max(0, drag.y + deltaY)),
            }
          : item,
      ),
    );
  }, []);

  const stopImageDrag = useCallback((event) => {
    if (!activeImageDragRef.current) return;
    activeImageDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const removeImage = (id) => {
    const next = images.filter((item) => item.id !== id);
    setImages(next);
    setSelectedImageId(next[0]?.id || null);
    if (!next.length) setLayoutId("one");
  };

  const moveImage = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    setImages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addText = () => {
    const item = createText();
    setTexts((current) => [...current, item]);
    setSelectedTextId(item.id);
    setDrawingMode(false);
    setActiveTab("text");
  };

  const updateText = (changes) => {
    if (!selectedTextId) return;
    setTexts((current) =>
      current.map((item) =>
        item.id === selectedTextId ? { ...item, ...changes } : item,
      ),
    );
  };

  const mentionUser = (user) => {
    if (mentionedUsers.some((item) => item._id === user._id)) return;
    setMentionedUsers((current) => [...current, user].slice(0, 10));
    const mention = `@${user.username}`;
    if (selectedText) {
      updateText({ value: `${selectedText.value.trim()} ${mention}`.trim() });
    } else {
      setCaption((current) =>
        `${current.trim()} ${mention}`.trim().slice(0, 500),
      );
    }
    setMentionQuery("");
    setMentionResults([]);
  };

  const removeMention = (user) => {
    const mention = `@${user.username}`;
    setMentionedUsers((current) =>
      current.filter((item) => item._id !== user._id),
    );
    setCaption((current) =>
      current.replaceAll(mention, "").replace(/\s{2,}/g, " ").trim(),
    );
    setTexts((current) =>
      current.map((item) => ({
        ...item,
        value: item.value
          .replaceAll(mention, "")
          .replace(/\s{2,}/g, " ")
          .trim(),
      })),
    );
  };

  const pointForEvent = useCallback((event) => {
    const rect = editorRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * STORY_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STORY_HEIGHT,
    };
  }, []);

  const startDrawing = useCallback(
    (event) => {
      if (!drawingMode) return;
      event.preventDefault();
      const point = pointForEvent(event);
      if (!point) return;
      const id = createId();
      activeStrokeRef.current = id;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setStrokes((current) => [
        ...current,
        { id, color: brushColor, width: brushSize, points: [point] },
      ]);
    },
    [brushColor, brushSize, drawingMode, pointForEvent],
  );

  const continueDrawing = useCallback(
    (event) => {
      if (!drawingMode || !activeStrokeRef.current) return;
      event.preventDefault();
      const point = pointForEvent(event);
      setStrokes((current) =>
        current.map((stroke) =>
          stroke.id === activeStrokeRef.current
            ? { ...stroke, points: [...stroke.points, point] }
            : stroke,
        ),
      );
    },
    [drawingMode, pointForEvent],
  );

  const stopDrawing = useCallback((event) => {
    activeStrokeRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const shareStory = async (location = selectedLocation) => {
  if (!images.length || isPosting) {
    return;
  }

  // Location is mandatory.
  // Open the picker and STOP the posting flow.
  if (!location) {
    setShowLocationPicker(true);
    return;
  }

  try {
    setIsPosting(true);
    setPostStage("Creating your story…");

    setIsExporting(true);

    await new Promise((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(resolve)
      )
    );

    const blob = await toBlob(editorRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
    });

    setIsExporting(false);

    if (!blob) {
      throw new Error(
        "Could not prepare your story."
      );
    }

    setShowProgress(true);
    setPostStage("Uploading to your story…");

    const file = new File(
      [blob],
      `story-${Date.now()}.png`,
      {
        type: "image/png",
      }
    );

    const uploaded = await uploadMediaDirect(
      file,
      {
        onProgress: (value) =>
          setProgress(
            Math.min(
              90,
              Math.round(
                (value <= 1
                  ? value * 100
                  : value) * 0.9
              )
            )
          ),
      }
    );

    const response = await fetch(
      "/api/story-upload",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaKey: uploaded.key,
          mediaType: "image",
          duration,
          caption,
          mentionedUserIds:
            mentionedUsers.map(
              (user) => user._id
            ),
          missionId: missionId || null,
          timeZone:
            Intl.DateTimeFormat().resolvedOptions()
              .timeZone,

          // Guaranteed to be present here.
          location: {
            lat: Number(location.lat),
            lng: Number(location.lng),
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          "Unable to share this story."
      );
    }

    setSelectedLocation({
      lat: Number(location.lat),
      lng: Number(location.lng),
    });

    setProgress(100);
    setPostStage("Shared");

    router.push("/stories-globe");
  } catch (error) {
    console.error(
      "Story upload error:",
      error
    );

    setShowProgress(false);

    window.alert(
      error?.message ||
        "Story upload failed."
    );
  } finally {
    setIsExporting(false);
    setIsPosting(false);
  }
};

  return (
    <main className="min-h-screen w-full bg-[#070203] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(220,38,38,.22),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(127,29,29,.2),transparent_34%)]" />
      <div className="relative mx-auto max-w-[1500px] px-3 py-4 sm:px-6 lg:px-8">
        {showLocationPicker && <LocationPickerDialog onClose={() => setShowLocationPicker(false)} onSelect={(location) => { setSelectedLocation(location); setShowLocationPicker(false); void shareStory(location); }} />}
        <header className="mb-5 flex items-center justify-between">
          <Link
            href="/"
            aria-label="Close story creator"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-xl hover:bg-white/10"
          >
            <IoClose />
          </Link>
          <div className="text-center">
            <p className="text-[10px] font-bold uppercase tracking-[.32em] text-red-400">
              Story studio
            </p>
            <h1 className="text-xl font-black sm:text-2xl">
              Create your story
            </h1>
          </div>
          <button
            type="button"
            onClick={() => void shareStory()}
            disabled={!images.length || isPosting}
            className="rounded-full border border-red-400/30 bg-linear-to-r from-red-950 via-red-700 to-red-500 px-5 py-2.5 text-sm font-black shadow-lg shadow-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPosting ? postStage : "Share"}
          </button>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(360px,1fr)_350px]">
          <aside className="order-2 rounded-[28px] border border-red-900/50 bg-[#130608]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl xl:order-1">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Your media</h2>
                <p className="text-xs text-zinc-500">
                  {images.length} of {MAX_IMAGES} photos
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={images.length >= MAX_IMAGES}
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-black disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Add photos"
              >
                <IoAdd className="text-xl" />
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={addImages}
            />
            {!images.length ? (
              <div
                
                onClick={() => fileRef.current?.click()}
                className="grid min-h-56 w-full place-items-center rounded-3xl border border-dashed border-red-900/70 bg-black/25 p-6 text-center hover:border-red-500 hover:bg-red-950/20"
              >
                <span>
                  <IoImagesOutline className="mx-auto mb-3 text-4xl text-red-400" />
                  <strong className="block">Add your photos</strong>
                  <span className="mt-2 block text-xs leading-5 text-zinc-500">
                    Choose up to six and turn them into one story layout.
                  </span>
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {images.map((item, index) => (
                  <div
                    key={item.id}
                    className={`group flex w-full items-center gap-2 rounded-2xl border p-2 transition ${selectedImage?.id === item.id ? "border-red-400 bg-red-500/10" : "border-red-950/60 bg-black/25 hover:border-red-900"}`}
                  >
                    <div
                      
                      onClick={() => setSelectedImageId(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <img
                        src={item.src}
                        alt=""
                        className="h-14 w-11 rounded-xl object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          Photo {index + 1}
                        </span>
                        <span className="block truncate text-xs text-zinc-500">
                          {item.name}
                        </span>
                      </span>
                    </div>
                    <span className="flex gap-1 opacity-60 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => moveImage(index, -1)}
                        disabled={index === 0}
                        className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label={`Move photo ${index + 1} earlier`}
                      >
                        <IoArrowUp />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveImage(index, 1)}
                        disabled={index === images.length - 1}
                        className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label={`Move photo ${index + 1} later`}
                      >
                        <IoArrowDown />
                      </button>
                      <div
                        
                        onClick={() => removeImage(item.id)}
                        className="grid h-7 w-7 place-items-center rounded-full bg-red-500/20 text-red-300"
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        <IoTrashOutline />
                      </div>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          <section className="order-1 xl:order-2">
            <div className="relative mx-auto w-full max-w-[430px]">
              <div className="mb-3 flex items-center justify-between px-1 text-xs font-medium text-zinc-400">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />{" "}
                  Live preview
                </span>
                <span>9:16 · 1080 × 1920 export</span>
              </div>
              <div className=" bg-linear-to-br from-red-950 via-red-600 to-red-900 p-[3px] shadow-[0_24px_90px_rgba(127,29,29,.3)]">
                <div
                  ref={editorRef}
                  className="relative w-full overflow-hidden  bg-zinc-950"
                  style={{ aspectRatio: "9 / 16", background }}
                  onClick={() => {
                    setSelectedImageId(null);
                    setSelectedTextId(null);
                  }}
                >
                  {visibleCells.map(({ cell, image }, index) => (
                    <div
                      
                      key={`${layoutId}-${index}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (image) setSelectedImageId(image.id);
                        else fileRef.current?.click();
                      }}
                      onPointerDown={(event) => startImageDrag(event, image)}
                      onPointerMove={moveImageDrag}
                      onPointerUp={stopImageDrag}
                      onPointerCancel={stopImageDrag}
                      className={`absolute overflow-hidden ${image?.id === selectedImage?.id && !isExporting ? "touch-none cursor-grab ring-2 ring-inset ring-white active:cursor-grabbing" : "cursor-pointer"}`}
                      style={{
                        left: `calc(${cell.x}% + ${gap / 2}px)`,
                        top: `calc(${cell.y}% + ${gap / 2}px)`,
                        width: `calc(${cell.w}% - ${gap}px)`,
                        height: `calc(${cell.h}% - ${gap}px)`,
                        borderRadius: `${radius}px`,
                      }}
                    >
                      {image ? (
                        <img
                          src={image.src}
                          alt={`Story photo ${index + 1}`}
                          draggable={false}
                          className="h-full w-full select-none object-cover"
                          style={{
                            objectPosition: `${image.x}% ${image.y}%`,
                            transform: `scale(${image.scale})`,
                            filter: image.filter,
                          }}
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center border border-dashed border-white/25 bg-black/15 text-white/55">
                          <IoAdd className="text-2xl" />
                        </span>
                      )}
                    </div>
                  ))}

                  <svg
                    viewBox={`0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`}
                    preserveAspectRatio="none"
                    onPointerDown={startDrawing}
                    onPointerMove={continueDrawing}
                    onPointerUp={stopDrawing}
                    onPointerCancel={stopDrawing}
                    className={`absolute inset-0 z-20 h-full w-full ${drawingMode ? "cursor-crosshair touch-none" : "pointer-events-none"}`}
                  >
                    {strokes.map((stroke) =>
                      stroke.points.length === 1 ? (
                        <circle
                          key={stroke.id}
                          cx={stroke.points[0].x}
                          cy={stroke.points[0].y}
                          r={stroke.width / 2}
                          fill={stroke.color}
                        />
                      ) : (
                        <polyline
                          key={stroke.id}
                          points={stroke.points
                            .map((point) => `${point.x},${point.y}`)
                            .join(" ")}
                          fill="none"
                          stroke={stroke.color}
                          strokeWidth={stroke.width}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ),
                    )}
                  </svg>

                  {texts.map((item) => (
                    <motion.div
                     
                      key={item.id}
                      drag={!drawingMode}
                      dragMomentum={false}
                      animate={{ x: item.x, y: item.y, rotate: item.rotation }}
                      onDragEnd={(_, info) =>
                        setTexts((current) =>
                          current.map((text) =>
                            text.id === item.id
                              ? {
                                  ...text,
                                  x: text.x + info.offset.x,
                                  y: text.y + info.offset.y,
                                }
                              : text,
                          ),
                        )
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTextId(item.id);
                        setActiveTab("text");
                      }}
                      className={`absolute left-0 top-0 z-30 max-w-[85%] cursor-move whitespace-pre-wrap rounded-xl px-3 py-1.5 text-center font-bold leading-tight ${selectedTextId === item.id && !isExporting ? "ring-2 ring-white" : ""}`}
                      style={{
                        fontSize: item.size,
                        color: item.color,
                        background: item.showBackground
                          ? item.backgroundColor
                          : "transparent",
                        border: item.showBorder
                          ? `${item.borderWidth}px solid ${item.borderColor}`
                          : "none",
                        fontFamily: item.fontFamily,
                        fontWeight: item.fontWeight,
                        fontStyle: item.italic ? "italic" : "normal",
                        textDecoration:
                          [
                            item.underline && "underline",
                            item.strike && "line-through",
                          ]
                            .filter(Boolean)
                            .join(" ") || "none",
                      }}
                    >
                      {item.value}
                    </motion.div>
                  ))}

                  {!images.length && (
                    <div
                      
                      onClick={() => fileRef.current?.click()}
                      className="absolute inset-0 z-10 grid place-items-center p-10 text-center"
                    >
                      <span>
                        <span className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-white/15 backdrop-blur">
                          <IoImagesOutline className="text-4xl" />
                        </span>
                        <strong className="text-2xl">Start with a photo</strong>
                        <span className="mt-2 block text-sm text-white/65">
                          You can add up to six images.
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3 flex justify-center gap-2">
                <div
                  
                  onClick={addText}
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black"
                >
                  <IoText /> Add text
                </div>
                <div
                  
                  onClick={() => {
                    setDrawingMode((value) => !value);
                    setActiveTab("draw");
                  }}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold ${drawingMode ? "bg-red-600" : "bg-red-950/70"}`}
                >
                  <IoBrush /> {drawingMode ? "Done" : "Draw"}
                </div>
              </div>
            </div>
          </section>

          <aside className="order-3 rounded-[28px] border border-red-900/50 bg-[#130608]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-black/35 p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <div
                  
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setDrawingMode(id === "draw");
                  }}
                  className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition ${activeTab === id ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                >
                  <Icon className="mx-auto mb-1 text-lg" />
                  {label}
                </div>
              ))}
            </div>

            <div className="mt-5 min-h-72">
              {activeTab === "layout" && (
                <div>
                  <h2 className="font-bold">Choose a layout</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Empty cells can be filled later.
                  </p>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {Object.entries(LAYOUTS).map(([id, item]) => (
                      <div
                        
                        key={id}
                        onClick={() => setLayoutId(id)}
                        className={`grid place-items-center rounded-2xl border py-3 transition ${layoutId === id ? "border-red-400 bg-red-500/15" : "border-red-950/70 bg-black/20"}`}
                        title={item.name}
                      >
                        <LayoutIcon layout={item} />
                        <span className="mt-1 text-[10px]">{item.name}</span>
                      </div>
                    ))}
                  </div>
                  <Range
                    label="Spacing"
                    value={gap}
                    min={0}
                    max={18}
                    suffix="px"
                    onChange={setGap}
                  />
                  <Range
                    label="Rounded corners"
                    value={radius}
                    min={0}
                    max={34}
                    suffix="px"
                    onChange={setRadius}
                  />
                  <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                    Background
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {BACKGROUNDS.map((item) => (
                      <div
                        
                        key={item.name}
                        title={item.name}
                        aria-label={`${item.name} background`}
                        onClick={() => setBackground(item.value)}
                        className={`h-9 w-9 rounded-full border-2 ${background === item.value ? "border-white" : "border-transparent"}`}
                        style={{ background: item.value }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "adjust" && (
                <div>
                  <h2 className="font-bold">Adjust photo</h2>
                  <p className="mt-1 text-[11px] text-red-300/80">
                    Select a photo, then drag it directly in the preview to reposition it.
                  </p>
                  {!selectedImage ? (
                    <p className="mt-3 text-sm text-zinc-500">
                      Select a photo in the preview.
                    </p>
                  ) : (
                    <>
                      <Range
                        label="Zoom"
                        value={selectedImage.scale}
                        min={1}
                        max={2.6}
                        step={0.05}
                        suffix="×"
                        onChange={(value) => updateImage({ scale: value })}
                      />
                      <Range
                        label="Horizontal position"
                        value={selectedImage.x}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(value) => updateImage({ x: value })}
                      />
                      <Range
                        label="Vertical position"
                        value={selectedImage.y}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(value) => updateImage({ y: value })}
                      />
                      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Filters
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {FILTERS.map((item) => (
                          <div
                            key={item.name}
                            onClick={() => updateImage({ filter: item.value })}
                            className={`overflow-hidden rounded-xl border p-1 ${selectedImage.filter === item.value ? "border-red-400" : "border-red-950/70"}`}
                          >
                            <img
                              src={selectedImage.src}
                              alt=""
                              className="aspect-square w-full rounded-lg object-cover"
                              style={{ filter: item.value }}
                            />
                            <span className="mt-1 block text-[9px]">
                              {item.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activeTab === "text" && (
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold">Text styling</h2>
                    <button
                      type="button"
                      onClick={addText}
                      className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white"
                    >
                      Add text
                    </button>
                  </div>
                  {!selectedText ? (
                    <p className="mt-3 text-sm text-zinc-500">
                      Add text or select a text layer.
                    </p>
                  ) : (
                    <>
                      <textarea
                        value={selectedText.value}
                        onChange={(event) =>
                          updateText({ value: event.target.value })
                        }
                        rows={3}
                        maxLength={160}
                        className="mt-4 w-full resize-none rounded-2xl border border-red-950 bg-black/40 p-3 outline-none focus:border-red-500"
                      />
                      <label className="mt-4 block text-xs text-zinc-400">
                        <span className="mb-2 block">Font family</span>
                        <select
                          value={selectedText.fontFamily}
                          onChange={(event) =>
                            updateText({ fontFamily: event.target.value })
                          }
                          className="w-full rounded-xl border border-red-950 bg-black/50 p-3 text-sm"
                        >
                          {FONT_FAMILIES.map((font) => (
                            <option
                              key={font}
                              value={font}
                              style={{ fontFamily: font }}
                            >
                              {font}
                            </option>
                          ))}
                        </select>
                      </label>
                      <Range
                        label="Text size"
                        value={selectedText.size}
                        min={14}
                        max={68}
                        suffix="px"
                        onChange={(value) => updateText({ size: value })}
                      />
                      <Range
                        label="Rotation"
                        value={selectedText.rotation}
                        min={-180}
                        max={180}
                        suffix="°"
                        onChange={(value) => updateText({ rotation: value })}
                      />
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <div
                          onClick={() =>
                            updateText({
                              rotation: Math.max(
                                -180,
                                selectedText.rotation - 15,
                              ),
                            })
                          }
                          className="rounded-xl border border-red-950 bg-black/30 py-2 text-xs text-zinc-300 hover:border-red-800"
                        >
                          Rotate −15°
                        </div>
                        <div
                          onClick={() => updateText({ rotation: 0 })}
                          className="rounded-xl border border-red-950 bg-black/30 py-2 text-xs text-zinc-300 hover:border-red-800"
                        >
                          Reset
                        </div>
                        <div
                          onClick={() =>
                            updateText({
                              rotation: Math.min(
                                180,
                                selectedText.rotation + 15,
                              ),
                            })
                          }
                          className="rounded-xl border border-red-950 bg-black/30 py-2 text-xs text-zinc-300 hover:border-red-800"
                        >
                          Rotate +15°
                        </div>
                      </div>
                      <div
                        className="mt-4 grid grid-cols-4 gap-2"
                        aria-label="Text decoration"
                      >
                        <StyleButton
                          label="Bold"
                          active={selectedText.fontWeight === 700}
                          onClick={() =>
                            updateText({
                              fontWeight:
                                selectedText.fontWeight === 700 ? 400 : 700,
                            })
                          }
                        >
                          <strong>B</strong>
                        </StyleButton>
                        <StyleButton
                          label="Italic"
                          active={selectedText.italic}
                          onClick={() =>
                            updateText({ italic: !selectedText.italic })
                          }
                        >
                          <em>I</em>
                        </StyleButton>
                        <StyleButton
                          label="Underline"
                          active={selectedText.underline}
                          onClick={() =>
                            updateText({ underline: !selectedText.underline })
                          }
                        >
                          <span className="underline">U</span>
                        </StyleButton>
                        <StyleButton
                          label="Line through"
                          active={selectedText.strike}
                          onClick={() =>
                            updateText({ strike: !selectedText.strike })
                          }
                        >
                          <span className="line-through">S</span>
                        </StyleButton>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <ColorInput
                          label="Text color"
                          value={selectedText.color}
                          onChange={(value) => updateText({ color: value })}
                        />
                        <ColorInput
                          label="Background color"
                          value={selectedText.backgroundColor}
                          onChange={(value) =>
                            updateText({
                              backgroundColor: value,
                              showBackground: true,
                            })
                          }
                        />
                        <ColorInput
                          label="Border color"
                          value={selectedText.borderColor}
                          onChange={(value) =>
                            updateText({ borderColor: value, showBorder: true })
                          }
                        />
                        <Range
                          compact
                          label="Border width"
                          value={selectedText.borderWidth}
                          min={1}
                          max={12}
                          suffix="px"
                          onChange={(value) =>
                            updateText({ borderWidth: value, showBorder: true })
                          }
                        />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <StyleButton
                          label="Text background"
                          active={selectedText.showBackground}
                          onClick={() =>
                            updateText({
                              showBackground: !selectedText.showBackground,
                            })
                          }
                        >
                          {selectedText.showBackground
                            ? "Remove background"
                            : "Add background"}
                        </StyleButton>
                        <StyleButton
                          label="Text border"
                          active={selectedText.showBorder}
                          onClick={() =>
                            updateText({ showBorder: !selectedText.showBorder })
                          }
                        >
                          {selectedText.showBorder ? "Remove border" : "Add border"}
                        </StyleButton>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const copy = {
                              ...selectedText,
                              id: createId(),
                              x: selectedText.x + 12,
                              y: selectedText.y + 12,
                            };
                            setTexts((current) => [...current, copy]);
                            setSelectedTextId(copy.id);
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm"
                        >
                          <IoCopyOutline /> Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setTexts((current) =>
                              current.filter(
                                (item) => item.id !== selectedText.id,
                              ),
                            );
                            setSelectedTextId(null);
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 py-2 text-sm text-red-300"
                        >
                          <IoTrashOutline /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}


              {activeTab === "draw" && (
                <div>
                  <h2 className="font-bold">Draw on your story</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    Use your mouse, pen or finger on the preview.
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <ColorInput
                      label="Brush color"
                      value={brushColor}
                      onChange={setBrushColor}
                    />
                    <Range
                      compact
                      label="Brush"
                      value={brushSize}
                      min={1}
                      max={30}
                      suffix="px"
                      onChange={setBrushSize}
                    />
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!strokes.length}
                      onClick={() =>
                        setStrokes((current) => current.slice(0, -1))
                      }
                      className="rounded-xl bg-white/10 py-2 text-sm disabled:opacity-30"
                    >
                      Undo
                    </button>
                    <button
                      type="button"
                      disabled={!strokes.length}
                      onClick={() => setStrokes([])}
                      className="rounded-xl bg-red-500/15 py-2 text-sm text-red-300 disabled:opacity-30"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
              <label className="block">
                <span className="mb-2 flex items-center justify-between text-sm font-bold">
                  <span>
                    Caption{" "}
                    <span className="font-normal text-zinc-500">
                      (optional)
                    </span>
                  </span>
                  <span className="text-xs font-normal text-zinc-500">
                    {caption.length}/500
                  </span>
                </span>
                <textarea
                  value={caption}
                  onChange={(event) =>
                    setCaption(event.target.value.slice(0, 500))
                  }
                  rows={3}
                  placeholder="Write something about this story…"
                  className="w-full resize-none rounded-2xl border border-red-950 bg-black/40 p-3 text-sm outline-none placeholder:text-zinc-600 focus:border-red-500"
                />
              </label>
              <div className="relative">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <IoAt className="text-red-400" /> Mention people
                  </span>
                  <input
                    value={mentionQuery}
                    onChange={(event) => setMentionQuery(event.target.value)}
                    placeholder="Search username"
                    className="w-full rounded-xl border border-red-950 bg-black/50 p-3 text-sm outline-none focus:border-red-500"
                  />
                </label>
                {mentionResults.length > 0 && (
                  <div className="absolute z-50 mt-2 max-h-48 w-full overflow-y-auto rounded-2xl border border-red-900/70 bg-[#170608] p-1 shadow-2xl">
                    {mentionResults.map((user) => (
                      <button
                        type="button"
                        key={user._id}
                        onClick={() => mentionUser(user)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-red-950"
                      >
                        <span className="grid h-8 w-8 place-items-center rounded-full bg-red-900 font-bold">
                          {user.username?.[0]?.toUpperCase()}
                        </span>
                        <span>@{user.username}</span>
                      </button>
                    ))}
                  </div>
                )}
                {mentionedUsers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mentionedUsers.map((user) => (
                      <button
                        type="button"
                        key={user._id}
                        onClick={() => removeMention(user)}
                        className="rounded-full border border-red-800 bg-red-950/70 px-2.5 py-1 text-xs text-red-200"
                      >
                        @{user.username} ×
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] leading-4 text-zinc-600">
                  Mentions are inserted into the selected text layer, or into
                  the caption when no text is selected.
                </p>
              </div>
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <IoTimeOutline className="text-red-400" /> Story duration{" "}
                  <span className="ml-auto text-red-300">{duration}s</span>
                </span>
                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={duration}
                  onChange={(event) => setDuration(Number(event.target.value))}
                  className="w-full accent-red-500"
                />
                <span className="mt-1 flex justify-between text-[10px] text-zinc-600">
                  <span>5 sec</span>
                  <span>60 sec</span>
                </span>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  Local mission
                </span>
                <select
                  value={missionId}
                  onChange={(event) => setMissionId(event.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-sm"
                >
                  <option value="">No mission</option>
                  {missions.map((mission) => (
                    <option key={mission._id} value={mission._id}>
                      {mission.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-3 rounded-2xl border border-red-900/60 bg-red-950/30 p-3">
                <IoLocationOutline className="mt-0.5 shrink-0 text-red-300" />
                <p className="text-xs leading-5 text-zinc-400">
                  Location is requested only when you share. It helps place this
                  story on the globe.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
      <UploadProgressModal visible={showProgress} progress={progress} />
    </main>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  compact = false,
}) {
  return (
    <label className={compact ? "block" : "mt-5 block"}>
      <span className="mb-2 flex justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span>
          {Number(value).toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-red-500"
      />
    </label>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="block text-xs text-zinc-400">
      <span className="mb-2 block">{label}</span>
      <span className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-9 cursor-pointer border-0 bg-transparent"
        />
        <span className="truncate text-[10px] uppercase">{value}</span>
      </span>
    </label>
  );
}

function StyleButton({ label, active, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-10 place-items-center rounded-xl border text-sm transition ${active ? "border-red-400 bg-red-600 text-white" : "border-red-950 bg-black/30 text-zinc-400 hover:border-red-800 hover:text-white"}`}
    >
      {children}
    </button>
  );
}
