const ALLOWED_MEDIA_TYPES = new Set(["image", "video"]);
const ALLOWED_FILTERS = new Set(["none", "cinema", "warm", "cool", "mono", "oslo", "tokyo", "rio"]);
const ALLOWED_TRANSITIONS = new Set(["cut", "fade", "slide", "zoom"]);
const MAX_ITEMS = 10;
const MAX_DURATION = 120;

function bounded(value, fallback, minimum, maximum) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback;
}

export function validateClipForRender(clip, expectedUserId) {
  if (!clip || !clip._id || String(clip.userId) !== String(expectedUserId)) {
    throw new Error("Clip render job does not match its owner");
  }

  const mediaItems = Array.isArray(clip.mediaItems) ? clip.mediaItems : [];
  const timeline = Array.isArray(clip.timeline) ? clip.timeline : [];
  if (!mediaItems.length || mediaItems.length > MAX_ITEMS || timeline.length !== mediaItems.length) {
    throw new Error("Clip timeline and media assets are incomplete");
  }

  let duration = 0;
  const normalizedTimeline = timeline.map((entry, index) => {
    const media = mediaItems[index];
    if (!media || !ALLOWED_MEDIA_TYPES.has(media.type)) {
      throw new Error("Clip contains an unsupported media type");
    }
    const key = String(media.key || "");
    if (!key.startsWith(`media/${expectedUserId}/`) || key.includes("..")) {
      throw new Error("Clip source media is outside its owner's upload folder");
    }
    const segmentDuration = Number(entry?.duration);
    const trimStart = Number(entry?.trimStart || 0);
    if (!Number.isFinite(segmentDuration) || segmentDuration < 0.5 || segmentDuration > MAX_DURATION) {
      throw new Error("Clip contains an invalid scene duration");
    }
    if (!Number.isFinite(trimStart) || trimStart < 0) {
      throw new Error("Clip contains an invalid trim start");
    }
    if (media.type === "image" && trimStart !== 0) {
      throw new Error("Image scenes cannot have a video trim start");
    }
    duration += segmentDuration;
    return {
      mediaIndex: index,
      duration: segmentDuration,
      trimStart,
      filter: ALLOWED_FILTERS.has(String(entry?.filter || "none")) ? String(entry.filter || "none") : "none",
    };
  });

  if (duration < 1 || duration > MAX_DURATION) {
    throw new Error("Rendered clips must be between 1 second and 2 minutes");
  }

  const transition = ALLOWED_TRANSITIONS.has(clip.transition) ? clip.transition : "cut";
  const textLayers = (Array.isArray(clip.textLayers) ? clip.textLayers : [])
    .slice(0, 12)
    .map((layer) => ({
      id: String(layer.id || ""),
      text: String(layer.text || "").slice(0, 180),
      start: Number(layer.start),
      end: Number(layer.end),
      x: bounded(layer.x, 50, 0, 100),
      y: bounded(layer.y, 50, 0, 100),
      size: bounded(layer.size, 32, 14, 72),
      color: /^#[0-9a-f]{6}$/i.test(layer.color) ? layer.color : "#ffffff",
      background: Boolean(layer.background),
      backgroundColor: /^#[0-9a-f]{6}$/i.test(layer.backgroundColor) ? layer.backgroundColor : "#000000",
      showBorder: Boolean(layer.showBorder),
      borderColor: /^#[0-9a-f]{6}$/i.test(layer.borderColor) ? layer.borderColor : "#ffffff",
      borderWidth: bounded(layer.borderWidth, 2, 1, 8),
      italic: Boolean(layer.italic),
      fontWeight: Number(layer.fontWeight) === 400 ? 400 : 700,
    }))
    .filter((layer) =>
      layer.text &&
      Number.isFinite(layer.start) &&
      Number.isFinite(layer.end) &&
      layer.start < duration &&
      layer.end > layer.start,
    );

  return {
    clipId: String(clip._id),
    userId: String(expectedUserId),
    mediaItems,
    timeline: normalizedTimeline,
    textLayers,
    transition,
    duration,
    renderVersion: Math.max(1, Number(clip.renderVersion) || 1),
  };
}

function seconds(value) {
  return Number(value.toFixed(3)).toString();
}

