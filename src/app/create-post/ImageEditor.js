"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IoAdd,
  IoAlbumsOutline,
  IoArrowBack,
  IoArrowDown,
  IoArrowForward,
  IoArrowUp,
  IoCheckmark,
  IoColorFilterOutline,
  IoGridOutline,
  IoImagesOutline,
  IoOptionsOutline,
  IoSparklesOutline,
  IoTrashOutline,
} from "react-icons/io5";
import { uploadMediaDirect } from "@/app/lib/directS3Upload";
import Image from "next/image";

const MAX_IMAGES = 10;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;
const RATIOS = {
  square: { label: "Square", value: 1, export: [1080, 1080] },
  portrait: { label: "Portrait", value: 4 / 5, export: [1080, 1350] },
  landscape: { label: "Landscape", value: 16 / 9, export: [1080, 608] },
};

const SLIDER_STYLES = [
  { id: "classic", name: "Classic", note: "Clean horizontal movement" },
  { id: "fade", name: "Fade", note: "Soft cross-fade" },
  { id: "stack", name: "Stack", note: "Layered card movement" },
  { id: "filmstrip", name: "Filmstrip", note: "Cinematic thumbnail rail" },
  { id: "zoom", name: "Zoom", note: "Smooth focus push" },
  { id: "flip", name: "Flip", note: "3D page turn" },
  { id: "cube", name: "Cube", note: "Dimensional rotation" },
];

const GRID_LAYOUTS = [
  { id: "tiles", name: "Tiles", note: "Balanced grid" },
  { id: "hero", name: "Hero", note: "Feature the first image" },
  { id: "columns", name: "Columns", note: "Editorial vertical strips" },
  { id: "strips", name: "Strips", note: "Horizontal photo story" },
];

const PRESETS = [
  { name: "Original", values: {} },
  { name: "Crisp", values: { contrast: 112, saturation: 108, sharpness: 32 } },
  { name: "Warm", values: { warmth: 34, saturation: 108, brightness: 104 } },
  { name: "Noir", values: { saturation: 0, contrast: 128, sharpness: 24 } },
  { name: "Dusty", values: { contrast: 94, warmth: 22, dust: 48 } },
  { name: "Vivid", values: { saturation: 142, contrast: 110, sharpness: 18 } },
  {
    name: "Matte",
    values: {
      brightness: 103,
      contrast: 88,
      saturation: 90,
      warmth: 10,
      dust: 12,
    },
  },
  {
    name: "Cool",
    values: {
      brightness: 102,
      contrast: 105,
      saturation: 94,
      warmth: -38,
      sharpness: 14,
    },
  },
  {
    name: "Retro",
    values: {
      brightness: 98,
      contrast: 104,
      saturation: 82,
      warmth: 46,
      dust: 34,
    },
  },
  {
    name: "Soft",
    values: {
      brightness: 106,
      contrast: 90,
      saturation: 92,
      blur: 1,
      sharpness: 0,
    },
  },
];

const DEFAULT_ADJUSTMENTS = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  warmth: 0,
  blur: 0,
  sharpness: 0,
  dust: 0,
  positionX: 50,
  positionY: 50,
};

function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function filesToItems(files) {
  return Promise.all(
    files.map(async (file) => ({
      id: createId(),
      file,
      name: file.name,
      src: await readFile(file),
      adjustments: { ...DEFAULT_ADJUSTMENTS },
    })),
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("An image could not be prepared."));
    image.src = src;
  });
}

function drawCover(
  context,
  image,
  x,
  y,
  width,
  height,
  focalX = 50,
  focalY = 50,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const normalizedX = Math.min(100, Math.max(0, focalX)) / 100;
  const normalizedY = Math.min(100, Math.max(0, focalY)) / 100;
  const sourceX = Math.max(0, image.width - sourceWidth) * normalizedX;
  const sourceY = Math.max(0, image.height - sourceHeight) * normalizedY;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
}

