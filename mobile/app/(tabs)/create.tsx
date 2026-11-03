import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  deleteUploadedMedia,
  uploadPickedImage,
  type UploadedImage,
} from "@/lib/nativeUpload";
import { colors } from "@/theme/colors";

const MAX_IMAGES = 10;
const TOPICS = [
  ["technology", "Technology"], ["education", "Education"], ["gaming", "Gaming"],
  ["travel", "Travel"], ["sports", "Sports"], ["art", "Art & Design"],
  ["food", "Food"], ["fashion", "Fashion"], ["news", "News"],
  ["entertainment", "Entertainment"], ["fitness", "Fitness"],
] as const;

export default function CreateScreen() {
  const [assets, setAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [closeOnesOnly, setCloseOnesOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const totalSize = useMemo(
    () => assets.reduce((total, asset) => total + Number(asset.fileSize || 0), 0),
    [assets],
  );

  function addAssets(next: ImagePicker.ImagePickerAsset[]) {
    setAssets(current => [...current, ...next].slice(0, MAX_IMAGES));
    setError("");
    setNotice("");
  }

  async function pickPhotos() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo access in your device settings to choose pictures.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES,
        orderedSelection: true,
        quality: 0.88,
        exif: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!result.canceled) addAssets(result.assets);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  }

  async function takePhoto() {
    setError("");
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError("Allow camera access in your device settings to take a photo.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 5],
        quality: 0.88,
        exif: false,
      });
      if (!result.canceled) addAssets(result.assets);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  }

  function toggleTopic(id: string) {
    setTopics(current => current.includes(id)
      ? current.filter(topic => topic !== id)
      : current.length < 5 ? [...current, id] : current);
  }

  async function publishPost() {
    if (busy) return;
    if (!assets.length) {
      setError("Choose at least one photo before publishing.");
      return;
    }
    if (!caption.trim()) {
      setError("Write a caption before publishing.");
      return;
    }

    setBusy(true);
    setProgress(0);
    setError("");
    setNotice("");
    const uploaded: UploadedImage[] = [];

    try {
      for (let index = 0; index < assets.length; index += 1) {
        const image = await uploadPickedImage(assets[index], percent => {
          const overall = Math.round(((index + percent / 100) / assets.length) * 100);
          setProgress(Math.min(99, overall));
        });
        uploaded.push(image);
      }

      await api.post("/api/posts", {
        caption: caption.trim(),
        mediaItems: uploaded,
        presentation: uploaded.length > 1 ? "carousel" : "single",
        topics,
        closeOnesOnly,
        aspectRatio: "portrait",
      });

      setProgress(100);
      setNotice("Your post is live.");
      setAssets([]);
      setCaption("");
      setTopics([]);
      setCloseOnesOnly(false);
      router.replace("/(tabs)");
    } catch (caught) {
      if (uploaded.length) {
        try {
          await deleteUploadedMedia(uploaded.map(item => item.key));
        } catch {
          // Keep the original publish error visible when cleanup also fails.
        }
      }
      setError(getApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View className="mb-6">
        <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>MAKE SOMETHING YOURS</Text>
        <Text className="mt-1 text-3xl font-black" style={{ color: colors.text }}>Create a post</Text>
        <Text className="mt-2 text-sm leading-6" style={{ color: colors.muted }}>
          Share a moment with your circle or the wider Zenigram community.
        </Text>
      </View>

      {error ? (
        <View className="mb-4 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
          <Text className="text-sm leading-5" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : null}
      {notice ? <Text className="mb-3 text-sm font-semibold" style={{ color: colors.success }}>{notice}</Text> : null}

      <View className="mb-5 flex-row">
        <Pressable
          disabled={busy || assets.length >= MAX_IMAGES}
          onPress={() => void pickPhotos()}
          className="mr-2 flex-1 flex-row items-center justify-center rounded-2xl border px-3 py-4"
          style={{ backgroundColor: colors.panel, borderColor: colors.line, opacity: busy || assets.length >= MAX_IMAGES ? 0.45 : 1 }}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={20} color={colors.rose} />
          <Text className="ml-2 text-sm font-bold" style={{ color: colors.text }}>Choose photos</Text>
        </Pressable>
        <Pressable
          disabled={busy || assets.length >= MAX_IMAGES}
          onPress={() => void takePhoto()}
          className="flex-1 flex-row items-center justify-center rounded-2xl px-3 py-4"
          style={{ backgroundColor: colors.wine, opacity: busy || assets.length >= MAX_IMAGES ? 0.45 : 1 }}
        >
          <MaterialCommunityIcons name="camera-outline" size={20} color={colors.rose} />
          <Text className="ml-2 text-sm font-bold" style={{ color: colors.rose }}>Take photo</Text>
        </Pressable>
      </View>

      {assets.length ? (
        <View className="mb-5">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>
              Selected photos · {assets.length}/{MAX_IMAGES}
            </Text>
            <Text className="text-xs" style={{ color: colors.muted }}>
              {totalSize ? (totalSize / (1024 * 1024)).toFixed(1) + " MB" : ""}
            </Text>
          </View>
          <View className="flex-row flex-wrap">
            {assets.map((asset, index) => (
              <View key={asset.assetId || asset.uri + index} className="mb-2 mr-2 overflow-hidden rounded-2xl" style={{ width: "31%", aspectRatio: 0.82, backgroundColor: colors.surface }}>
                <Image source={{ uri: asset.uri }} resizeMode="cover" className="h-full w-full" />
                <View className="absolute left-2 top-2 rounded-full px-2 py-1" style={{ backgroundColor: "rgba(19,9,13,0.8)" }}>
                  <Text className="text-xs font-bold" style={{ color: colors.text }}>{index + 1}</Text>
                </View>
                <Pressable
                  disabled={busy}
                  onPress={() => setAssets(current => current.filter((_, itemIndex) => itemIndex !== index))}
                  accessibilityRole="button"
                  accessibilityLabel={"Remove photo " + (index + 1)}
                  className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full"
                  style={{ backgroundColor: "rgba(19,9,13,0.85)" }}
                >
                  <MaterialCommunityIcons name="close" size={17} color="#FFFFFF" />
                </Pressable>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View className="mb-5 items-center justify-center rounded-3xl border border-dashed px-6 py-10" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <MaterialCommunityIcons name="image-plus" size={38} color={colors.muted} />
          <Text className="mt-3 text-base font-bold" style={{ color: colors.text }}>Add photos to your post</Text>
          <Text className="mt-2 text-center text-xs leading-5" style={{ color: colors.muted }}>Choose up to 10 photos or take one with your camera.</Text>
        </View>
      )}

      <View className="mb-5 rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Your caption</Text>
        <TextInput
          value={caption}
          onChangeText={value => { setCaption(value); if (error) setError(""); }}
          placeholder="What would you like to share?"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2200}
          textAlignVertical="top"
          className="min-h-28 text-sm leading-6"
          style={{ color: colors.text }}
        />
        <Text className="mt-2 self-end text-xs" style={{ color: colors.muted }}>{caption.length}/2200</Text>
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
          <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>Share this post with your Close Ones audience.</Text>
        </View>
        <Switch
          value={closeOnesOnly}
          onValueChange={setCloseOnesOnly}
          disabled={busy}
          trackColor={{ false: colors.surface, true: colors.crimson }}
          thumbColor={closeOnesOnly ? colors.rose : colors.muted}
          accessibilityLabel="Share with Close Ones only"
        />
      </View>

      {busy ? (
        <View className="mb-3">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Uploading securely to Zenigram</Text>
            <Text className="text-xs font-bold" style={{ color: colors.text }}>{progress}%</Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
            <View className="h-2 rounded-full" style={{ width: String(progress) + "%" as any, backgroundColor: colors.crimson }} />
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => void publishPost()}
        disabled={busy || !assets.length || !caption.trim()}
        accessibilityRole="button"
        accessibilityLabel="Publish post"
        className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4"
        style={{ backgroundColor: busy ? colors.wine : colors.rose, opacity: !assets.length || !caption.trim() ? 0.55 : 1 }}
      >
        {busy ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="send" size={19} color={colors.background} />}
        <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>
          {busy ? "Publishing..." : "Share post"}
        </Text>
      </Pressable>
    </Screen>
  );
}
