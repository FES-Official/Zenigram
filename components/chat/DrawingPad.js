"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PenTool,
  Pencil,
  Highlighter,
  Brush,
  SprayCan,
  Sparkles,
  Eraser,
} from "lucide-react";

const CANVAS_BACKGROUND = "#111111";
const MAX_HISTORY = 25;

const COLORS = [
  "#ffffff",
  "#000000",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#78716c",
];

const BRUSHES = [
  { id: "pen", label: "Pen", icon: PenTool },
  { id: "pencil", label: "Pencil", icon: Pencil },
  { id: "marker", label: "Marker", icon: Highlighter },
  { id: "calligraphy", label: "Calligraphy", icon: Brush },
  { id: "spray", label: "Spray", icon: SprayCan },
  { id: "neon", label: "Neon", icon: Sparkles },
  { id: "eraser", label: "Eraser", icon: Eraser },
];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function distanceBetween(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function forEachPointBetween(from, to, spacing, callback) {
  const distance = distanceBetween(from, to);

  if (distance === 0) {
    callback(from, 0);
    return;
  }

  const steps = Math.max(1, Math.ceil(distance / spacing));

  for (let index = 0; index <= steps; index += 1) {
    const progress = index / steps;

    callback(
      {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      },
      progress,
    );
  }
}

function strokeLine(
  context,
  from,
  to,
  {
    color,
    width,
    alpha = 1,
    lineCap = "round",
    shadowBlur = 0,
    shadowColor = color,
  },
) {
  context.save();

  context.globalCompositeOperation = "source-over";
  context.globalAlpha = alpha;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = lineCap;
  context.lineJoin = "round";
  context.shadowBlur = shadowBlur;
  context.shadowColor = shadowColor;
  context.setLineDash([]);

  if (distanceBetween(from, to) < 0.1) {
    context.beginPath();
    context.arc(from.x, from.y, width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  context.restore();
}

export default function DrawingPad({ onCancel, onSend }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const hasDrawnRef = useRef(false);

  const historyRef = useRef([]);
  const historyIndexRef = useRef(-1);

  const [color, setColor] = useState(COLORS[1]);
  const [size, setSize] = useState(6);
  const [brush, setBrush] = useState("pen");
  const [showColorPad, setShowColorPad] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");

  const [historyState, setHistoryState] = useState({
    index: -1,
    length: 0,
  });

  const updateHistoryState = useCallback(() => {
    setHistoryState({
      index: historyIndexRef.current,
      length: historyRef.current.length,
    });
  }, []);

  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {
      willReadFrequently: true,
    });

    if (!canvas || !context) return;

    let nextHistory = historyRef.current.slice(0, historyIndexRef.current + 1);

    nextHistory.push(context.getImageData(0, 0, canvas.width, canvas.height));

    if (nextHistory.length > MAX_HISTORY) {
      nextHistory = nextHistory.slice(-MAX_HISTORY);
    }

    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;

    updateHistoryState();
  }, [updateHistoryState]);

  const fillCanvasBackground = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context) return;

    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = CANVAS_BACKGROUND;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {
      willReadFrequently: true,
    });

    if (!canvas || !context) return;

    fillCanvasBackground();

    context.lineCap = "round";
    context.lineJoin = "round";

    historyRef.current = [];
    historyIndexRef.current = -1;

    saveSnapshot();
  }, [fillCanvasBackground, saveSnapshot]);

  const getCanvasPoint = useCallback((event) => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const bounds = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }, []);

  const drawBrushSegment = useCallback(
    (from, to, pressure = 1) => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!canvas || !context) return;

      const adjustedSize = size * pressure;

      switch (brush) {
        case "pencil": {
          strokeLine(context, from, to, {
            color,
            width: Math.max(0.8, adjustedSize * 0.35),
            alpha: 0.8,
          });

          context.save();
          context.fillStyle = color;
          context.globalAlpha = 0.15;

          forEachPointBetween(from, to, 4, (currentPoint) => {
            for (let index = 0; index < 2; index += 1) {
              const jitter = adjustedSize * 0.35;
              const x = currentPoint.x + (Math.random() - 0.5) * jitter;
              const y = currentPoint.y + (Math.random() - 0.5) * jitter;

              context.beginPath();
              context.arc(
                x,
                y,
                Math.max(0.4, adjustedSize * 0.08),
                0,
                Math.PI * 2,
              );
              context.fill();
            }
          });

          context.restore();
          break;
        }

        case "marker": {
          strokeLine(context, from, to, {
            color,
            width: adjustedSize * 2.4,
            alpha: 0.28,
          });
          break;
        }

        case "calligraphy": {
          context.save();
          context.fillStyle = color;
          context.globalAlpha = 1;

          forEachPointBetween(
            from,
            to,
            Math.max(1, adjustedSize * 0.25),
            (currentPoint) => {
              context.beginPath();
              context.ellipse(
                currentPoint.x,
                currentPoint.y,
                adjustedSize * 0.85,
                Math.max(1, adjustedSize * 0.22),
                -Math.PI / 4,
                0,
                Math.PI * 2,
              );
              context.fill();
            },
          );

          context.restore();
          break;
        }

        case "spray": {
          const spread = adjustedSize * 2;
          const density = clamp(Math.round(adjustedSize * 1.5), 10, 70);

          context.save();
          context.fillStyle = color;
          context.globalAlpha = 0.65;

          forEachPointBetween(
            from,
            to,
            Math.max(2, adjustedSize * 0.45),
            (currentPoint) => {
              for (let index = 0; index < density; index += 1) {
                const angle = Math.random() * Math.PI * 2;
                const radius = Math.sqrt(Math.random()) * spread;

                const x = currentPoint.x + Math.cos(angle) * radius;
                const y = currentPoint.y + Math.sin(angle) * radius;
                const particleSize = Math.random() * 1.5 + 0.5;

                context.fillRect(x, y, particleSize, particleSize);
              }
            },
          );

          context.restore();
          break;
        }

        case "neon": {
          strokeLine(context, from, to, {
            color,
            width: adjustedSize * 1.4,
            alpha: 0.4,
            shadowBlur: adjustedSize * 2.5,
            shadowColor: color,
          });

          strokeLine(context, from, to, {
            color,
            width: Math.max(1, adjustedSize * 0.45),
            alpha: 1,
            shadowBlur: adjustedSize,
            shadowColor: color,
          });
          break;
        }

        case "eraser": {
          strokeLine(context, from, to, {
            color: CANVAS_BACKGROUND,
            width: adjustedSize * 2.5,
          });
          break;
        }

        case "pen":
        default: {
          strokeLine(context, from, to, {
            color,
            width: adjustedSize,
          });
        }
      }
    },
    [brush, color, size],
  );

  const startDrawing = useCallback(
    (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();
      setError("");

      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        canvas.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture may not be available in older browsers.
      }

      const nextPoint = getCanvasPoint(event);
      const pressure =
        event.pointerType === "pen" && event.pressure > 0
          ? clamp(0.6 + event.pressure, 0.6, 1.5)
          : 1;

      drawingRef.current = true;
      lastPointRef.current = nextPoint;
      hasDrawnRef.current = true;

      // Draws a dot when the user only clicks or taps.
      drawBrushSegment(nextPoint, nextPoint, pressure);
    },
    [drawBrushSegment, getCanvasPoint],
  );

  const continueDrawing = useCallback(
    (event) => {
      if (!drawingRef.current || !lastPointRef.current) return;

      event.preventDefault();

      const nextPoint = getCanvasPoint(event);
      const pressure =
        event.pointerType === "pen" && event.pressure > 0
          ? clamp(0.6 + event.pressure, 0.6, 1.5)
          : 1;

      drawBrushSegment(lastPointRef.current, nextPoint, pressure);

      lastPointRef.current = nextPoint;
      hasDrawnRef.current = true;
    },
    [drawBrushSegment, getCanvasPoint],
  );

  const stopDrawing = useCallback(
    (event) => {
      if (!drawingRef.current) return;

      drawingRef.current = false;
      lastPointRef.current = null;

      const canvas = canvasRef.current;

      if (
        canvas &&
        event?.pointerId !== undefined &&
        canvas.hasPointerCapture?.(event.pointerId)
      ) {
        canvas.releasePointerCapture(event.pointerId);
      }

      if (hasDrawnRef.current) {
        saveSnapshot();
      }

      hasDrawnRef.current = false;
    },
    [saveSnapshot],
  );

  const clearCanvas = useCallback(() => {
    fillCanvasBackground();
    saveSnapshot();
    setError("");
  }, [fillCanvasBackground, saveSnapshot]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;

    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    historyIndexRef.current -= 1;

    context.putImageData(historyRef.current[historyIndexRef.current], 0, 0);

    updateHistoryState();
  }, [updateHistoryState]);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) {
      return;
    }

    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    historyIndexRef.current += 1;

    context.putImageData(historyRef.current[historyIndexRef.current], 0, 0);

    updateHistoryState();
  }, [updateHistoryState]);

  useEffect(() => {
    function handleKeyboardShortcut(event) {
      if (event.key === "Escape") {
        onCancel?.();
        return;
      }

      const element = event.target;
      const isFormField =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement;

      if (isFormField) return;

      const commandPressed = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (commandPressed && key === "z") {
        event.preventDefault();

        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (commandPressed && key === "y") {
        event.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleKeyboardShortcut);

    return () => {
      window.removeEventListener("keydown", handleKeyboardShortcut);
    };
  }, [onCancel, redo, undo]);

  const selectColor = useCallback((nextColor) => {
    setColor(nextColor);

    // Automatically return to the pen after choosing a color.
    setBrush((currentBrush) =>
      currentBrush === "eraser" ? "pen" : currentBrush,
    );
  }, []);

  const sendDrawing = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      setError("The drawing canvas is unavailable.");
      return;
    }

    if (typeof onSend !== "function") {
      setError("No drawing upload handler was provided.");
      return;
    }

    setError("");
    setIsSending(true);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setError("The drawing could not be exported.");
          setIsSending(false);
          return;
        }

        const file = new File([blob], `drawing-${Date.now()}.png`, {
          type: "image/png",
        });

        try {
          await Promise.resolve(onSend(file));
        } catch (sendError) {
          console.error("Unable to send drawing:", sendError);
          setError("The drawing could not be added. Please try again.");
        } finally {
          setIsSending(false);
        }
      },
      "image/png",
      1,
    );
  }, [onSend]);

  const canUndo = historyState.index > 0;
  const canRedo =
    historyState.index >= 0 && historyState.index < historyState.length - 1;

  return (
    <div
      className="fixed inset-0 z-80 grid place-items-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawing-pad-title"
    >
      <div className="w-full max-w-3xl rounded-2xl border border-white/10 bg-zinc-950 p-4 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 id="drawing-pad-title" className="font-semibold">
              Drawing pad
            </h2>

            <p className="text-xs text-white/50">
              Choose a brush, color, and size.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
              title="Undo (Ctrl/Cmd + Z)"
            >
              Undo
            </button>

            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
              title="Redo (Ctrl/Cmd + Shift + Z)"
            >
              Redo
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {BRUSHES.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-pressed={brush === item.id}
                title={item.label}
                onClick={() => setBrush(item.id)}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition ${
                  brush === item.id
                    ? "border-white bg-white text-black"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon size={19} strokeWidth={2} />
              </button>
            );
          })}
        </div>

        <div className="relative mb-3 flex flex-wrap items-center gap-2">
          {/* Quick colors */}
          {COLORS.slice(0, 6).map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Use color ${item}`}
              aria-pressed={color === item}
              onClick={() => selectColor(item)}
              className={`h-8 w-8 rounded-full border-2 transition hover:scale-110 ${
                color === item && brush !== "eraser"
                  ? "border-white ring-2 ring-white/30"
                  : "border-white/10"
              }`}
              style={{ backgroundColor: item }}
            />
          ))}

          {/* Open color pad */}
          <button
            type="button"
            onClick={() => setShowColorPad((current) => !current)}
            aria-label="Open color palette"
            title="More colors"
            className="flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <span
              className="h-5 w-5 rounded-full border border-white/20"
              style={{ backgroundColor: color }}
            />

            <span>Colors</span>
          </button>

          {/* Native custom color picker */}
          <label
            title="Pick custom color"
            className="relative flex h-8 cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            <span
              className="h-5 w-5 rounded-full border border-white/20"
              style={{ backgroundColor: color }}
            />

            <span>Custom</span>

            <input
              type="color"
              value={color}
              onChange={(event) => selectColor(event.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Choose custom color"
            />
          </label>

          {/* Brush size */}
          <label className="ml-auto flex min-w-48 items-center gap-3 text-xs text-white/60">
            <span className="whitespace-nowrap">Size: {size}px</span>

            <input
              type="range"
              min="2"
              max="40"
              step="1"
              value={size}
              onChange={(event) => setSize(Number(event.target.value))}
              className="w-full accent-red-500"
            />
          </label>

          {/* Expanded color pad */}
          {showColorPad && (
            <div className="absolute left-0 top-11 z-20 w-64 rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-2xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-white/70">
                  Choose color
                </span>

                <button
                  type="button"
                  onClick={() => setShowColorPad(false)}
                  className="text-xs text-white/40 transition hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-label={`Use color ${item}`}
                    aria-pressed={color === item}
                    onClick={() => {
                      selectColor(item);
                      setShowColorPad(false);
                    }}
                    className={`aspect-square rounded-lg border-2 transition hover:scale-110 ${
                      color === item && brush !== "eraser"
                        ? "border-white ring-2 ring-white/30"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: item }}
                  />
                ))}
              </div>

              <div className="mt-3 border-t border-white/10 pt-3">
                <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70 transition hover:bg-white/10">
                  <span>Custom color</span>

                  <span
                    className="h-6 w-6 rounded-full border border-white/20"
                    style={{ backgroundColor: color }}
                  />

                  <input
                    type="color"
                    value={color}
                    onChange={(event) => selectColor(event.target.value)}
                    className="absolute h-0 w-0 opacity-0"
                    aria-label="Choose custom color"
                  />
                </label>

                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="h-8 w-8 shrink-0 rounded-lg border border-white/10"
                    style={{ backgroundColor: color }}
                  />

                  <input
                    type="text"
                    value={color}
                    onChange={(event) => {
                      const value = event.target.value;

                      if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                        selectColor(value);
                      }
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs uppercase text-white outline-none focus:border-white/30"
                    aria-label="Hex color"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <canvas
          ref={canvasRef}
          width={900}
          height={600}
          onPointerDown={startDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onContextMenu={(event) => event.preventDefault()}
          className="aspect-3/2 w-full touch-none cursor-crosshair rounded-xl border border-white/10 bg-zinc-900"
          aria-label="Drawing canvas"
        />

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={clearCanvas}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20"
          >
            Clear
          </button>

          <button
            type="button"
            onClick={() => onCancel?.()}
            disabled={isSending}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm transition hover:bg-white/20 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={sendDrawing}
            disabled={isSending}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSending ? "Adding..." : "Add drawing"}
          </button>
        </div>
      </div>
    </div>
  );
}