function applySharpness(context, width, height, amount) {
  const strength = Math.min(Math.max(amount / 100, 0), 1) * 0.85;
  if (!strength) return;
  const source = context.getImageData(0, 0, width, height);
  const output = context.createImageData(width, height);
  output.data.set(source.data);
  const data = source.data;
  const target = output.data;
  const center = 1 + 4 * strength;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        target[offset + channel] = Math.max(
          0,
          Math.min(
            255,
            data[offset + channel] * center -
              strength *
                (data[offset - 4 + channel] +
                  data[offset + 4 + channel] +
                  data[offset - width * 4 + channel] +
                  data[offset + width * 4 + channel]),
          ),
        );
      }
    }
  }
  context.putImageData(output, 0, 0);
}

function addDust(context, width, height, amount, seedText) {
  if (!amount) return;
  let seed = [...seedText].reduce(
    (total, character) => total + character.charCodeAt(0),
    17,
  );
  const random = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const count = Math.round((amount / 100) * 900);
  context.save();
  for (let index = 0; index < count; index += 1) {
    const light = random() > 0.45;
    context.fillStyle = light
      ? `rgba(255,244,230,${0.08 + random() * 0.24})`
      : `rgba(28,10,8,${0.06 + random() * 0.2})`;
    const radius = 0.4 + random() * (amount > 60 ? 2.4 : 1.3);
    context.beginPath();
    context.arc(random() * width, random() * height, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function canvasBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Image export failed.")),
      type,
      quality,
    ),
  );
}

async function renderAdjustedBlob(item, ratioId) {
  const [width, height] = RATIOS[ratioId].export;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = await loadImage(item.src);
  const values = item.adjustments;
  context.filter = [
    `brightness(${values.brightness}%)`,
    `contrast(${values.contrast}%)`,
    `saturate(${values.saturation}%)`,
    `sepia(${Math.max(0, values.warmth)}%)`,
    `hue-rotate(${values.warmth < 0 ? values.warmth * 0.35 : 0}deg)`,
    `blur(${values.blur}px)`,
  ].join(" ");
  drawCover(
    context,
    image,
    0,
    0,
    width,
    height,
    values.positionX,
    values.positionY,
  );
  context.filter = "none";
  applySharpness(context, width, height, values.sharpness);
  addDust(context, width, height, values.dust, item.id);
  return canvasBlob(canvas);
}

function tilesCells(count) {
  const columns = count <= 2 ? count : count <= 4 ? 2 : count <= 9 ? 3 : 5;
  const rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => ({
    x: (index % columns) / columns,
    y: Math.floor(index / columns) / rows,
    w: 1 / columns,
    h: 1 / rows,
  }));
}

function gridCells(layout, count) {
  if (layout === "columns") {
    return Array.from({ length: count }, (_, index) => ({
      x: index / count,
      y: 0,
      w: 1 / count,
      h: 1,
    }));
  }
  if (layout === "strips") {
    return Array.from({ length: count }, (_, index) => ({
      x: 0,
      y: index / count,
      w: 1,
      h: 1 / count,
    }));
  }
  if (layout === "hero" && count > 1) {
    const remaining = count - 1;
    return [
      { x: 0, y: 0, w: 0.62, h: 1 },
      ...Array.from({ length: remaining }, (_, index) => ({
        x: 0.62,
        y: index / remaining,
        w: 0.38,
        h: 1 / remaining,
      })),
    ];
  }
  return tilesCells(count);
}

