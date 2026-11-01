"use client";

/* Local previews use blob URLs; Next Image optimization is not applicable. */
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
const EXPORT_WIDTH = 1080;
const MAX_IMAGES = 6;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

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
  {
    name: "Crimson",
    value: "linear-gradient(145deg,#21050a,#7f1d1d,#dc2626)",
  },
  {
    name: "Burgundy",
    value: "linear-gradient(145deg,#190308,#4c0519,#881337)",
  },
  {
    name: "Ember",
    value: "linear-gradient(145deg,#1c0505,#7f1d1d,#ea580c)",
  },
  {
    name: "Ruby",
    value: "linear-gradient(145deg,#260407,#9f1239,#fb7185)",
  },
  {
    name: "Wine",
    value: "linear-gradient(145deg,#120208,#4a044e,#881337)",
  },
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

const clamp = (value, min, max) =>
  Math.min(max, Math.max(min, value));

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createText() {
  return {
    id: createId(),
    value: "Tap to edit",
    x: 8,
    y: 78,
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => resolve(true);

    image.onerror = () =>
      reject(new Error("This image could not be opened."));

    image.src = src;
  });
}

function getNormalizedLocation(location) {
  if (!location) return null;

  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
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

  const imagesRef = useRef([]);
  const objectUrlsRef = useRef(new Set());

  const isAddingImagesRef = useRef(false);
  const postLockRef = useRef(false);

  const activeStrokeRef = useRef(null);
  const activeImageDragRef = useRef(null);

  const [images, setImages] = useState([]);
  const [isAddingImages, setIsAddingImages] = useState(false);

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

  const layout = LAYOUTS[layoutId] || LAYOUTS.one;

  const visibleCells = useMemo(
    () =>
      layout.cells.map((cell, index) => ({
        cell,
        image: images[index] || null,
      })),
    [layout, images],
  );

  const selectedImage =
    images.find((item) => item.id === selectedImageId) ||
    images[0] ||
    null;

  const selectedText =
    texts.find((item) => item.id === selectedTextId) || null;

  // Keep blob URLs cleaned up when the component unmounts.
  useEffect(() => {
    return () => {
      for (const url of objectUrlsRef.current) {
        URL.revokeObjectURL(url);
      }

      objectUrlsRef.current.clear();
    };
  }, []);

  // Load local missions.
  useEffect(() => {
    const controller = new AbortController();

    async function loadMissions() {
      try {
        const response = await fetch("/api/missions", {
          signal: controller.signal,
        });

        if (!response.ok) return;

        const data = await response.json();

        setMissions(
          Array.isArray(data?.missions) ? data.missions : [],
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.error("Unable to load missions:", error);
        }
      }
    }

    void loadMissions();

    return () => controller.abort();
  }, []);

  // Search users with debounce.
  useEffect(() => {
    const query = mentionQuery.trim().replace(/^@/, "");

    if (query.length < 2 || mentionedUsers.length >= 10) {
      setMentionResults([]);
      return undefined;
    }

    const controller = new AbortController();

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search/users?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          setMentionResults([]);
          return;
        }

        const data = await response.json();

        const selectedIds = new Set(
          mentionedUsers.map((user) => String(user._id)),
        );

        const users = Array.isArray(data?.users)
          ? data.users
          : [];

        setMentionResults(
          users.filter(
            (user) =>
              user?._id &&
              user?.username &&
              !selectedIds.has(String(user._id)),
          ),
        );
      } catch (error) {
        if (error?.name !== "AbortError") {
          setMentionResults([]);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [mentionQuery, mentionedUsers]);

  const commitImages = useCallback((nextImages) => {
    imagesRef.current = nextImages;
    setImages(nextImages);
  }, []);

  // Add and validate images.
  const addImages = async (event) => {
    const chosen = Array.from(event.target.files || []);

    event.target.value = "";

    if (
      !chosen.length ||
      isAddingImagesRef.current ||
      postLockRef.current
    ) {
      return;
    }

    const remaining = MAX_IMAGES - imagesRef.current.length;

    if (remaining <= 0) {
      window.alert(`You can add a maximum of ${MAX_IMAGES} photos.`);
      return;
    }

    const validFiles = chosen.filter(
      (file) =>
        ALLOWED_IMAGE_TYPES.has(file.type) &&
        file.size > 0 &&
        file.size <= MAX_FILE_SIZE,
    );

    const invalidCount = chosen.length - validFiles.length;

    if (!validFiles.length) {
      window.alert(
        "Choose JPG, PNG, WebP or GIF images smaller than 15 MB each.",
      );
      return;
    }

    isAddingImagesRef.current = true;
    setIsAddingImages(true);

    const filesToProcess = validFiles.slice(0, remaining);

    const overflowCount = Math.max(
      0,
      validFiles.length - filesToProcess.length,
    );

    try {
      const results = await Promise.all(
        filesToProcess.map(async (file) => {
          const src = URL.createObjectURL(file);

          objectUrlsRef.current.add(src);

          try {
            await loadImage(src);

            return {
              ok: true,
              image: {
                id: createId(),
                name: file.name,
                src,
                scale: 1,
                x: 50,
                y: 50,
                filter: "none",
              },
            };
          } catch (error) {
            URL.revokeObjectURL(src);
            objectUrlsRef.current.delete(src);

            return {
              ok: false,
              fileName: file.name,
              error,
            };
          }
        }),
      );

      const added = results
        .filter((result) => result.ok)
        .map((result) => result.image);

      const failedCount = results.length - added.length;

      const currentImages = imagesRef.current;

      const nextImages = [...currentImages, ...added].slice(
        0,
        MAX_IMAGES,
      );

      const keptIds = new Set(
        nextImages.map((item) => item.id),
      );

      // Revoke previews that were not retained.
      for (const image of added) {
        if (!keptIds.has(image.id)) {
          URL.revokeObjectURL(image.src);
          objectUrlsRef.current.delete(image.src);
        }
      }

      commitImages(nextImages);

      if (added.length) {
        setSelectedImageId(added[0].id);

        const suggestedLayout = Object.entries(LAYOUTS).find(
          ([, item]) =>
            item.count === Math.min(
              nextImages.length,
              MAX_IMAGES,
            ),
        );

        if (suggestedLayout) {
          setLayoutId(suggestedLayout[0]);
        }
      }

      if (invalidCount || overflowCount || failedCount) {
        const messages = [];

        if (invalidCount) {
          messages.push(
            `${invalidCount} unsupported or oversized file(s) skipped`,
          );
        }

        if (overflowCount) {
          messages.push(
            `${overflowCount} file(s) skipped because the six-photo limit was reached`,
          );
        }

        if (failedCount) {
          messages.push(
            `${failedCount} unreadable file(s) skipped`,
          );
        }

        window.alert(messages.join(". ") + ".");
      }
    } catch (error) {
      console.error("Unable to add story images:", error);

      window.alert(
        error?.message || "Unable to load the selected images.",
      );
    } finally {
      isAddingImagesRef.current = false;
      setIsAddingImages(false);
    }
  };

  const updateImage = (changes) => {
    if (!selectedImage || postLockRef.current) return;

    const next = imagesRef.current.map((item) =>
      item.id === selectedImage.id
        ? { ...item, ...changes }
        : item,
    );

    commitImages(next);
  };

  // Image dragging.
  const startImageDrag = useCallback(
    (event, image) => {
      if (!image || drawingMode || postLockRef.current) return;

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.stopPropagation();

      if (selectedImageId !== image.id) {
        setSelectedImageId(image.id);
        return;
      }

      event.preventDefault();

      const rect = event.currentTarget.getBoundingClientRect();

      activeImageDragRef.current = {
        id: image.id,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        x: image.x,
        y: image.y,
        width: Math.max(rect.width, 1),
        height: Math.max(rect.height, 1),
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [drawingMode, selectedImageId],
  );

  const moveImageDrag = useCallback((event) => {
    const drag = activeImageDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();

    const deltaX =
      ((event.clientX - drag.clientX) / drag.width) * 100;

    const deltaY =
      ((event.clientY - drag.clientY) / drag.height) * 100;

    const next = imagesRef.current.map((item) =>
      item.id === drag.id
        ? {
            ...item,
            x: clamp(drag.x - deltaX, 0, 100),
            y: clamp(drag.y - deltaY, 0, 100),
          }
        : item,
    );

    commitImages(next);
  }, [commitImages]);

  const stopImageDrag = useCallback((event) => {
    const drag = activeImageDragRef.current;

    if (
      !drag ||
      (event?.pointerId != null &&
        drag.pointerId !== event.pointerId)
    ) {
      return;
    }

    activeImageDragRef.current = null;

    if (
      event?.currentTarget?.hasPointerCapture?.(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const removeImage = (id) => {
    if (postLockRef.current) return;

    const removed = imagesRef.current.find(
      (item) => item.id === id,
    );

    const nextImages = imagesRef.current.filter(
      (item) => item.id !== id,
    );

    commitImages(nextImages);

    if (removed?.src) {
      URL.revokeObjectURL(removed.src);
      objectUrlsRef.current.delete(removed.src);
    }

    if (selectedImageId === id) {
      setSelectedImageId(nextImages[0]?.id || null);
    }

    if (!nextImages.length) {
      setLayoutId("one");
    }
  };

  const moveImage = (index, direction) => {
    if (postLockRef.current) return;

    const target = index + direction;
    const current = imagesRef.current;

    if (target < 0 || target >= current.length) return;

    const next = [...current];

    [next[index], next[target]] = [
      next[target],
      next[index],
    ];

    commitImages(next);
  };

  // Text layers.
  const addText = () => {
    if (postLockRef.current) return;

    const item = createText();

    setTexts((current) => [...current, item]);
    setSelectedTextId(item.id);

    setDrawingMode(false);
    setActiveTab("text");
  };

  const updateText = (changes) => {
    if (!selectedTextId || postLockRef.current) return;

    setTexts((current) =>
      current.map((item) =>
        item.id === selectedTextId
          ? { ...item, ...changes }
          : item,
      ),
    );
  };

  // Mentions.
  const mentionUser = (user) => {
    if (
      !user?._id ||
      !user?.username ||
      mentionedUsers.some(
        (item) => String(item._id) === String(user._id),
      ) ||
      mentionedUsers.length >= 10
    ) {
      return;
    }

    setMentionedUsers((current) =>
      [...current, user].slice(0, 10),
    );

    const mention = `@${user.username}`;

    if (selectedText) {
      setTexts((current) =>
        current.map((item) =>
          item.id === selectedText.id
            ? {
                ...item,
                value: `${item.value.trim()} ${mention}`
                  .trim()
                  .slice(0, 160),
              }
            : item,
        ),
      );
    } else {
      setCaption((current) =>
        `${current.trim()} ${mention}`
          .trim()
          .slice(0, 500),
      );
    }

    setMentionQuery("");
    setMentionResults([]);
  };

  const removeMention = (user) => {
    const mention = `@${user.username}`;

    setMentionedUsers((current) =>
      current.filter(
        (item) => String(item._id) !== String(user._id),
      ),
    );

    setCaption((current) =>
      current
        .replaceAll(mention, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
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
  
    // Drawing tools.
  const pointForEvent = useCallback((event) => {
    const rect = editorRef.current?.getBoundingClientRect();

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * STORY_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * STORY_HEIGHT,
    };
  }, []);

  const startDrawing = useCallback(
    (event) => {
      if (!drawingMode || postLockRef.current) return;

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();

      const point = pointForEvent(event);
      if (!point) return;

      const id = createId();

      activeStrokeRef.current = {
        id,
        pointerId: event.pointerId,
      };

      event.currentTarget.setPointerCapture?.(event.pointerId);

      setStrokes((current) => [
        ...current,
        {
          id,
          color: brushColor,
          width: brushSize,
          points: [point],
        },
      ]);
    },
    [brushColor, brushSize, drawingMode, pointForEvent],
  );

  const continueDrawing = useCallback(
    (event) => {
      const active = activeStrokeRef.current;

      if (
        !drawingMode ||
        !active ||
        active.pointerId !== event.pointerId
      ) {
        return;
      }

      event.preventDefault();

      const point = pointForEvent(event);
      if (!point) return;

      setStrokes((current) =>
        current.map((stroke) => {
          if (stroke.id !== active.id) return stroke;

          const lastPoint =
            stroke.points[stroke.points.length - 1];

          const distance = Math.hypot(
            point.x - lastPoint.x,
            point.y - lastPoint.y,
          );

          // Prevent excessive points during drawing.
          if (distance < 1.5) return stroke;

          return {
            ...stroke,
            points: [...stroke.points, point],
          };
        }),
      );
    },
    [drawingMode, pointForEvent],
  );

  const stopDrawing = useCallback((event) => {
    const active = activeStrokeRef.current;

    if (
      !active ||
      (event?.pointerId != null &&
        active.pointerId !== event.pointerId)
    ) {
      return;
    }

    activeStrokeRef.current = null;

    if (
      event?.currentTarget?.hasPointerCapture?.(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  // Share story.
  const shareStory = async (location = selectedLocation) => {
    if (!imagesRef.current.length || postLockRef.current) {
      return;
    }

    const coordinates = getNormalizedLocation(location);

    // Location is required before upload.
    if (!coordinates) {
      if (location) {
        window.alert(
          "Please choose a valid location before sharing your story.",
        );
      }

      setShowLocationPicker(true);
      return;
    }

    postLockRef.current = true;

    setIsPosting(true);
    setProgress(0);
    setPostStage("Preparing your story…");

    try {
      const editor = editorRef.current;

      if (!editor) {
        throw new Error("The story preview is not ready.");
      }

      setIsExporting(true);

      // Allow React to update the preview before exporting.
      await new Promise((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(resolve),
        ),
      );

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      const bounds = editor.getBoundingClientRect();

      if (!bounds.width || !bounds.height) {
        throw new Error(
          "The story preview has no visible size.",
        );
      }

      // Export at 1080 × 1920.
      const pixelRatio = EXPORT_WIDTH / bounds.width;

      const blob = await toBlob(editor, {
        cacheBust: false,
        pixelRatio,
        backgroundColor: "#070203",
      });

      setIsExporting(false);

      if (!blob) {
        throw new Error(
          "Could not prepare your story image.",
        );
      }

      setShowProgress(true);
      setPostStage("Uploading your story…");

      const file = new File(
        [blob],
        `story-${Date.now()}.png`,
        {
          type: "image/png",
        },
      );

      // Upload directly to AWS S3.
      const uploaded = await uploadMediaDirect(file, {
        onProgress: (rawValue) => {
          const numericValue = Number(rawValue);

          if (!Number.isFinite(numericValue)) return;

          const percent =
            numericValue <= 1
              ? numericValue * 100
              : numericValue;

          setProgress(
            clamp(Math.round(percent * 0.9), 0, 90),
          );
        },
      });

      if (!uploaded?.key) {
        throw new Error(
          "The media upload completed without returning a file key.",
        );
      }

      setPostStage("Saving your story…");

      const response = await fetch("/api/story-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaKey: uploaded.key,
          mediaType: "image",
          duration: clamp(Number(duration) || 20, 5, 60),
          caption: caption.trim().slice(0, 500),

          mentionedUserIds: mentionedUsers
            .map((user) => user?._id)
            .filter(Boolean),

          missionId: missionId || null,

          timeZone:
            Intl.DateTimeFormat().resolvedOptions().timeZone,

          location: coordinates,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to share this story.",
        );
      }

      setSelectedLocation(coordinates);
      setProgress(100);
      setPostStage("Shared");

      router.push("/stories-globe");
    } catch (error) {
      console.error("Story upload error:", error);

      setShowProgress(false);
      setProgress(0);

      window.alert(
        error?.message ||
          "Story upload failed. Please try again.",
      );
    } finally {
      setIsExporting(false);
      setIsPosting(false);

      postLockRef.current = false;
    }
  };

  const openFilePicker = () => {
    if (!postLockRef.current && !isAddingImages) {
      fileRef.current?.click();
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#070203] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(220,38,38,.22),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(127,29,29,.2),transparent_34%)]" />

      <div className="relative mx-auto max-w-[1500px] px-3 py-4 sm:px-6 lg:px-8">

        {/* Location picker */}
        {showLocationPicker && (
          <LocationPickerDialog
            onClose={() => setShowLocationPicker(false)}
            onSelect={(location) => {
              const normalized =
                getNormalizedLocation(location);

              if (!normalized) {
                window.alert(
                  "The selected location is invalid. Please try again.",
                );
                return;
              }

              setSelectedLocation(normalized);
              setShowLocationPicker(false);

              void shareStory(normalized);
            }}
          />
        )}

        {/* Header */}
        <header className="mb-5 flex items-center justify-between gap-3">
          <Link
            href="/"
            aria-label="Close story creator"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-xl hover:bg-white/10"
          >
            <IoClose />
          </Link>

          <div className="min-w-0 text-center">
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
            disabled={
              !images.length ||
              isPosting ||
              isAddingImages
            }
            className="shrink-0 rounded-full border border-red-400/30 bg-linear-to-r from-red-950 via-red-700 to-red-500 px-5 py-2.5 text-sm font-black shadow-lg shadow-red-950/50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPosting
              ? postStage || "Sharing…"
              : "Share"}
          </button>
        </header>

        <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(360px,1fr)_350px]">

          {/* MEDIA LIBRARY */}
          <aside
            className={`order-2 rounded-[28px] border border-red-900/50 bg-[#130608]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl xl:order-1 ${
              isPosting
                ? "pointer-events-none opacity-70"
                : ""
            }`}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold">Your media</h2>

                <p className="text-xs text-zinc-500">
                  {images.length} of {MAX_IMAGES} photos
                </p>
              </div>

              <button
                type="button"
                onClick={openFilePicker}
                disabled={
                  images.length >= MAX_IMAGES ||
                  isAddingImages ||
                  isPosting
                }
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
              disabled={isAddingImages || isPosting}
            />

            {!images.length ? (
              <button
                type="button"
                onClick={openFilePicker}
                disabled={isAddingImages || isPosting}
                className="grid min-h-56 w-full place-items-center rounded-3xl border border-dashed border-red-900/70 bg-black/25 p-6 text-center hover:border-red-500 hover:bg-red-950/20 disabled:opacity-50"
              >
                <span>
                  <IoImagesOutline className="mx-auto mb-3 text-4xl text-red-400" />

                  <strong className="block">
                    {isAddingImages
                      ? "Loading photos…"
                      : "Add your photos"}
                  </strong>

                  <span className="mt-2 block text-xs leading-5 text-zinc-500">
                    Choose up to six JPG, PNG, WebP or GIF images (15 MB each).
                  </span>
                </span>
              </button>
            ) : (
              <div className="space-y-2">
                {images.map((item, index) => (
                  <div
                    key={item.id}
                    className={`group flex w-full items-center gap-2 rounded-2xl border p-2 transition ${
                      selectedImage?.id === item.id
                        ? "border-red-400 bg-red-500/10"
                        : "border-red-950/60 bg-black/25 hover:border-red-900"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedImageId(item.id)}
                      disabled={isPosting}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
                    >
                      <img
                        src={item.src}
                        alt={`Selected photo ${index + 1}`}
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
                    </button>

                    <span className="flex gap-1 opacity-70 transition group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => moveImage(index, -1)}
                        disabled={index === 0 || isPosting}
                        className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label={`Move photo ${index + 1} earlier`}
                      >
                        <IoArrowUp />
                      </button>

                      <button
                        type="button"
                        onClick={() => moveImage(index, 1)}
                        disabled={
                          index === images.length - 1 ||
                          isPosting
                        }
                        className="grid h-7 w-7 place-items-center rounded-full bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                        aria-label={`Move photo ${index + 1} later`}
                      >
                        <IoArrowDown />
                      </button>

                      <button
                        type="button"
                        onClick={() => removeImage(item.id)}
                        disabled={isPosting}
                        className="grid h-7 w-7 place-items-center rounded-full bg-red-500/20 text-red-300 disabled:opacity-30"
                        aria-label={`Remove photo ${index + 1}`}
                      >
                        <IoTrashOutline />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* STORY PREVIEW */}
          <section
            className={`order-1 xl:order-2 ${
              isPosting ? "pointer-events-none" : ""
            }`}
          >
            <div className="relative mx-auto w-full max-w-[430px]">

              <div className="mb-3 flex items-center justify-between px-1 text-xs font-medium text-zinc-400">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                  Live preview
                </span>

                <span>9:16 · 1080 × 1920 export</span>
              </div>

              <div className="bg-linear-to-br from-red-950 via-red-600 to-red-900 p-[3px] shadow-[0_24px_90px_rgba(127,29,29,.3)]">
                <div
                  ref={editorRef}
                  className="relative w-full overflow-hidden bg-zinc-950"
                  style={{
                    aspectRatio: "9 / 16",
                    background,
                  }}
                  onClick={() => {
                    if (drawingMode || isExporting) return;

                    setSelectedImageId(null);
                    setSelectedTextId(null);
                  }}
                >
                  {/* Image layout cells */}
                  {visibleCells.map(({ cell, image }, index) => (
                    <div
                      key={`${layoutId}-${index}`}
                      onClick={(event) => {
                        event.stopPropagation();

                        if (isExporting || isPosting) return;

                        if (image) {
                          setSelectedImageId(image.id);
                        } else if (images.length < MAX_IMAGES) {
                          openFilePicker();
                        }
                      }}
                      onPointerDown={(event) =>
                        startImageDrag(event, image)
                      }
                      onPointerMove={moveImageDrag}
                      onPointerUp={stopImageDrag}
                      onPointerCancel={stopImageDrag}
                      className={`absolute overflow-hidden ${
                        image?.id === selectedImage?.id &&
                        !isExporting
                          ? "touch-none cursor-grab ring-2 ring-inset ring-white active:cursor-grabbing"
                          : "cursor-pointer"
                      }`}
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
                      ) : isExporting ? null : (
                        <span className="grid h-full w-full place-items-center border border-dashed border-white/25 bg-black/15 text-white/55">
                          <IoAdd className="text-2xl" />
                        </span>
                      )}
                    </div>
                  ))}

                  {/* Drawing layer */}
                  <svg
                    viewBox={`0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`}
                    preserveAspectRatio="none"
                    onPointerDown={startDrawing}
                    onPointerMove={continueDrawing}
                    onPointerUp={stopDrawing}
                    onPointerCancel={stopDrawing}
                    className={`absolute inset-0 z-20 h-full w-full ${
                      drawingMode && !isExporting
                        ? "cursor-crosshair touch-none"
                        : "pointer-events-none"
                    }`}
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
                            .map(
                              (point) =>
                                `${point.x},${point.y}`,
                            )
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

                  {/* Text layers */}
                  {texts.map((item) => (
                    <motion.div
                      key={item.id}
                      drag={
                        !drawingMode &&
                        !isExporting &&
                        !isPosting
                      }
                      dragMomentum={false}
                      dragElastic={0.04}
                      animate={{
                        x: 0,
                        y: 0,
                        rotate: item.rotation,
                      }}
                      onDragStart={() =>
                        setSelectedTextId(item.id)
                      }
                      onDragEnd={(_, info) => {
                        const rect =
                          editorRef.current?.getBoundingClientRect();

                        if (!rect?.width || !rect?.height) {
                          return;
                        }

                        const deltaX =
                          (info.offset.x / rect.width) * 100;

                        const deltaY =
                          (info.offset.y / rect.height) * 100;

                        setTexts((current) =>
                          current.map((text) =>
                            text.id === item.id
                              ? {
                                  ...text,
                                  x: clamp(
                                    text.x + deltaX,
                                    0,
                                    95,
                                  ),
                                  y: clamp(
                                    text.y + deltaY,
                                    0,
                                    95,
                                  ),
                                }
                              : text,
                          ),
                        );
                      }}
                      onClick={(event) => {
                        event.stopPropagation();

                        if (isExporting || isPosting) return;

                        setSelectedTextId(item.id);
                        setActiveTab("text");
                      }}
                      className={`absolute left-0 top-0 z-30 max-w-[85%] cursor-move whitespace-pre-wrap rounded-xl px-3 py-1.5 text-center font-bold leading-tight ${
                        selectedTextId === item.id &&
                        !isExporting
                          ? "ring-2 ring-white"
                          : ""
                      }`}
                      style={{
                        left: `${item.x}%`,
                        top: `${item.y}%`,
                        fontSize: `${item.size}px`,
                        color: item.color,

                        background: item.showBackground
                          ? item.backgroundColor
                          : "transparent",

                        border: item.showBorder
                          ? `${item.borderWidth}px solid ${item.borderColor}`
                          : "none",

                        fontFamily: item.fontFamily,
                        fontWeight: item.fontWeight,

                        fontStyle: item.italic
                          ? "italic"
                          : "normal",

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

                  {/* Empty story state */}
                  {!images.length && !isExporting && (
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="absolute inset-0 z-10 grid place-items-center p-10 text-center"
                    >
                      <span>
                        <span className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-full bg-white/15 backdrop-blur">
                          <IoImagesOutline className="text-4xl" />
                        </span>

                        <strong className="text-2xl">
                          Start with a photo
                        </strong>

                        <span className="mt-2 block text-sm text-white/65">
                          You can add up to six images.
                        </span>
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Quick actions */}
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={addText}
                  disabled={isPosting}
                  className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
                >
                  <IoText />
                  Add text
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isPosting) return;

                    setDrawingMode((current) => !current);
                    setActiveTab("draw");
                  }}
                  disabled={isPosting}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-40 ${
                    drawingMode
                      ? "bg-red-600"
                      : "bg-red-950/70"
                  }`}
                >
                  <IoBrush />
                  {drawingMode ? "Done" : "Draw"}
                </button>
              </div>
            </div>
          </section>
          
                    {/* EDITING TOOLS AND POST DETAILS */}
          <aside
            className={`order-3 rounded-[28px] border border-red-900/50 bg-[#130608]/90 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl ${
              isPosting
                ? "pointer-events-none opacity-70"
                : ""
            }`}
          >
            {/* Tabs */}
            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-black/35 p-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  type="button"
                  key={id}
                  onClick={() => {
                    setActiveTab(id);
                    setDrawingMode(id === "draw");
                  }}
                  disabled={isPosting}
                  aria-pressed={activeTab === id}
                  className={`rounded-xl px-2 py-2 text-[11px] font-semibold transition disabled:opacity-40 ${
                    activeTab === id
                      ? "bg-white text-black"
                      : "text-zinc-400 hover:text-white"
                  }`}
                >
                  <Icon className="mx-auto mb-1 text-lg" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5 min-h-72">

              {/* LAYOUT TAB */}
              {activeTab === "layout" && (
                <div>
                  <h2 className="font-bold">Choose a layout</h2>

                  <p className="mt-1 text-xs text-zinc-500">
                    Empty cells can be filled later. Photos are placed
                    in the order shown on the left.
                  </p>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {Object.entries(LAYOUTS).map(([id, item]) => (
                      <button
                        type="button"
                        key={id}
                        onClick={() => setLayoutId(id)}
                        disabled={isPosting}
                        className={`grid place-items-center rounded-2xl border py-3 transition disabled:opacity-40 ${
                          layoutId === id
                            ? "border-red-400 bg-red-500/15"
                            : "border-red-950/70 bg-black/20"
                        }`}
                        title={item.name}
                        aria-pressed={layoutId === id}
                      >
                        <LayoutIcon layout={item} />

                        <span className="mt-1 text-[10px]">
                          {item.name}
                        </span>
                      </button>
                    ))}
                  </div>

                  {images.length > layout.count && (
                    <p className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-2 text-xs text-amber-200">
                      This layout displays {layout.count} photo(s).
                      {" "}
                      {images.length - layout.count} photo(s) remain
                      in your media list and will not appear in the
                      exported story.
                    </p>
                  )}

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
                      <button
                        type="button"
                        key={item.name}
                        title={item.name}
                        aria-label={`${item.name} background`}
                        aria-pressed={background === item.value}
                        onClick={() => setBackground(item.value)}
                        className={`h-9 w-9 rounded-full border-2 ${
                          background === item.value
                            ? "border-white"
                            : "border-transparent"
                        }`}
                        style={{ background: item.value }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ADJUST TAB */}
              {activeTab === "adjust" && (
                <div>
                  <h2 className="font-bold">Adjust photo</h2>

                  <p className="mt-1 text-[11px] text-red-300/80">
                    Select a photo, then drag it in the preview
                    to reposition its crop.
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
                        onChange={(value) =>
                          updateImage({ scale: value })
                        }
                      />

                      <Range
                        label="Horizontal position"
                        value={selectedImage.x}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(value) =>
                          updateImage({ x: value })
                        }
                      />

                      <Range
                        label="Vertical position"
                        value={selectedImage.y}
                        min={0}
                        max={100}
                        suffix="%"
                        onChange={(value) =>
                          updateImage({ y: value })
                        }
                      />

                      <p className="mb-2 mt-5 text-xs font-bold uppercase tracking-widest text-zinc-500">
                        Filters
                      </p>

                      <div className="grid grid-cols-4 gap-2">
                        {FILTERS.map((item) => (
                          <button
                            type="button"
                            key={item.name}
                            onClick={() =>
                              updateImage({ filter: item.value })
                            }
                            disabled={isPosting}
                            aria-pressed={
                              selectedImage.filter === item.value
                            }
                            className={`overflow-hidden rounded-xl border p-1 disabled:opacity-40 ${
                              selectedImage.filter === item.value
                                ? "border-red-400"
                                : "border-red-950/70"
                            }`}
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
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TEXT TAB */}
              {activeTab === "text" && (
                <div>
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold">Text styling</h2>

                    <button
                      type="button"
                      onClick={addText}
                      disabled={isPosting}
                      className="rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white disabled:opacity-40"
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
                          updateText({
                            value: event.target.value.slice(0, 160),
                          })
                        }
                        rows={3}
                        maxLength={160}
                        disabled={isPosting}
                        className="mt-4 w-full resize-none rounded-2xl border border-red-950 bg-black/40 p-3 outline-none focus:border-red-500 disabled:opacity-50"
                      />

                      <label className="mt-4 block text-xs text-zinc-400">
                        <span className="mb-2 block">
                          Font family
                        </span>

                        <select
                          value={selectedText.fontFamily}
                          onChange={(event) =>
                            updateText({
                              fontFamily: event.target.value,
                            })
                          }
                          disabled={isPosting}
                          className="w-full rounded-xl border border-red-950 bg-black/50 p-3 text-sm disabled:opacity-50"
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
                        onChange={(value) =>
                          updateText({ size: value })
                        }
                      />

                      <Range
                        label="Rotation"
                        value={selectedText.rotation}
                        min={-180}
                        max={180}
                        suffix="°"
                        onChange={(value) =>
                          updateText({ rotation: value })
                        }
                      />

                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateText({
                              rotation: clamp(
                                selectedText.rotation - 15,
                                -180,
                                180,
                              ),
                            })
                          }
                          disabled={isPosting}
                          className="rounded-xl border border-red-950 bg-black/30 py-2 text-xs text-zinc-300 hover:border-red-800 disabled:opacity-40"
                        >
                          Rotate −15°
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateText({ rotation: 0 })
                          }
                          disabled={isPosting}
                          className="rounded-xl border border-red-950 bg-black/30 py-2 text-xs text-zinc-300 hover:border-red-800 disabled:opacity-40"
                        >
                          Reset
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateText({
                              rotation: clamp(
                                selectedText.rotation + 15,
                                -180,
                                180,
                              ),
                            })
                          }
                          disabled={isPosting}
                          className="rounded-xl border border-red-950 bg-black/30 py-2 text-xs text-zinc-300 hover:border-red-800 disabled:opacity-40"
                        >
                          Rotate +15°
                        </button>
                      </div>

                      {/* Text decorations */}
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
                                selectedText.fontWeight === 700
                                  ? 400
                                  : 700,
                            })
                          }
                        >
                          <strong>B</strong>
                        </StyleButton>

                        <StyleButton
                          label="Italic"
                          active={selectedText.italic}
                          onClick={() =>
                            updateText({
                              italic: !selectedText.italic,
                            })
                          }
                        >
                          <em>I</em>
                        </StyleButton>

                        <StyleButton
                          label="Underline"
                          active={selectedText.underline}
                          onClick={() =>
                            updateText({
                              underline: !selectedText.underline,
                            })
                          }
                        >
                          <span className="underline">U</span>
                        </StyleButton>

                        <StyleButton
                          label="Line through"
                          active={selectedText.strike}
                          onClick={() =>
                            updateText({
                              strike: !selectedText.strike,
                            })
                          }
                        >
                          <span className="line-through">S</span>
                        </StyleButton>
                      </div>

                      {/* Text colors */}
                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <ColorInput
                          label="Text color"
                          value={selectedText.color}
                          onChange={(value) =>
                            updateText({ color: value })
                          }
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
                            updateText({
                              borderColor: value,
                              showBorder: true,
                            })
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
                            updateText({
                              borderWidth: value,
                              showBorder: true,
                            })
                          }
                        />
                      </div>

                      {/* Background and border */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <StyleButton
                          label="Text background"
                          active={selectedText.showBackground}
                          onClick={() =>
                            updateText({
                              showBackground:
                                !selectedText.showBackground,
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
                            updateText({
                              showBorder: !selectedText.showBorder,
                            })
                          }
                        >
                          {selectedText.showBorder
                            ? "Remove border"
                            : "Add border"}
                        </StyleButton>
                      </div>

                      {/* Duplicate and delete */}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isPosting}
                          onClick={() => {
                            const copy = {
                              ...selectedText,
                              id: createId(),
                              x: clamp(selectedText.x + 3, 0, 95),
                              y: clamp(selectedText.y + 3, 0, 95),
                            };

                            setTexts((current) => [
                              ...current,
                              copy,
                            ]);

                            setSelectedTextId(copy.id);
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-white/10 py-2 text-sm disabled:opacity-40"
                        >
                          <IoCopyOutline />
                          Duplicate
                        </button>

                        <button
                          type="button"
                          disabled={isPosting}
                          onClick={() => {
                            setTexts((current) =>
                              current.filter(
                                (item) =>
                                  item.id !== selectedText.id,
                              ),
                            );

                            setSelectedTextId(null);
                          }}
                          className="flex items-center justify-center gap-2 rounded-xl bg-red-500/15 py-2 text-sm text-red-300 disabled:opacity-40"
                        >
                          <IoTrashOutline />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* DRAW TAB */}
              {activeTab === "draw" && (
                <div>
                  <h2 className="font-bold">
                    Draw on your story
                  </h2>

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
                      disabled={!strokes.length || isPosting}
                      onClick={() =>
                        setStrokes((current) =>
                          current.slice(0, -1),
                        )
                      }
                      className="rounded-xl bg-white/10 py-2 text-sm disabled:opacity-30"
                    >
                      Undo
                    </button>

                    <button
                      type="button"
                      disabled={!strokes.length || isPosting}
                      onClick={() => setStrokes([])}
                      className="rounded-xl bg-red-500/15 py-2 text-sm text-red-300 disabled:opacity-30"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* STORY METADATA */}
            <div className="mt-5 space-y-4 border-t border-white/10 pt-5">

              {/* Caption */}
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
                    setCaption(
                      event.target.value.slice(0, 500),
                    )
                  }
                  rows={3}
                  maxLength={500}
                  disabled={isPosting}
                  placeholder="Write something about this story…"
                  className="w-full resize-none rounded-2xl border border-red-950 bg-black/40 p-3 text-sm outline-none placeholder:text-zinc-600 focus:border-red-500 disabled:opacity-50"
                />
              </label>

              {/* Mentions */}
              <div className="relative">
                <label className="block">
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <IoAt className="text-red-400" />
                    Mention people

                    <span className="ml-auto text-xs font-normal text-zinc-500">
                      {mentionedUsers.length}/10
                    </span>
                  </span>

                  <input
                    value={mentionQuery}
                    onChange={(event) =>
                      setMentionQuery(event.target.value)
                    }
                    disabled={
                      isPosting ||
                      mentionedUsers.length >= 10
                    }
                    placeholder={
                      mentionedUsers.length >= 10
                        ? "Mention limit reached"
                        : "Search username"
                    }
                    className="w-full rounded-xl border border-red-950 bg-black/50 p-3 text-sm outline-none focus:border-red-500 disabled:opacity-50"
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
                          {user.username?.[0]?.toUpperCase() || "?"}
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
                        disabled={isPosting}
                        className="rounded-full border border-red-800 bg-red-950/70 px-2.5 py-1 text-xs text-red-200 disabled:opacity-40"
                      >
                        @{user.username} ×
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-2 text-[11px] leading-4 text-zinc-600">
                  Mentions are inserted into the selected text
                  layer, or into the caption when no text is selected.
                </p>
              </div>

              {/* Story duration */}
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm font-bold">
                  <IoTimeOutline className="text-red-400" />

                  Story duration

                  <span className="ml-auto text-red-300">
                    {duration}s
                  </span>
                </span>

                <input
                  type="range"
                  min="5"
                  max="60"
                  step="5"
                  value={duration}
                  onChange={(event) =>
                    setDuration(Number(event.target.value))
                  }
                  disabled={isPosting}
                  className="w-full accent-red-500 disabled:opacity-50"
                />

                <span className="mt-1 flex justify-between text-[10px] text-zinc-600">
                  <span>5 sec</span>
                  <span>60 sec</span>
                </span>
              </label>

              {/* Mission */}
              <label className="block">
                <span className="mb-2 block text-sm font-bold">
                  Local mission
                </span>

                <select
                  value={missionId}
                  onChange={(event) =>
                    setMissionId(event.target.value)
                  }
                  disabled={isPosting}
                  className="w-full rounded-xl border border-white/10 bg-black/50 p-3 text-sm disabled:opacity-50"
                >
                  <option value="">No mission</option>

                  {missions.map((mission) => (
                    <option
                      key={mission._id}
                      value={mission._id}
                    >
                      {mission.title}
                    </option>
                  ))}
                </select>
              </label>

              {/* Location */}
              <div className="flex gap-3 rounded-2xl border border-red-900/60 bg-red-950/30 p-3">
                <IoLocationOutline className="mt-0.5 shrink-0 text-red-300" />

                <p className="text-xs leading-5 text-zinc-400">
                  {selectedLocation
                    ? "A location is selected for this story."
                    : "Location is requested only when you share. It helps place this story on the globe."}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Upload progress */}
      <UploadProgressModal
        visible={showProgress}
        progress={progress}
      />
    </main>
  );
}

// RANGE COMPONENT
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
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
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
        className="w-full accent-red-500"
      />
    </label>
  );
}

// COLOR INPUT COMPONENT
function ColorInput({ label, value, onChange }) {
  return (
    <label className="block text-xs text-zinc-400">
      <span className="mb-2 block">{label}</span>

      <span className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-1">
        <input
          type="color"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="h-8 w-9 cursor-pointer border-0 bg-transparent"
        />

        <span className="truncate text-[10px] uppercase">
          {value}
        </span>
      </span>
    </label>
  );
}

// STYLE BUTTON COMPONENT
function StyleButton({
  label,
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`grid h-10 place-items-center rounded-xl border text-sm transition ${
        active
          ? "border-red-400 bg-red-600 text-white"
          : "border-red-950 bg-black/30 text-zinc-400 hover:border-red-800 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}