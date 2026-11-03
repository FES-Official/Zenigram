import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { getStoredUser, type MobileUser } from "@/lib/session";
import { colors } from "@/theme/colors";

type StoryUser = {
  _id: string;
  username?: string;
  fullname?: string;
  profilePic?: string;
};

type StoryItem = {
  _id: string;
  mediaUrl?: string;
  createdAt?: string;
  expiresAt?: string;
  userId?: StoryUser;
};

type StoriesResponse = {
  stories?: StoryItem[];
};

export function StoryStrip() {
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [viewer, setViewer] = useState<MobileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [storedUser, response] = await Promise.all([
        getStoredUser(),
        api.get<StoriesResponse>("/api/story-upload?tab=all&limit=80"),
      ]);
      setViewer(storedUser);
      setStories(Array.isArray(response.data?.stories) ? response.data.stories : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return undefined;
    }, [load]),
  );

  const latestByCreator = useMemo(() => {
    const map = new Map<string, StoryItem>();
    for (const story of stories) {
      const id = String(story.userId?._id || "");
      if (id && !map.has(id)) map.set(id, story);
    }
    return [...map.values()];
  }, [stories]);

  const myStory = latestByCreator.find(item => String(item.userId?._id) === String(viewer?.id));
  const otherStories = latestByCreator.filter(item => String(item.userId?._id) !== String(viewer?.id));

  return (
    <View className="mb-5">
      <View className="mb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>
            MOMENTS AROUND YOU
          </Text>
          <Text className="mt-1 text-lg font-black" style={{ color: colors.text }}>Stories</Text>
        </View>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.push("/story-globe")}
            accessibilityRole="button"
            accessibilityLabel="Open Stories Globe"
            className="mr-2 h-9 w-9 items-center justify-center rounded-full border"
            style={{ borderColor: colors.line, backgroundColor: colors.panel }}
          >
            <MaterialCommunityIcons name="earth" size={19} color={colors.rose} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/story/create")}
            accessibilityRole="button"
            accessibilityLabel="Create a story"
            className="flex-row items-center rounded-full px-3 py-2"
            style={{ backgroundColor: colors.wine }}
          >
            <MaterialCommunityIcons name="plus" size={16} color={colors.rose} />
            <Text className="ml-1 text-xs font-bold" style={{ color: colors.rose }}>Add story</Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View className="h-24 items-center justify-center">
          <ActivityIndicator size="small" color={colors.rose} />
        </View>
      ) : failed ? (
        <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <Text className="text-xs" style={{ color: colors.muted }}>Stories could not be loaded. Pull down to refresh the feed.</Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10 }}>
          {myStory ? (
            <Pressable onPress={() => router.push("/story/" + encodeURIComponent(myStory._id))} className="mr-4 w-16 items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full border-2 p-1" style={{ borderColor: colors.rose }}>
                {viewer?.profilePic ? (
                  <Image source={{ uri: viewer.profilePic }} className="h-full w-full rounded-full" />
                ) : (
                  <View className="h-full w-full items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                    <Text className="text-xl font-black" style={{ color: colors.rose }}>{(viewer?.username || "Z").slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
              </View>
              <Text className="mt-2 text-xs font-semibold" numberOfLines={1} style={{ color: colors.text }}>Your story</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => router.push("/story/create")} className="mr-4 w-16 items-center">
              <View className="h-16 w-16 items-center justify-center rounded-full border-2 border-dashed" style={{ borderColor: colors.crimson, backgroundColor: colors.panel }}>
                <MaterialCommunityIcons name="plus" size={25} color={colors.rose} />
              </View>
              <Text className="mt-2 text-xs" numberOfLines={1} style={{ color: colors.muted }}>Your story</Text>
            </Pressable>
          )}

          {otherStories.map(story => {
            const user = story.userId;
            const username = user?.username || "creator";
            return (
              <Pressable
                key={story._id}
                onPress={() => router.push("/story/" + encodeURIComponent(story._id))}
                className="mr-4 w-16 items-center"
              >
                <View className="h-16 w-16 items-center justify-center rounded-full border-2 p-1" style={{ borderColor: colors.crimson }}>
                  {user?.profilePic ? (
                    <Image source={{ uri: user.profilePic }} className="h-full w-full rounded-full" />
                  ) : (
                    <View className="h-full w-full items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                      <Text className="text-xl font-black" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <Text className="mt-2 text-xs" numberOfLines={1} style={{ color: colors.text }}>
                  {username}
                </Text>
              </Pressable>
            );
          })}
          {!latestByCreator.length ? (
            <View className="ml-1 justify-center">
              <Text className="text-xs" style={{ color: colors.muted }}>Be the first to share a moment.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
