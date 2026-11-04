import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type RenderStatus = "queued" | "rendering" | "ready" | "failed";
type RenderResponse = {
  success?: boolean;
  status?: RenderStatus;
  progress?: number;
  error?: string;
  renderedMediaUrl?: string;
  duration?: number;
  updatedAt?: string;
};

function RenderedPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, instance => {
    instance.loop = true;
    instance.muted = false;
  });
  return (
    <View className="mb-5 overflow-hidden rounded-3xl" style={{ aspectRatio: 9 / 16, maxHeight: 520, backgroundColor: "#080508" }}>
      <VideoView player={player} contentFit="contain" nativeControls style={{ width: "100%", height: "100%" }} />
    </View>
  );
}

function statusLabel(status: RenderStatus | "") {
  if (status === "queued") return "Waiting in render queue";
  if (status === "rendering") return "Creating your finished clip";
  if (status === "ready") return "Your clip is ready";
  if (status === "failed") return "Rendering needs attention";
  return "Checking render status";
}

export default function ClipRenderingScreen() {
  const params = useLocalSearchParams<{ clipId?: string | string[] }>();
  const clipId = Array.isArray(params.clipId) ? params.clipId[0] : params.clipId;
  const [status, setStatus] = useState<RenderStatus | "">("");
  const [progress, setProgress] = useState(0);
  const [renderedUrl, setRenderedUrl] = useState("");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [retrying, setRetrying] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!clipId) {
      setRequestError("This render link is missing its clip ID.");
      return;
    }
    try {
      const { data } = await api.get<RenderResponse>(
        "/api/clips/" + encodeURIComponent(clipId) + "/render",
      );
      const nextStatus = data.status || "";
      setStatus(nextStatus);
      setProgress(Math.max(0, Math.min(100, Number(data.progress || 0))));
      setRenderedUrl(data.renderedMediaUrl || "");
      setDuration(Number(data.duration || 0));
      setError(data.error || "");
      setRequestError("");
    } catch (caught) {
      setRequestError(getApiErrorMessage(caught));
    }
  }, [clipId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!clipId || status === "ready" || status === "failed") return;
    const timer = setInterval(() => { void loadStatus(); }, 2500);
    return () => clearInterval(timer);
  }, [clipId, status, loadStatus]);

  const retry = useCallback(async () => {
    if (!clipId || retrying) return;
    setRetrying(true);
    setRequestError("");
    try {
      const { data } = await api.post<RenderResponse>(
        "/api/clips/" + encodeURIComponent(clipId) + "/render",
      );
      setStatus(data.status || "queued");
      setProgress(0);
      setError("");
      await loadStatus();
    } catch (caught) {
      setRequestError(getApiErrorMessage(caught));
    } finally {
      setRetrying(false);
    }
  }, [clipId, retrying, loadStatus]);

  return (
    <Screen>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>ZENIGRAM STUDIO</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Clip rendering</Text>
        </View>
      </View>

      {status === "ready" ? (
        <>
          <View className="mb-5 items-center rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <MaterialCommunityIcons name="check-circle" size={48} color={colors.success} />
            <Text className="mt-3 text-xl font-black" style={{ color: colors.text }}>Your clip is ready</Text>
            <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>
              The edited video has been rendered and saved. Your original uploads remain unchanged.
            </Text>
            {duration > 0 ? <Text className="mt-2 text-xs font-semibold" style={{ color: colors.rose }}>{duration.toFixed(1)} seconds · 1080 × 1920</Text> : null}
          </View>
          {renderedUrl ? <RenderedPreview uri={renderedUrl} /> : null}
          <Pressable onPress={() => router.replace("/(tabs)/clips")} className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{ backgroundColor: colors.rose }}>
            <MaterialCommunityIcons name="play-box-multiple" size={19} color={colors.background} />
            <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>Open Clips</Text>
          </Pressable>
        </>
      ) : status === "failed" ? (
        <View className="rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
          <MaterialCommunityIcons name="alert-circle-outline" size={42} color={colors.danger} />
          <Text className="mt-3 text-xl font-black" style={{ color: colors.text }}>We could not render this clip</Text>
          <Text className="mt-2 text-sm leading-6" style={{ color: colors.muted }}>{error || "The render worker reported a problem."}</Text>
          {requestError ? <Text className="mt-3 text-xs leading-5" style={{ color: colors.danger }}>{requestError}</Text> : null}
          <Pressable onPress={() => void retry()} disabled={retrying} className="mt-5 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{ backgroundColor: colors.rose, opacity: retrying ? 0.55 : 1 }}>
            {retrying ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="refresh" size={19} color={colors.background} />}
            <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>{retrying ? "Queuing retry..." : "Retry rendering"}</Text>
          </Pressable>
        </View>
      ) : (
        <View className="rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <View className="items-center">
            <ActivityIndicator color={colors.rose} size="large" />
            <Text className="mt-4 text-center text-xl font-black" style={{ color: colors.text }}>{statusLabel(status)}</Text>
            <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>
              Your scenes are being combined, trimmed and styled into one finished video. You can stay here while it renders.
            </Text>
          </View>
          <View className="mt-6">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-xs font-semibold" style={{ color: colors.muted }}>Render progress</Text>
              <Text className="text-xs font-black" style={{ color: colors.rose }}>{progress}%</Text>
            </View>
            <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
              <View className="h-2 rounded-full" style={{ width: (progress + "%") as `${number}%`, backgroundColor: colors.crimson }} />
            </View>
          </View>
          {requestError ? <Text className="mt-4 text-xs leading-5" style={{ color: colors.danger }}>{requestError}</Text> : null}
          <Pressable onPress={() => void loadStatus()} className="mt-5 self-center rounded-full border px-4 py-2" style={{ borderColor: colors.line }}>
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Refresh status</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
