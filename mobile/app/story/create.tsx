import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { deleteUploadedMedia, uploadPickedImage, type UploadedImage } from "@/lib/nativeUpload";
import { colors } from "@/theme/colors";

type StoryLocation = { lat: number; lng: number };

export default function CreateStoryScreen() {
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState<StoryLocation | null>(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function choosePhoto() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo access in your device settings to choose a story image.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [9, 16],
        quality: 0.9,
        exif: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!result.canceled) setAsset(result.assets[0] || null);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  }

  async function addCurrentLocation() {
    setLocationBusy(true);
    setError("");
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setError("Location permission is needed to place a story on Stories Globe. You can enable it in device settings.");
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation({
        lat: Number(position.coords.latitude.toFixed(6)),
        lng: Number(position.coords.longitude.toFixed(6)),
      });
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLocationBusy(false);
    }
  }

  async function publish() {
    if (publishing) return;
    if (!asset) {
      setError("Choose an image for your story.");
      return;
    }
    if (!location) {
      setError("Add your current location before publishing this story.");
      return;
    }

    setPublishing(true);
    setProgress(0);
    setError("");
    let uploaded: UploadedImage | null = null;

    try {
      uploaded = await uploadPickedImage(asset, setProgress);
      const { data } = await api.post<{ story?: { _id?: string } }>("/api/story-upload", {
        mediaKey: uploaded.key,
        mediaType: "image",
        caption: caption.trim().slice(0, 500),
        location,
        duration: 15,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (!data?.story?._id) throw new Error("Zenigram did not confirm the story creation.");
      router.replace("/story/" + encodeURIComponent(data.story._id));
    } catch (caught) {
      if (uploaded?.key) await deleteUploadedMedia([uploaded.key]).catch(() => {});
      setError(getApiErrorMessage(caught));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <Screen>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>A MOMENT FROM HERE</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Create a story</Text>
        </View>
      </View>

      {error ? <View className="mb-4 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}><Text className="text-sm leading-5" style={{ color: colors.danger }}>{error}</Text></View> : null}

      {asset ? (
        <View className="mb-5 overflow-hidden rounded-3xl" style={{ aspectRatio: 9 / 16, maxHeight: 500, backgroundColor: colors.surface }}>
          <Image source={{ uri: asset.uri }} resizeMode="cover" className="h-full w-full" />
          <Pressable onPress={() => setAsset(null)} disabled={publishing} className="absolute right-3 top-3 h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(18,8,13,0.8)" }} accessibilityLabel="Remove selected image">
            <MaterialCommunityIcons name="close" size={19} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => void choosePhoto()} disabled={publishing} className="mb-5 items-center justify-center rounded-3xl border border-dashed px-6 py-14" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <MaterialCommunityIcons name="image-plus" size={46} color={colors.rose} />
          <Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Choose a story image</Text>
          <Text className="mt-2 text-center text-xs leading-5" style={{ color: colors.muted }}>A vertical image works best for the story viewer.</Text>
        </Pressable>
      )}

      <View className="mb-5 rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Caption · optional</Text>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Add a thought to this moment..."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          textAlignVertical="top"
          className="min-h-20 text-sm leading-6"
          style={{ color: colors.text }}
        />
        <Text className="mt-2 self-end text-xs" style={{ color: colors.muted }}>{caption.length}/500</Text>
      </View>

      <View className="mb-6 rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <View className="flex-row items-center">
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
            <MaterialCommunityIcons name="map-marker" size={20} color={colors.rose} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-bold" style={{ color: colors.text }}>Stories Globe location</Text>
            <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>
              {location ? "Current coordinates added · not independently verified" : "Location is not added yet."}
            </Text>
          </View>
          {location ? <MaterialCommunityIcons name="check-circle" size={21} color={colors.success} /> : null}
        </View>
        <Pressable onPress={() => void addCurrentLocation()} disabled={locationBusy || publishing} className="mt-4 flex-row items-center justify-center rounded-xl border px-3 py-3" style={{ borderColor: colors.line }}>
          {locationBusy ? <ActivityIndicator color={colors.rose} /> : <MaterialCommunityIcons name="crosshairs-gps" size={18} color={colors.rose} />}
          <Text className="ml-2 text-sm font-semibold" style={{ color: colors.rose }}>{location ? "Refresh current location" : "Add current location"}</Text>
        </Pressable>
        {location ? (
          <Pressable onPress={() => setLocation(null)} disabled={publishing} className="mt-3 self-center">
            <Text className="text-xs font-semibold" style={{ color: colors.muted }}>Remove location</Text>
          </Pressable>
        ) : null}
        <Text className="mt-3 text-xs leading-5" style={{ color: colors.muted }}>
          Your story is placed on Stories Globe using the coordinates you approve. The server marks this location as unverified; do not add it when you do not want to share where the moment was captured.
        </Text>
      </View>

      {publishing ? (
        <View className="mb-3">
          <View className="mb-2 flex-row justify-between">
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Uploading story securely</Text>
            <Text className="text-xs font-bold" style={{ color: colors.text }}>{progress}%</Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
            <View className="h-2 rounded-full" style={{ width: String(progress) + "%" as any, backgroundColor: colors.crimson }} />
          </View>
        </View>
      ) : null}

      <Pressable onPress={() => void publish()} disabled={!asset || !location || publishing} className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{ backgroundColor: colors.rose, opacity: !asset || !location || publishing ? 0.45 : 1 }}>
        {publishing ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="send" size={19} color={colors.background} />}
        <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>{publishing ? "Publishing..." : "Share story"}</Text>
      </Pressable>
    </Screen>
  );
}
