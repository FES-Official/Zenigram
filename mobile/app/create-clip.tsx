import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  deleteUploadedMedia,
  uploadPickedVideo,
  type UploadedVideo,
} from "@/lib/nativeUpload";
import { colors } from "@/theme/colors";

const TOPICS = [
  ["technology", "Technology"], ["education", "Education"], ["gaming", "Gaming"],
  ["travel", "Travel"], ["sports", "Sports"], ["art", "Art & Design"],
  ["food", "Food"], ["fashion", "Fashion"], ["news", "News"],
  ["entertainment", "Entertainment"], ["fitness", "Fitness"],
] as const;

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, instance => {
    instance.loop = true;
    instance.muted = true;
    instance.play();
  });

  return (
    <View className="overflow-hidden rounded-3xl" style={{ height: 390, backgroundColor: "#090609" }}>
      <VideoView
        player={player}
        contentFit="contain"
        nativeControls
        style={{ width: "100%", height: "100%" }}
      />
    </View>
  );
}

export default function CreateClipScreen() {
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [closeOnesOnly, setCloseOnesOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function pickVideo() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo-library access in your device settings to choose a video.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsEditing: false,
        allowsMultipleSelection: false,
        videoMaxDuration: 120,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        quality: 1,
        exif: false,
      });

      if (result.canceled) return;
      const selected = result.assets[0];
      if (!selected || selected.type !== "video") {
        setError("Choose a video file to create a clip.");
        return;
      }
      if (selected.duration == null || selected.duration <= 0) {
        setError("Zenigram could not read this video's duration. Choose another video.");
        return;
      }
      if (selected.duration > 120000) {
        setError("Clips can be up to 2 minutes long. Trim your video and select it again.");
        return;
      }
      setAsset(selected);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  }

  function toggleTopic(id: string) {
    setTopics(current => current.includes(id)
      ? current.filter(topic => topic !== id)
      : current.length < 5 ? [...current, id] : current);
  }

  async function publishClip() {
    if (busy) return;
    if (!asset) {
      setError("Choose a video before publishing.");
      return;
    }
    if (!caption.trim()) {
      setError("Write a caption for your clip.");
      return;
    }

    const duration = Math.min(120, Math.max(0.5, Number(asset.duration || 0) / 1000));
    if (!Number.isFinite(duration) || duration <= 0) {
      setError("The video's duration could not be read.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setError("");
    let uploaded: UploadedVideo | null = null;

    try {
      uploaded = await uploadPickedVideo(asset, percent => setProgress(Math.min(99, percent)));

      await api.post("/api/clips", {
        caption: caption.trim(),
        topics,
        mediaItems: [uploaded],
        timeline: [{ duration, trimStart: 0, filter: "none" }],
        textLayers: [],
        transition: "fade",
        closeOnesOnly,
      });

      setProgress(100);
      router.replace("/(tabs)/clips");
    } catch (caught) {
      if (uploaded?.key) {
        try {
          await deleteUploadedMedia([uploaded.key]);
        } catch {
          // Preserve the publish error if media cleanup also fails.
        }
      }
      setError(getApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="mb-6 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 h-10 w-10 items-center justify-center rounded-full border"
          style={{ borderColor: colors.line, backgroundColor: colors.panel }}
        >
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>SHORT FORM VIDEO</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Create a clip</Text>
        </View>
      </View>

      <Text className="mb-4 text-sm leading-6" style={{ color: colors.muted }}>
        Pick a video up to 2 minutes. Large videos upload in parallel S3 parts and can be retried without restarting the whole transfer.
      </Text>

      {error ? (
        <View className="mb-4 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
          <Text className="text-sm leading-5" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : null}

      {asset ? (
        <View className="mb-5">
          <VideoPreview uri={asset.uri} />
          <View className="mt-3 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold" numberOfLines={1} style={{ color: colors.text }}>
                {asset.fileName || "Selected video"}
              </Text>
              <Text className="mt-1 text-xs" style={{ color: colors.muted }}>
                {Math.round(Number(asset.duration || 0) / 1000)} sec · {((Number(asset.fileSize || 0) / (1024 * 1024)) || 0).toFixed(1)} MB
              </Text>
            </View>
            <Pressable
              disabled={busy}
              onPress={() => setAsset(null)}
              className="rounded-full border px-3 py-2"
              style={{ borderColor: colors.line }}
            >
              <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Change</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          disabled={busy}
          onPress={() => void pickVideo()}
          className="mb-5 items-center justify-center rounded-3xl border border-dashed px-6 py-12"
          style={{ borderColor: colors.line, backgroundColor: colors.panel }}
        >
          <View className="h-16 w-16 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.wine }}>
            <MaterialCommunityIcons name="movie-plus-outline" size={32} color={colors.rose} />
          </View>
          <Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Choose a video</Text>
          <Text className="mt-2 text-center text-xs leading-5" style={{ color: colors.muted }}>
            MP4, MOV, or WebM · Up to 2 minutes · Up to 5 GB
          </Text>
        </Pressable>
      )}

      <View className="mb-5 rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Caption</Text>
        <TextInput
          value={caption}
          onChangeText={value => { setCaption(value); if (error) setError(""); }}
          placeholder="Add a caption to your clip..."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          textAlignVertical="top"
          className="min-h-24 text-sm leading-6"
          style={{ color: colors.text }}
        />
        <Text className="mt-2 self-end text-xs" style={{ color: colors.muted }}>{caption.length}/500</Text>
      </View>

      <View className="mb-5">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Topics · optional</Text>
          <Text className="text-xs" style={{ color: colors.muted }}>{topics.length}/5 selected</Text>
        </View>
        <View className="flex-row flex-wrap">
          {TOPICS.map(([id, label]) => {
            const active = topics.includes(id);
            return (
              <Pressable
                key={id}
                disabled={busy || (!active && topics.length >= 5)}
                onPress={() => toggleTopic(id)}
                className="mb-2 mr-2 rounded-full border px-3 py-2"
                style={{ borderColor: active ? colors.crimson : colors.line, backgroundColor: active ? colors.wine : colors.panel }}
              >
                <Text className="text-xs font-semibold" style={{ color: active ? colors.rose : colors.muted }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mb-6 flex-row items-center justify-between rounded-2xl border p-4" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
        <View className="flex-1 pr-3">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>Close Ones audience</Text>
          <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>Limit this clip to your Close Ones.</Text>
        </View>
        <Switch
          value={closeOnesOnly}
          onValueChange={setCloseOnesOnly}
          disabled={busy}
          trackColor={{ false: colors.surface, true: colors.crimson }}
          thumbColor={closeOnesOnly ? colors.rose : colors.muted}
          accessibilityLabel="Share clip with Close Ones only"
        />
      </View>

      {busy ? (
        <View className="mb-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Uploading clip securely</Text>
            <Text className="text-xs font-bold" style={{ color: colors.text }}>{progress}%</Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
            <View className="h-2 rounded-full" style={{ width: String(progress) + "%", backgroundColor: colors.crimson } as never} />
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => void publishClip()}
        disabled={busy || !asset || !caption.trim()}
        accessibilityRole="button"
        accessibilityLabel="Publish clip"
        className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4"
        style={{ backgroundColor: colors.rose, opacity: busy || !asset || !caption.trim() ? 0.55 : 1 }}
      >
        {busy ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="send" size={19} color={colors.background} />}
        <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>
          {busy ? "Publishing..." : "Publish clip"}
        </Text>
      </Pressable>
    </Screen>
  );
}
