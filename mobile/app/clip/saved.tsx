import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type SavedClip = {
  _id: string;
  caption?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  mediaItems?: Array<{ url?: string; type?: "image" | "video" }>;
  duration?: number;
  savedAt?: string | number;
  user?: { username?: string; fullname?: string };
};
type SavedResponse = { success?: boolean; clips?: SavedClip[] };

export default function SavedClipsScreen() {
  const [clips, setClips] = useState<SavedClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<SavedResponse>("/api/clips/saved");
      setClips(Array.isArray(data.clips) ? data.clips : []);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  async function remove(clip: SavedClip) {
    if (busyId) return;
    setBusyId(clip._id);
    setError("");
    try {
      await api.patch("/api/clips/" + encodeURIComponent(clip._id), { action: "save" });
      setClips(current => current.filter(item => item._id !== clip._id));
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen scroll={false}>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>YOUR LIBRARY</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Saved clips</Text>
        </View>
        <Text className="text-sm font-semibold" style={{ color: colors.muted }}>{clips.length}</Text>
      </View>

      {error ? <Text className="mb-3 rounded-xl p-3 text-xs" style={{ backgroundColor: colors.panel, color: colors.danger }}>{error}</Text> : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.rose} />
          <Text className="mt-3 text-xs" style={{ color: colors.muted }}>Loading saved clips...</Text>
        </View>
      ) : (
        <FlatList
          data={clips}
          keyExtractor={item => item._id}
          numColumns={2}
          columnWrapperStyle={{ justifyContent: "space-between" }}
          contentContainerStyle={{ paddingBottom: 28, flexGrow: clips.length ? 0 : 1 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const media = item.mediaItems?.[0];
            const imageUrl = media?.type === "image" ? media.url : item.mediaType === "image" ? item.mediaUrl : "";
            const creator = item.user?.fullname || item.user?.username || "Zenigram creator";
            return (
              <View className="mb-3 overflow-hidden rounded-2xl border" style={{ width: "48.5%", backgroundColor: colors.panel, borderColor: colors.line }}>
                <View className="relative" style={{ aspectRatio: 0.78, backgroundColor: colors.surface }}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} resizeMode="cover" className="h-full w-full" />
                  ) : (
                    <View className="h-full w-full items-center justify-center">
                      <MaterialCommunityIcons name="play-circle-outline" size={42} color={colors.rose} />
                      <Text className="mt-2 text-xs" style={{ color: colors.muted }}>Video clip</Text>
                    </View>
                  )}
                  <View className="absolute bottom-2 left-2 rounded-full px-2 py-1" style={{ backgroundColor: "rgba(12,6,9,0.78)" }}>
                    <Text className="text-xs font-bold" style={{ color: "#FFFFFF" }}>{Math.round(Number(item.duration || 0))} sec</Text>
                  </View>
                </View>
                <View className="p-3">
                  <Text className="text-xs font-bold" numberOfLines={1} style={{ color: colors.text }}>{creator}</Text>
                  <Text className="mt-1 text-xs leading-4" numberOfLines={2} style={{ color: colors.muted }}>{item.caption || "Saved clip"}</Text>
                  <Pressable
                    disabled={busyId === item._id}
                    onPress={() => void remove(item)}
                    className="mt-3 flex-row items-center justify-center rounded-xl px-2 py-2"
                    style={{ backgroundColor: colors.wine }}
                    accessibilityRole="button"
                    accessibilityLabel="Remove saved clip"
                  >
                    {busyId === item._id ? <ActivityIndicator size="small" color={colors.rose} /> : <MaterialCommunityIcons name="bookmark-remove-outline" size={16} color={colors.rose} />}
                    <Text className="ml-1 text-xs font-bold" style={{ color: colors.rose }}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-8">
              <MaterialCommunityIcons name="bookmark-outline" size={46} color={colors.muted} />
              <Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Nothing saved yet</Text>
              <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>Save clips you want to find again and they will appear here.</Text>
              <Pressable onPress={() => router.replace("/(tabs)/clips")} className="mt-5 rounded-xl px-5 py-3" style={{ backgroundColor: colors.rose }}>
                <Text className="text-sm font-bold" style={{ color: colors.background }}>Explore clips</Text>
              </Pressable>
            </View>
          }
        />
      )}
    </Screen>
  );
}