function escapeFilterPath(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

function colorFilter(filter) {
  switch (filter) {
    case "cinema": return "eq=contrast=1.12:saturation=0.9:brightness=-0.02";
    case "warm": return "colorbalance=rs=0.08:gs=0.03:bs=-0.05,eq=saturation=1.08";
    case "cool": return "colorbalance=rs=-0.04:gs=0.01:bs=0.09,eq=saturation=1.04";
    case "mono": return "hue=s=0,eq=contrast=1.12";
    case "oslo": return "eq=brightness=0.04:saturation=0.82:contrast=0.94";
    case "tokyo": return "eq=brightness=0.025:saturation=1.3:contrast=1.06";
    case "rio": return "eq=saturation=1.45:contrast=1.1";
    default: return "";
  }
}

function transitionName(value) {
  if (value === "slide") return "slideleft";
  if (value === "zoom") return "zoomin";
  return "fade";
}

export function buildClipFilterGraph({
  plan,
  textFilePaths = [],
  hasAudio = [],
  fontRegular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  fontBold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  fontItalic = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf",
  fontBoldItalic = "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf",
}) {
  const chains = [];
  const audioLabels = [];
  const videoLabels = [];
  const sceneStarts = [];
  let timelineCursor = 0;

  for (let index = 0; index < plan.timeline.length; index += 1) {
    const item = plan.timeline[index];
    const media = plan.mediaItems[index];
    if (index > 0) {
      const previousDuration = plan.timeline[index - 1].duration;
      const currentDuration = item.duration;
      const overlap = plan.transition === "cut"
        ? 0
        : Math.min(0.35, previousDuration / 3, currentDuration / 3);
      timelineCursor += previousDuration - overlap;
    }
    sceneStarts.push(timelineCursor);
    const duration = item.duration;

    const filters = [
      "setpts=PTS-STARTPTS",
      "scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos",
      "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black",
      "setsar=1",
      "fps=30",
      "settb=AVTB",
      "format=yuv420p",
    ];
    const selectedColorFilter = colorFilter(item.filter);
    if (selectedColorFilter) filters.push(selectedColorFilter);

    for (let layerIndex = 0; layerIndex < plan.textLayers.length; layerIndex += 1) {
      const layer = plan.textLayers[layerIndex];
      const layerStart = Math.max(0, layer.start - timelineCursor);
      const layerEnd = Math.min(duration, layer.end - timelineCursor);
      if (layerEnd <= layerStart) continue;
      const textFile = textFilePaths[layerIndex];
      if (!textFile) continue;

      const font = layer.italic
        ? (layer.fontWeight === 700 ? fontBoldItalic : fontItalic)
        : (layer.fontWeight === 700 ? fontBold : fontRegular);
      const draw = [
        "drawtext",
        `fontfile=${escapeFilterPath(font)}`,
        `textfile=${escapeFilterPath(textFile)}`,
        "expansion=none",
        "text_shaping=1",
        `fontsize=${Math.round(layer.size * 3)}`,
        `fontcolor=${layer.color}`,
        `x=(w-text_w)*${seconds(layer.x / 100)}`,
        `y=(h-text_h)*${seconds(layer.y / 100)}`,
        `enable='between(t,${seconds(layerStart)},${seconds(layerEnd)})'`,
      ];
      if (layer.background) {
        draw.push("box=1", `boxcolor=${layer.backgroundColor}@0.78`, "boxborderw=12");
      } else {
        draw.push("box=0");
      }
      if (layer.showBorder) {
        draw.push(`borderw=${Math.round(layer.borderWidth * 2)}`, `bordercolor=${layer.borderColor}`);
      }
      filters.push(draw.join(":"));
    }

    const videoLabel = `v${index}`;
    chains.push(`[${index}:v]${filters.join(",")}[${videoLabel}]`);
    videoLabels.push(videoLabel);

    const audioLabel = `a${index}`;
    if (media.type === "video" && hasAudio[index]) {
      chains.push(`[${index}:a]atrim=duration=${seconds(duration)},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad,atrim=duration=${seconds(duration)}[${audioLabel}]`);
    } else {
      chains.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${seconds(duration)}[${audioLabel}]`);
    }
    audioLabels.push(audioLabel);
  }

  const overlapFor = (left, right) => Math.min(0.35, left / 3, right / 3);
  let outputDuration = plan.timeline[0].duration;
  let currentVideo = videoLabels[0];
  let currentAudio = audioLabels[0];

  if (plan.timeline.length === 1) {
    chains.push(`[${currentVideo}]null[vout]`);
    chains.push(`[${currentAudio}]anull[aout]`);
  } else if (plan.transition === "cut") {
    chains.push(`${videoLabels.map((label) => `[${label}]`).join("")}concat=n=${videoLabels.length}:v=1:a=0[vout]`);
    chains.push(`${audioLabels.map((label) => `[${label}]`).join("")}concat=n=${audioLabels.length}:v=0:a=1[aout]`);
    outputDuration = plan.duration;
  } else {
    for (let index = 1; index < plan.timeline.length; index += 1) {
      const overlap = overlapFor(plan.timeline[index - 1].duration, plan.timeline[index].duration);
      const nextVideo = `vx${index}`;
      const nextAudio = `ax${index}`;
      const offset = Math.max(0, outputDuration - overlap);
      chains.push(`[${currentVideo}][${videoLabels[index]}]xfade=transition=${transitionName(plan.transition)}:duration=${seconds(overlap)}:offset=${seconds(offset)}[${nextVideo}]`);
      chains.push(`[${currentAudio}][${audioLabels[index]}]acrossfade=d=${seconds(overlap)}:c1=tri:c2=tri[${nextAudio}]`);
      currentVideo = nextVideo;
      currentAudio = nextAudio;
      outputDuration += plan.timeline[index].duration - overlap;
    }
    chains.push(`[${currentVideo}]null[vout]`);
    chains.push(`[${currentAudio}]anull[aout]`);
  }

  return {
    filterComplex: chains.join(";"),
    outputDuration,
    sceneStarts,
  };
}

export function buildFfmpegInputArgs(plan, localFiles) {
  const args = [];
  for (let index = 0; index < plan.mediaItems.length; index += 1) {
    const media = plan.mediaItems[index];
    const timeline = plan.timeline[index];
    if (media.type === "image") {
      args.push("-loop", "1", "-framerate", "30", "-t", seconds(timeline.duration), "-i", localFiles[index]);
    } else {
      args.push("-ss", seconds(timeline.trimStart), "-t", seconds(timeline.duration), "-i", localFiles[index]);
    }
  }
  return args;
}