async function renderGridBlob(items, ratioId, layout, gap, radius) {
  const [width, height] = RATIOS[ratioId].export;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const cells = gridCells(layout, items.length);
  context.fillStyle = "#170608";
  context.fillRect(0, 0, width, height);
  const rendered = await Promise.all(
    items.map((item) => renderAdjustedBlob(item, ratioId)),
  );
  for (let index = 0; index < rendered.length; index += 1) {
    const objectUrl = URL.createObjectURL(rendered[index]);
    try {
      const image = await loadImage(objectUrl);
      const cell = cells[index];
      const padding = gap * 2;
      const x = cell.x * width + padding;
      const y = cell.y * height + padding;
      const cellWidth = cell.w * width - padding * 2;
      const cellHeight = cell.h * height - padding * 2;
      const corner = Math.min(radius * 3, cellWidth / 3, cellHeight / 3);
      context.save();
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, corner);
      context.clip();
      drawCover(context, image, x, y, cellWidth, cellHeight);
      context.restore();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  return canvasBlob(canvas);
}

function previewFilter(values) {
  return [
    `brightness(${values.brightness}%)`,
    `contrast(${values.contrast + values.sharpness * 0.12}%)`,
    `saturate(${values.saturation}%)`,
    `sepia(${Math.max(0, values.warmth)}%)`,
    `hue-rotate(${values.warmth < 0 ? values.warmth * 0.35 : 0}deg)`,
    `blur(${values.blur}px)`,
  ].join(" ");
}

function sliderMotion(style, direction) {
  if (style === "fade")
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    };
  if (style === "stack")
    return {
      initial: { opacity: 0, scale: 0.9, rotate: direction * 4 },
      animate: { opacity: 1, scale: 1, rotate: 0 },
      exit: { opacity: 0, scale: 1.04, rotate: direction * -3 },
    };
  if (style === "filmstrip")
    return {
      initial: { opacity: 0, x: direction * 80 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: direction * -80 },
    };
  if (style === "zoom")
    return {
      initial: { opacity: 0, scale: direction > 0 ? 1.18 : 0.88 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: direction > 0 ? 0.88 : 1.18 },
    };
  if (style === "flip")
    return {
      initial: { opacity: 0, rotateY: direction * 80, scale: 0.95 },
      animate: { opacity: 1, rotateY: 0, scale: 1 },
      exit: { opacity: 0, rotateY: direction * -80, scale: 0.95 },
    };
  if (style === "cube")
    return {
      initial: {
        opacity: 0,
        rotateY: direction * 90,
        x: direction * 40,
        transformOrigin: direction > 0 ? "right center" : "left center",
      },
      animate: { opacity: 1, rotateY: 0, x: 0 },
      exit: {
        opacity: 0,
        rotateY: direction * -90,
        x: direction * -40,
        transformOrigin: direction > 0 ? "left center" : "right center",
      },
    };
  return {
    initial: { opacity: 0, x: direction * 34 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: direction * -34 },
  };
}

