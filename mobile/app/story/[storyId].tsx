import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ImageBackground,
  Pressable,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type Story = {
  _id: string;
  caption?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  createdAt?: string;
  expiresAt?: string;
  likesCount?: number;
  viewsCount?: number;
  viewerLiked?: boolean;
  viewerIsOwner?: boolean;
  userId?: { _id?: string; username?: string; fullname?: string; profilePic?: string };
};
type StoryResponse = { success?: boolean; story?: Story };
type EngagementResponse = { success?: boolean; viewerLiked?: boolean; likesCount?: number; viewsCount?: number };

export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{ storyId: string }>();
  const storyId = Array.isArray(params.storyId) ? params.storyId[0] : params.storyId || "";
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [likeBusy, setLikeBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<StoryResponse>("/api/stories/" + encodeURIComponent(storyId));
      if (!data.story) throw new Error("Story not found.");
      setStory(data.story);
      void api.post<EngagementResponse>("/api/stories/" + encodeURIComponent(storyId) + "/engagement", {
        action: "view",
      }).then(result => {
        setStory(current => current ? { ...current, viewsCount: result.data.viewsCount ?? current.viewsCount } : current);
      }).catch(() => {});
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [storyId]);

  useEffect(() => { void load(); }, [load]);

  async function toggleLike() {
    if (likeBusy || !story) return;
    setLikeBusy(true);
    try {
      const { data } = await api.post<EngagementResponse>(
        "/api/stories/" + encodeURIComponent(storyId) + "/engagement",
        { action: "like" },
      );
      setStory(current => current ? {
        ...current,
        viewerLiked: Boolean(data.viewerLiked),
        likesCount: data.likesCount ?? current.likesCount,
      } : current);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLikeBusy(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View className="flex-1 overflow-hidden rounded-3xl" style={{ backgroundColor: "#090609" }}>
        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.rose} />
            <Text className="mt-3 text-sm" style={{ color: colors.muted }}>Opening story...</Text>
          </View>
        ) : story?.mediaUrl ? (
          <ImageBackground source={{ uri: story.mediaUrl }} resizeMode="cover" className="flex-1 justify-between">
            <View className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.2)" }} />
            <View className="p-4">
              <View className="mb-4 h-1 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.3)" }}>
                <View className="h-1 w-full rounded-full" style={{ backgroundColor: "#FFFFFF" }} />
              </View>
              <View className="flex-row items-center">
                {story.userId?.profilePic ? (
                  <ImageBackground source={{ uri: story.userId.profilePic }} className="h-10 w-10 overflow-hidden rounded-full" />
                ) : (
                  <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                    <Text className="font-bold" style={{ color: colors.rose }}>{(story.userId?.username || "z").slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <View className="ml-3 flex-1">
                  <Text className="text-sm font-bold" style={{ color: "#FFFFFF" }}>{story.userId?.fullname || story.userId?.username || "Zenigram creator"}</Text>
                  <Text className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.8)" }}>@{story.userId?.username || "zenigram_user"}</Text>
                </View>
                <Pressable onPress={() => router.back()} className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} accessibilityLabel="Close story">
                  <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
                </Pressable>
              </View>
            </View>
            <View className="p-4">
              {story.caption ? <Text className="mb-4 text-base leading-6" style={{ color: "#FFFFFF" }}>{story.caption}</Text> : null}
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <MaterialCommunityIcons name="eye-outline" size={17} color="#FFFFFF" />
                  <Text className="ml-1 text-xs" style={{ color: "#FFFFFF" }}>{Number(story.viewsCount || 0).toLocaleString()} views</Text>
                </View>
                <View className="flex-row items-center">
                  <Pressable onPress={() => router.push("/story/" + encodeURIComponent(storyId) + "/comments")} className="mr-4 h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.4)" }} accessibilityLabel="Open story comments">
                    <MaterialCommunityIcons name="message-outline" size={22} color="#FFFFFF" />
                  </Pressable>
                  <Pressable onPress={() => void toggleLike()} disabled={likeBusy} className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: story.viewerLiked ? colors.wine : "rgba(0,0,0,0.4)" }} accessibilityLabel={story.viewerLiked ? "Unlike story" : "Like story"}>
                    {likeBusy ? <ActivityIndicator color="#FFFFFF" /> : <MaterialCommunityIcons name={story.viewerLiked ? "heart" : "heart-outline"} size={23} color={story.viewerLiked ? colors.rose : "#FFFFFF"} />}
                  </Pressable>
                </View>
              </View>
              <Text className="mt-2 self-end text-xs" style={{ color: "#FFFFFF" }}>{Number(story.likesCount || 0).toLocaleString()} likes</Text>
            </View>
          </ImageBackground>
        ) : (
          <View className="flex-1 items-center justify-center px-6">
            <MaterialCommunityIcons name="image-off-outline" size={42} color={colors.muted} />
            <Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Story unavailable</Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.muted }}>{error || "This story may have expired or is no longer available."}</Text>
            <Pressable onPress={() => router.back()} className="mt-4 rounded-full px-4 py-2" style={{ backgroundColor: colors.wine }}>
              <Text className="font-semibold" style={{ color: colors.rose }}>Go back</Text>
            </Pressable>
          </View>
        )}
        {error && story ? <Text className="absolute bottom-20 left-4 right-4 text-xs" style={{ color: "#FFFFFF" }}>{error}</Text> : null}
      </View>
    </Screen>
  );
}
