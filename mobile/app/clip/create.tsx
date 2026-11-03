import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
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
  ["food", "Food"], ["fashion", "Fashion"], ["entertainment", "Entertainment"],
  ["fitness", "Fitness"],
] as const;

export default function CreateClipScreen() {
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [closeOnesOnly, setCloseOnesOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  const player = useVideoPlayer(null, instance => {
    instance.loop = true;
    instance.muted = false;
  });

  useEffect(() => {
    if (asset?.uri) {
      player.replace(asset.uri);
      player.play();
    } else {
      player.pause();
      player.replace(null);
    }
  }, [asset?.uri, player]);

  async function chooseVideo() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo and video access in your device settings.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        quality: 1,
        exif: false,
      });
      if (!result.canceled) {
        const chosen = result.assets[0];
        if (chosen.type !== "video") {
          setError("Choose a video file to create a clip.");
          return;
        }
        if (chosen.duration && chosen.duration > 120000) {
          setError("This clip is longer than 2 minutes. Video trimming is part of the next editor pass.");
          return;
        }
        if (chosen.fileSize && chosen.fileSize > 200 * 1024 * 1024) {
          setError("This version supports video files up to 200 MB.");
          return;
        }
        setAsset(chosen);
      }
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  }

  function toggleTopic(id: string) {
    setTopics(current => current.includes(id)
      ? current.filter(item => item !== id)
      : current.length < 5 ? [...current, id] : current);
  }

  async function publish() {
    if (!asset || busy) {
      if (!asset) setError("Choose a video first.");
      return;
    }
    if (!caption.trim()) {
      setError("Add a caption before publishing your clip.");
      return;
    }

    const duration = Math.max(1, Math.min(120, Math.round(Number(asset.duration || 5000) / 1000)));
    setBusy(true);
    setProgress(0);
    setError("");
    let uploaded: UploadedVideo | null = null;

    try {
      uploaded = await uploadPickedVideo(asset, setProgress);
      await api.post("/api/clips", {
        caption: caption.trim(),
        mediaItems: [uploaded],
        timeline: [{ duration, trimStart: 0, filter: "none" }],
        duration,
        topics,
        closeOnesOnly,
        transition: "cut",
      });
      router.replace("/(tabs)/clips");
    } catch (caught) {
      if (uploaded?.key) {
        await deleteUploadedMedia([uploaded.key]).catch(() => {});
      }
      setError(getApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>CREATE SOMETHING SHORT</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>New clip</Text>
        </View>
      </View>

      {error ? <View className="mb-4 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}><Text className="text-sm leading-5" style={{ color: colors.danger }}>{error}</Text></View> : null}

      {asset ? (
        <View className="mb-5 overflow-hidden rounded-3xl" style={{ aspectRatio: 9 / 16, maxHeight: 460, backgroundColor: "#090609" }}>
          <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />
          <Pressable onPress={() => { if (busy) return; setAsset(null); }} disabled={busy} className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(18,8,13,0.8)" }} accessibilityLabel="Remove selected video">
            <MaterialCommunityIcons name="close" size={19} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={() => void chooseVideo()}
          disabled={busy}
          className="mb-5 items-center justify-center rounded-3xl border border-dashed px-6 py-14"
          style={{ backgroundColor: colors.panel, borderColor: colors.line }}
        >
          <MaterialCommunityIcons name="video-plus-outline" size={48} color={colors.rose} />
          <Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Choose a video</Text>
          <Text className="mt-2 text-center text-xs leading-5" style={{ color: colors.muted }}>Select an MP4, MOV or WebM video up to 2 minutes and 200 MB.</Text>
        </Pressable>
      )}

      {asset ? (
        <View className="mb-5 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <Text className="text-xs font-semibold" style={{ color: colors.rose }}>
            {Math.round(Number(asset.duration || 0) / 1000)} sec · {asset.fileSize ? (asset.fileSize / (1024 * 1024)).toFixed(1) + " MB" : "Video selected"}
          </Text>
          <Pressable onPress={() => void chooseVideo()} disabled={busy} className="mt-2 self-start">
            <Text className="text-xs font-semibold" style={{ color: colors.muted }}>Choose another video</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="mb-5 rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Clip caption</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a caption..."
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
        <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Topics · optional</Text>
        <View className="flex-row flex-wrap">
          {TOPICS.map(([id, label]) => {
            const active = topics.includes(id);
            return (
              <Pressable key={id} disabled={busy || (!active && topics.length >= 5)} onPress={() => toggleTopic(id)} className="mb-2 mr-2 rounded-full border px-3 py-2" style={{ borderColor: active ? colors.crimson : colors.line, backgroundColor: active ? colors.wine : colors.panel }}>
                <Text className="text-xs font-semibold" style={{ color: active ? colors.rose : colors.muted }}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="mb-6 flex-row items-center justify-between rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <View className="flex-1 pr-3">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>Close Ones audience</Text>
          <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>Only allow your Close Ones audience to view this clip.</Text>
        </View>
        <Pressable onPress={() => setCloseOnesOnly(value => !value)} disabled={busy} className="h-9 w-14 justify-center rounded-full px-1" style={{ backgroundColor: closeOnesOnly ? colors.crimson : colors.surface }}>
          <View className="h-7 w-7 rounded-full" style={{ alignSelf: closeOnesOnly ? "flex-end" : "flex-start", backgroundColor: closeOnesOnly ? colors.rose : colors.muted }} />
        </Pressable>
      </View>

      {busy ? (
        <View className="mb-3">
          <View className="mb-2 flex-row justify-between">
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Uploading clip to private storage</Text>
            <Text className="text-xs font-bold" style={{ color: colors.text }}>{progress}%</Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
            <View className="h-2 rounded-full" style={{ width: String(progress) + "%" as any, backgroundColor: colors.crimson }} />
          </View>
        </View>
      ) : null}

      <Pressable onPress={() => void publish()} disabled={!asset || !caption.trim() || busy} className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{ backgroundColor: colors.rose, opacity: !asset || !caption.trim() || busy ? 0.45 : 1 }}>
        {busy ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="send" size={19} color={colors.background} />}
        <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>{busy ? "Publishing..." : "Publish clip"}</Text>
      </Pressable>
      <Text className="mb-6 text-xs leading-5" style={{ color: colors.muted }}>
        This first native clip publisher uploads one video asset. Trimming, multi-asset timelines, filters and animated text layers are still on the migration roadmap.
      </Text>
    </Screen>
  );
}