export default function ImageEditor({
  file: initialFile,
  files: initialFiles = [],
}) {
  const router = useRouter();
  const fileRef = useRef(null);
  const previewDragRef = useRef(null);
  const [items, setItems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [mode, setMode] = useState(
    initialFiles.length > 1 ? "carousel" : "single",
  );
  const [ratioId, setRatioId] = useState("portrait");
  const [gridLayout, setGridLayout] = useState("tiles");
  const [sliderStyle, setSliderStyle] = useState("classic");
  const [gap, setGap] = useState(3);
  const [radius, setRadius] = useState(10);
  const [caption, setCaption] = useState("");
  const [activeTab, setActiveTab] = useState("format");
  const [previewIndex, setPreviewIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState("");
  const activeItem =
    items.find((item) => item.id === activeId) || items[0] || null;
  const isGrid = mode === "grid";
  const isCarousel = mode === "carousel";
  const cells = useMemo(
    () => gridCells(gridLayout, items.length),
    [gridLayout, items.length],
  );

  const loadInitial = useCallback(async () => {
    const sources = (initialFiles.length ? initialFiles : [initialFile])
      .filter(Boolean)
      .slice(0, MAX_IMAGES);
    const next = await filesToItems(sources);
    setItems(next);
    setActiveId(next[0]?.id || null);
    setMode(next.length > 1 ? "carousel" : "single");
  }, [initialFile, initialFiles]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const addImages = async (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    const remaining = MAX_IMAGES - items.length;
    const valid = selected
      .slice(0, remaining)
      .filter(
        (item) => item.type.startsWith("image/") && item.size <= MAX_IMAGE_SIZE,
      );
    if (!valid.length) return;
    const next = await filesToItems(valid);
    setItems((current) => [...current, ...next]);
    setActiveId(next[0].id);
    if (items.length + next.length > 1 && mode === "single")
      setMode("carousel");
  };

  const updateActive = (changes) => {
    if (!activeItem) return;
    setItems((current) =>
      current.map((item) =>
        item.id === activeItem.id
          ? { ...item, adjustments: { ...item.adjustments, ...changes } }
          : item,
      ),
    );
  };

  const applyPreset = (values) => {
    updateActive({
      ...DEFAULT_ADJUSTMENTS,
      positionX: activeItem?.adjustments.positionX ?? 50,
      positionY: activeItem?.adjustments.positionY ?? 50,
      ...values,
    });
  };

  const applyToAll = () => {
    if (!activeItem) return;
    setItems((current) =>
      current.map((item) => ({
        ...item,
        adjustments: {
          ...activeItem.adjustments,
          positionX: item.adjustments.positionX,
          positionY: item.adjustments.positionY,
        },
      })),
    );
  };

  const startPreviewDrag = useCallback(
    (event, item) => {
      if (!item || event.button !== 0) return;
      event.stopPropagation();
      if (activeId !== item.id) {
        setActiveId(item.id);
        return;
      }
      event.preventDefault();
      previewDragRef.current = {
        id: item.id,
        clientX: event.clientX,
        clientY: event.clientY,
        positionX: item.adjustments.positionX ?? 50,
        positionY: item.adjustments.positionY ?? 50,
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [activeId],
  );

  const movePreviewDrag = useCallback((event) => {
    const drag = previewDragRef.current;
    if (!drag) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const deltaX =
      ((event.clientX - drag.clientX) / Math.max(rect.width, 1)) * 100;
    const deltaY =
      ((event.clientY - drag.clientY) / Math.max(rect.height, 1)) * 100;
    setItems((current) =>
      current.map((item) =>
        item.id === drag.id
          ? {
              ...item,
              adjustments: {
                ...item.adjustments,
                positionX: Math.min(100, Math.max(0, drag.positionX - deltaX)),
                positionY: Math.min(100, Math.max(0, drag.positionY - deltaY)),
              },
            }
          : item,
      ),
    );
  }, []);

  const stopPreviewDrag = useCallback((event) => {
    if (!previewDragRef.current) return;
    previewDragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const removeItem = (id) => {
    const next = items.filter((item) => item.id !== id);
    setItems(next);
    setActiveId(next[0]?.id || null);
    setPreviewIndex((current) =>
      Math.min(current, Math.max(next.length - 1, 0)),
    );
    if (next.length < 2) setMode("single");
  };

  const moveItem = (index, offset) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    setItems((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const movePreview = (offset) => {
    setDirection(offset > 0 ? 1 : -1);
    const next = (previewIndex + offset + items.length) % items.length;
    setPreviewIndex(next);
    setActiveId(items[next]?.id || null);
  };

  const createPost = async () => {
    if (!items.length || uploading) return;
    if (!caption.trim()) {
      window.alert("Write a caption before sharing your post.");
      return;
    }
    try {
      setUploading(true);
      setUploadProgress(0);
      setStatus("Rendering edits…");
      let exports;
      if (isGrid) {
        exports = [
          await renderGridBlob(items, ratioId, gridLayout, gap, radius),
        ];
      } else {
        exports = [];
        for (let index = 0; index < items.length; index += 1) {
          setStatus(`Rendering image ${index + 1} of ${items.length}…`);
          exports.push(await renderAdjustedBlob(items[index], ratioId));
          setUploadProgress(Math.round(((index + 1) / items.length) * 35));
        }
      }

      const mediaItems = [];
      for (let index = 0; index < exports.length; index += 1) {
        setStatus(`Uploading image ${index + 1} of ${exports.length}…`);
        const output = new File(
          [exports[index]],
          `post-${Date.now()}-${index + 1}.jpg`,
          { type: "image/jpeg" },
        );
        const uploaded = await uploadMediaDirect(output, {
          onProgress: (value) => {
            const percent = value <= 1 ? value * 100 : value;
            setUploadProgress(
              Math.round(35 + ((index + percent / 100) / exports.length) * 60),
            );
          },
        });
        mediaItems.push({ key: uploaded.key, type: "image" });
      }

      setStatus("Publishing post…");
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: caption.trim(),
          mediaItems,
          presentation: isGrid
            ? "grid"
            : items.length > 1
              ? "carousel"
              : "single",
          carouselStyle: isCarousel ? sliderStyle : "classic",
          gridLayout: isGrid ? gridLayout : "",
          aspectRatio: ratioId,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not publish your post.");
      setUploadProgress(100);
      setStatus("Published");
      router.push("/");
    } catch (error) {
      window.alert(error.message || "Post upload failed.");
    } finally {
      setUploading(false);
    }
  };

  if (!items.length) {
    return (
      <div className="grid min-h-[70vh] place-items-center text-sm text-zinc-500">
        Preparing your images…
      </div>
    );
  }

  const previewItem = items[Math.min(previewIndex, items.length - 1)];
  const motionStyle = sliderMotion(sliderStyle, direction);

  return (
    <div className="mx-auto max-w-[1550px]">
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={addImages}
      />
      <header className="mb-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Back"
          className="grid h-11 w-11 place-items-center rounded-full border border-red-900/50 bg-[#160709] text-red-200"
        >
          <IoArrowBack />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[.32em] text-red-500">
            Post studio
          </p>
          <h1 className="text-xl font-black sm:text-2xl">Create a post</h1>
        </div>
        <button
          type="button"
          onClick={createPost}
          disabled={uploading || !items.length}
          className="rounded-full bg-linear-to-r from-red-950 via-red-700 to-red-500 px-5 py-2.5 text-sm font-black shadow-lg shadow-red-950/50 disabled:opacity-40"
        >
          {uploading ? `${uploadProgress}%` : "Share"}
        </button>
      </header>

      <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(380px,1fr)_360px]">
        <aside className="order-2 rounded-[28px] border border-red-900/45 bg-[#130608]/95 p-4 shadow-2xl backdrop-blur-xl xl:order-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Your images</h2>
              <p className="text-xs text-zinc-500">
                {items.length} of {MAX_IMAGES}
              </p>
            </div>
            <button
              type="button"
              disabled={items.length >= MAX_IMAGES}
              onClick={() => fileRef.current?.click()}
              className="grid h-10 w-10 place-items-center rounded-full bg-white text-black disabled:opacity-30"
              aria-label="Add images"
            >
              <IoAdd className="text-xl" />
            </button>
          </div>
          <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1 [scrollbar-color:#7f1d1d_transparent]">
            {items.map((item, index) => (
              <div
                key={item.id}
                className={`flex items-center gap-2 rounded-2xl border p-2 ${activeItem?.id === item.id ? "border-red-500 bg-red-500/10" : "border-red-950/70 bg-black/25"}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(item.id);
                    setPreviewIndex(index);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <Image
                    src={item.src}
                    width={44}
                    height={44}
                    alt=""
                    className="h-14 w-11 rounded-xl object-cover"
                  />
                  <span className="min-w-0">
                    <strong className="block text-sm">Image {index + 1}</strong>
                    <span className="block truncate text-xs text-zinc-600">
                      {item.name}
                    </span>
                  </span>
                </button>
                <span className="grid grid-cols-2 gap-1">
                  <MiniButton
                    label={`Move image ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    <IoArrowUp />
                  </MiniButton>
                  <MiniButton
                    label={`Move image ${index + 1} later`}
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    <IoArrowDown />
                  </MiniButton>
                  <MiniButton
                    label={`Remove image ${index + 1}`}
                    onClick={() => removeItem(item.id)}
                    danger
                  >
                    <IoTrashOutline />
                  </MiniButton>
                </span>
              </div>
            ))}
          </div>
        </aside>

        <section className="order-1 xl:order-2">
          <div className="mx-auto max-w-[620px]">
            <div className="mb-3 flex items-center justify-between text-xs text-zinc-500">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{" "}
                Animated preview
              </span>
              <span>
                {RATIOS[ratioId].label} · {items.length} image
                {items.length === 1 ? "" : "s"}
              </span>
            </div>
            <motion.div
              layout
              className="relative overflow-hidden border border-red-900/50 bg-[#090304] shadow-[0_30px_100px_rgba(76,5,25,.25)] perspective-distant"
              style={{ aspectRatio: RATIOS[ratioId].value }}
            >
              {isGrid ? (
                <div className="absolute inset-0 bg-[#170608]">
                  {items.map((item, index) => {
                    const cell = cells[index];
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => setActiveId(item.id)}
                        onPointerDown={(event) => startPreviewDrag(event, item)}
                        onPointerMove={movePreviewDrag}
                        onPointerUp={stopPreviewDrag}
                        onPointerCancel={stopPreviewDrag}
                        className={`absolute overflow-hidden transition ${activeItem?.id === item.id ? "touch-none cursor-grab ring-2 ring-inset ring-red-400 active:cursor-grabbing" : "cursor-pointer"}`}
                        style={{
                          left: `calc(${cell.x * 100}% + ${gap}px)`,
                          top: `calc(${cell.y * 100}% + ${gap}px)`,
                          width: `calc(${cell.w * 100}% - ${gap * 2}px)`,
                          height: `calc(${cell.h * 100}% - ${gap * 2}px)`,
                          borderRadius: `${radius}px`,
                        }}
                      >
                        <Image
                          fill
                          sizes="100%"
                          src={item.src}
                          alt={`Grid image ${index + 1}`}
                          className="h-full w-full object-cover"
                          style={{
                            filter: previewFilter(item.adjustments),
                            objectPosition: `${item.adjustments.positionX}% ${item.adjustments.positionY}%`,
                          }}
                        />
                        <DustOverlay amount={item.adjustments.dust} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  {sliderStyle === "stack" && items.length > 1 && (
                    <>
                      <div className="absolute inset-6 rotate-3 rounded-3xl bg-red-950/70" />
                      <div className="absolute inset-3 -rotate-2 rounded-3xl bg-zinc-900" />
                    </>
                  )}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={previewItem.id}
                      {...motionStyle}
                      onPointerDown={(event) =>
                        startPreviewDrag(event, previewItem)
                      }
                      onPointerMove={movePreviewDrag}
                      onPointerUp={stopPreviewDrag}
                      onPointerCancel={stopPreviewDrag}
                      transition={{
                        duration: sliderStyle === "fade" ? 0.45 : 0.34,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      className="absolute inset-0 touch-none cursor-grab overflow-hidden active:cursor-grabbing transform-3d"
                    >
                      <Image
                        fill
                        sizes="100%"
                        src={previewItem.src}
                        alt={`Preview image ${previewIndex + 1}`}
                        className="h-full w-full object-cover"
                        style={{
                          filter: previewFilter(previewItem.adjustments),
                          objectPosition: `${previewItem.adjustments.positionX}% ${previewItem.adjustments.positionY}%`,
                        }}
                      />
                      <DustOverlay amount={previewItem.adjustments.dust} />
                    </motion.div>
                  </AnimatePresence>
                  {items.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => movePreview(-1)}
                        aria-label="Previous preview image"
                        className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 backdrop-blur"
                      >
                        <IoArrowBack />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePreview(1)}
                        aria-label="Next preview image"
                        className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 backdrop-blur"
                      >
                        <IoArrowForward />
                      </button>
                    </>
                  )}
                  {sliderStyle === "filmstrip" && items.length > 1 ? (
                    <div className="absolute bottom-3 left-3 right-3 flex gap-1.5 rounded-2xl bg-black/70 p-2 backdrop-blur">
                      {items.map((item, index) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setPreviewIndex(index);
                            setActiveId(item.id);
                          }}
                          className={`relative h-10 flex-1 overflow-hidden rounded-lg ${index === previewIndex ? "ring-2 ring-red-400" : "opacity-55"}`}
                        >
                          <Image
                            src={item.src}
                            alt=""
                            fill
                            className="h-full w-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    items.length > 1 && (
                      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                        {items.map((item, index) => (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => {
                              setPreviewIndex(index);
                              setActiveId(item.id);
                            }}
                            aria-label={`Show image ${index + 1}`}
                            className={`h-1.5 rounded-full transition-all ${index === previewIndex ? "w-6 bg-red-400" : "w-1.5 bg-white/55"}`}
                          />
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </motion.div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {items.map((item, index) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setPreviewIndex(index);
                    setActiveId(item.id);
                  }}
                  className={`relative h-16 w-14 shrink-0 overflow-hidden rounded-xl border ${activeItem?.id === item.id ? "border-red-400" : "border-red-950"}`}
                >
                  <Image
                    src={item.src}
                    alt={`Select image ${index + 1}`}
                    fill
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute right-1 top-1 rounded-full bg-black/70 px-1 text-[9px]">
                    {index + 1}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <aside className="order-3 rounded-[28px] border border-red-900/45 bg-[#130608]/95 p-4 shadow-2xl backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-1 rounded-2xl bg-black/35 p-1">
            {[
              { id: "format", label: "Format", icon: IoAlbumsOutline },
              { id: "adjust", label: "Adjust", icon: IoOptionsOutline },
              { id: "details", label: "Details", icon: IoSparklesOutline },
            ].map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                onClick={() => setActiveTab(id)}
                className={`rounded-xl px-2 py-2 text-xs font-semibold ${activeTab === id ? "bg-red-700 text-white" : "text-zinc-500 hover:text-white"}`}
              >
                <Icon className="mx-auto mb-1 text-lg" />
                {label}
              </button>
            ))}
          </div>

          <div className="mt-5 min-h-80">
            {activeTab === "format" && (
              <div>
                <h2 className="font-bold">Post format</h2>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <ModeButton
                    active={mode === "single"}
                    disabled={items.length > 1}
                    onClick={() => setMode("single")}
                    icon={IoImagesOutline}
                    label="Single"
                  />
                  <ModeButton
                    active={mode === "carousel"}
                    disabled={items.length < 2}
                    onClick={() => setMode("carousel")}
                    icon={IoAlbumsOutline}
                    label="Slider"
                  />
                  <ModeButton
                    active={mode === "grid"}
                    disabled={items.length < 2}
                    onClick={() => setMode("grid")}
                    icon={IoGridOutline}
                    label="Grid"
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-zinc-500">
                  Slider keeps each image swipeable. Grid combines all selected
                  images into one designed post.
                </p>
                <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                  Aspect ratio
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(RATIOS).map(([id, item]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setRatioId(id)}
                      className={`rounded-xl border px-2 py-3 text-xs ${ratioId === id ? "border-red-400 bg-red-500/15" : "border-red-950 bg-black/25"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {isCarousel && (
                  <>
                    <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                      Slider animation · 7 styles
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {SLIDER_STYLES.map((item) => (
                        <ChoiceButton
                          key={item.id}
                          active={sliderStyle === item.id}
                          onClick={() => setSliderStyle(item.id)}
                          item={item}
                        />
                      ))}
                    </div>
                  </>
                )}
                {isGrid && (
                  <>
                    <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-zinc-600">
                      Grid layout
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {GRID_LAYOUTS.map((item) => (
                        <ChoiceButton
                          key={item.id}
                          active={gridLayout === item.id}
                          onClick={() => setGridLayout(item.id)}
                          item={item}
                        />
                      ))}
                    </div>
                    <Range
                      label="Grid spacing"
                      value={gap}
                      min={0}
                      max={12}
                      suffix="px"
                      onChange={setGap}
                    />
                    <Range
                      label="Corner radius"
                      value={radius}
                      min={0}
                      max={30}
                      suffix="px"
                      onChange={setRadius}
                    />
                  </>
                )}
              </div>
            )}

            {activeTab === "adjust" && (
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-bold">Manual adjustments</h2>
                    <p className="text-xs text-zinc-600">
                      Editing {activeItem?.name}
                    </p>
                    <p className="mt-1 text-[11px] text-red-300/80">
                      Select an image, then drag it in the preview to reposition
                      it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={applyToAll}
                    className="rounded-full border border-red-800 px-3 py-1 text-[10px] text-red-200"
                  >
                    Apply to all
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {PRESETS.map((preset) => (
                    <button
                      type="button"
                      key={preset.name}
                      onClick={() => applyPreset(preset.values)}
                      className="rounded-xl border border-red-950 bg-black/25 py-2 text-xs hover:border-red-700"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                {activeItem && (
                  <div className="mt-4">
                    {[
                      ["Brightness", "brightness", 50, 150, "%"],
                      ["Contrast", "contrast", 50, 170, "%"],
                      ["Saturation", "saturation", 0, 200, "%"],
                      ["Warmth", "warmth", -100, 100, ""],
                      ["Blur", "blur", 0, 8, "px"],
                      ["Sharpness", "sharpness", 0, 100, "%"],
                      ["Dust effect", "dust", 0, 100, "%"],
                    ].map(([label, key, min, max, suffix]) => (
                      <Range
                        key={key}
                        label={label}
                        value={activeItem.adjustments[key]}
                        min={min}
                        max={max}
                        suffix={suffix}
                        onChange={(value) => updateActive({ [key]: value })}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => updateActive(DEFAULT_ADJUSTMENTS)}
                      className="mt-5 w-full rounded-xl border border-red-900/60 bg-red-950/30 py-2.5 text-xs font-semibold text-red-200"
                    >
                      Reset this image
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "details" && (
              <div>
                <h2 className="font-bold">Post details</h2>
                <label className="mt-4 block">
                  <span className="mb-2 flex justify-between text-xs text-zinc-400">
                    <span>Caption</span>
                    <span>{caption.length}/2200</span>
                  </span>
                  <textarea
                    value={caption}
                    onChange={(event) =>
                      setCaption(event.target.value.slice(0, 2200))
                    }
                    rows={7}
                    placeholder="Write a caption…"
                    className="w-full resize-none rounded-2xl border border-red-950 bg-black/40 p-3 text-sm outline-none placeholder:text-zinc-700 focus:border-red-600"
                  />
                </label>
                <div className="mt-4 rounded-2xl border border-red-900/40 bg-red-950/20 p-3 text-xs leading-5 text-zinc-500">
                  <strong className="text-red-200">High-quality export</strong>
                  <br />
                  Edits are rendered before upload. Your post stores optimized
                  images in S3 and only metadata in DynamoDB.
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={createPost}
            disabled={uploading || !caption.trim()}
            className="mt-5 w-full rounded-2xl bg-linear-to-r from-red-900 via-red-700 to-red-500 py-3.5 font-black shadow-lg shadow-red-950/40 disabled:opacity-40"
          >
            {uploading
              ? status || `Uploading ${uploadProgress}%`
              : "Share post"}
          </button>
          {uploading && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black">
              <motion.div
                className="h-full bg-linear-to-r from-red-900 to-red-400"
                animate={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function DustOverlay({ amount }) {
  if (!amount) return null;
  return (
    <span
      className="pointer-events-none absolute inset-0 mix-blend-screen"
      style={{
        opacity: amount / 155,
        backgroundImage:
          "radial-gradient(circle at 15% 18%,#fff 0 1px,transparent 1.7px),radial-gradient(circle at 72% 32%,#f5d0c5 0 1px,transparent 1.8px),radial-gradient(circle at 42% 81%,#fff 0 .8px,transparent 1.5px)",
        backgroundSize: "37px 43px,51px 47px,29px 31px",
      }}
    />
  );
}

function MiniButton({ label, onClick, disabled, danger, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid h-7 w-7 place-items-center rounded-lg text-xs disabled:opacity-20 ${danger ? "bg-red-500/15 text-red-300" : "bg-white/6 text-zinc-400"}`}
    >
      {children}
    </button>
  );
}

function ModeButton({ active, disabled, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border py-3 text-xs font-semibold disabled:opacity-25 ${active ? "border-red-400 bg-red-600 text-white" : "border-red-950 bg-black/25 text-zinc-500"}`}
    >
      <Icon className="mx-auto mb-1 text-xl" />
      {label}
      {active && <IoCheckmark className="mx-auto mt-1" />}
    </button>
  );
}

function ChoiceButton({ active, onClick, item }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-3 text-left ${active ? "border-red-400 bg-red-500/15" : "border-red-950 bg-black/25"}`}
    >
      <strong className="block text-xs">{item.name}</strong>
      <span className="mt-1 block text-[10px] leading-4 text-zinc-600">
        {item.note}
      </span>
    </button>
  );
}

function Range({ label, value, min, max, suffix, onChange }) {
  return (
    <label className="mt-4 block">
      <span className="mb-2 flex justify-between text-xs text-zinc-500">
        <span>{label}</span>
        <span className="text-zinc-300">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-red-600"
      />
    </label>
  );
}
