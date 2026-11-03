import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type GlobeTab = "all" | "trending" | "close" | "supporting";
type GlobeStory = {
  _id: string;
  caption?: string;
  createdAt?: string;
  expiresAt?: string;
  latitude?: number;
  longitude?: number;
  location?: { lat?: number; lng?: number; label?: string; name?: string };
  userId?: { _id?: string; username?: string; fullname?: string; profilePic?: string; ishidden?: boolean };
};
type GlobeResponse = {
  success?: boolean;
  stories?: GlobeStory[];
  nextCursor?: string | null;
  hasMore?: boolean;
  tab?: GlobeTab;
};

const TABS: Array<{ id: GlobeTab; title: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }> = [
  { id: "all", title: "All", icon: "earth" },
  { id: "trending", title: "Trending", icon: "fire" },
  { id: "close", title: "Close Ones", icon: "heart-multiple" },
  { id: "supporting", title: "Supporting", icon: "account-heart" },
];

function StoryCard({ story }: { story: GlobeStory }) {
  const username = story.userId?.username || "zenigram_user";
  const coordinates = Number.isFinite(story.latitude) && Number.isFinite(story.longitude)
    ? Number(story.latitude).toFixed(2) + "°, " + Number(story.longitude).toFixed(2) + "°"
    : "";
  const title = story.userId?.fullname || username;
  const age = story.createdAt ? new Date(story.createdAt).toLocaleString() : "Recent story";

  return (
    <Pressable
      onPress={() => router.push("/story/" + encodeURIComponent(story._id))}
      className="mb-3 overflow-hidden rounded-3xl border p-4"
      style={{ backgroundColor: colors.panel, borderColor: colors.line }}
    >
      <View className="flex-row items-center">
        {story.userId?.profilePic ? (
          <Image source={{ uri: story.userId.profilePic }} className="h-12 w-12 rounded-full" />
        ) : (
          <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
            <Text className="text-lg font-bold" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View className="ml-3 flex-1">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>{title}</Text>
          <Text className="mt-0.5 text-xs" style={{ color: colors.muted }}>@{username} · {age}</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={21} color={colors.muted} />
      </View>
      {story.caption ? (
        <Text className="mt-3 text-sm leading-5" numberOfLines={2} style={{ color: colors.text }}>{story.caption}</Text>
      ) : null}
      {coordinates ? (
        <View className="mt-3 flex-row items-center">
          <MaterialCommunityIcons name="map-marker-outline" size={15} color={colors.rose} />
          <Text className="ml-1 text-xs" style={{ color: colors.rose }}>{coordinates}</Text>
          <Text className="ml-2 text-xs" style={{ color: colors.muted }}>Selected coordinates · unverified</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function StoryGlobeScreen() {
  const [tab, setTab] = useState<GlobeTab>("all");
  const [stories, setStories] = useState<GlobeStory[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (nextTab: GlobeTab, refresh = false, append = false, pageCursor: string | null = null) => {
    if (append) setLoadingMore(true);
    else if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const params: Record<string, string | number> = { tab: nextTab, limit: 40 };
      if (append && pageCursor) params.cursor = pageCursor;
      const { data } = await api.get<GlobeResponse>("/api/story-globe", { params });
      const incoming = Array.isArray(data.stories) ? data.stories : [];
      setStories(current => append ? [...current, ...incoming] : incoming);
      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore && data.nextCursor));
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(tab);
      return undefined;
    }, [load, tab]),
  );

  function selectTab(nextTab: GlobeTab) {
    if (nextTab === tab) return;
    setTab(nextTab);
    setStories([]);
    setCursor(null);
    setHasMore(false);
    setLoading(true);
    void load(nextTab);
  }

  return (
    <Screen scroll={false}>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>AROUND THE WORLD</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Stories Globe</Text>
        </View>
        <Pressable onPress={() => router.push("/story/create")} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }} accessibilityLabel="Create a story">
          <MaterialCommunityIcons name="plus" size={21} color={colors.rose} />
        </Pressable>
      </View>

      <Text className="mb-4 text-xs leading-5" style={{ color: colors.muted }}>
        Discover recent moments shared by creators. Locations shown here are user-selected coordinates and are not independently verified.
      </Text>

      <View className="mb-4 flex-row flex-wrap">
        {TABS.map(item => {
          const active = tab === item.id;
          return (
            <Pressable key={item.id} onPress={() => selectTab(item.id)} className="mb-2 mr-2 flex-row items-center rounded-full border px-3 py-2" style={{ borderColor: active ? colors.crimson : colors.line, backgroundColor: active ? colors.wine : colors.panel }}>
              <MaterialCommunityIcons name={item.icon} size={15} color={active ? colors.rose : colors.muted} />
              <Text className="ml-1.5 text-xs font-semibold" style={{ color: active ? colors.rose : colors.muted }}>{item.title}</Text>
            </Pressable>
          );
        })}
      </View>

      {error ? (
        <View className="mb-3 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
          <Text className="text-xs leading-5" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : null}

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.rose} size="large" />
          <Text className="mt-3 text-xs" style={{ color: colors.muted }}>Loading stories...</Text>
        </View>
      ) : (
        <FlatList
          data={stories}
          keyExtractor={item => item._id}
          renderItem={({ item }) => <StoryCard story={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(tab, true)} tintColor={colors.rose} />}
          onEndReached={() => {
            if (hasMore && cursor && !loadingMore) void load(tab, false, true, cursor);
          }}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View className="items-center rounded-3xl border px-6 py-12" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
              <MaterialCommunityIcons name="earth" size={44} color={colors.muted} />
              <Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>No stories here yet</Text>
              <Text className="mt-2 text-center text-xs leading-5" style={{ color: colors.muted }}>
                Try another tab or add a moment to Stories Globe.
              </Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator className="py-4" color={colors.rose} /> : null}
          contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Screen>
  );
}
