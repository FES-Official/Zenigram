import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Platform,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import Constants from "expo-constants";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
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
  mediaUrl?: string;
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

function storyCoordinates(story: GlobeStory) {
  const latitude = Number(story.latitude ?? story.location?.lat);
  const longitude = Number(story.longitude ?? story.location?.lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) return null;
  return { latitude, longitude };
}

function getInitialStoryRegion(stories: GlobeStory[]) {
  const points = stories.map(storyCoordinates).filter(Boolean) as Array<{ latitude: number; longitude: number }>;
  if (!points.length) {
    return { latitude: 18, longitude: 0, latitudeDelta: 110, longitudeDelta: 180 };
  }
  const lats = points.map(point => point.latitude);
  const lngs = points.map(point => point.longitude);
  return {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.min(120, Math.max(0.5, Math.max(...lats) - Math.min(...lats) + 0.8)),
    longitudeDelta: Math.min(160, Math.max(0.5, Math.max(...lngs) - Math.min(...lngs) + 0.8)),
  };
}

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
  const [selectedStory, setSelectedStory] = useState<GlobeStory | null>(null);
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
      if (!append) setSelectedStory(incoming[0] || null);
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

  const region = useMemo(() => getInitialStoryRegion(stories), [stories]);
  const hasAndroidMapsKey = Boolean(Constants.expoConfig?.extra?.mapsConfigured);
  const canShowNativeMap = Platform.OS !== "android" || hasAndroidMapsKey;
  const locatedStories = useMemo(
    () => stories.filter(story => storyCoordinates(story)),
    [stories],
  );

  const mapHeader = (
    <View className="mb-4">
      {canShowNativeMap ? (
        locatedStories.length ? (
          <View className="mb-3 overflow-hidden rounded-3xl border" style={{ height: 300, borderColor: colors.line, backgroundColor: colors.panel }}>
            <MapView
              key={tab + ":" + stories.length}
              style={{ flex: 1 }}
              provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
              initialRegion={region}
              showsCompass
              showsScale
              toolbarEnabled={false}
            >
              {locatedStories.map(story => {
                const coordinate = storyCoordinates(story);
                if (!coordinate) return null;
                return (
                  <Marker
                    key={story._id}
                    coordinate={coordinate}
                    title={story.userId?.fullname || story.userId?.username || "Zenigram creator"}
                    description={story.caption || "Open story"}
                    pinColor="#B82E50"
                    onPress={() => setSelectedStory(story)}
                    onCalloutPress={() => router.push("/story/" + encodeURIComponent(story._id))}
                  />
                );
              })}
            </MapView>
            <View className="absolute left-3 top-3 rounded-full px-3 py-2" style={{ backgroundColor: "rgba(18,8,13,0.82)" }} pointerEvents="none">
              <Text className="text-xs font-bold" style={{ color: "#FFFFFF" }}>
                {locatedStories.length} location {locatedStories.length === 1 ? "pin" : "pins"}
              </Text>
            </View>
          </View>
        ) : (
          <View className="mb-3 items-center justify-center rounded-3xl border px-6 py-8" style={{ height: 190, borderColor: colors.line, backgroundColor: colors.panel }}>
            <MaterialCommunityIcons name="earth" size={40} color={colors.rose} />
            <Text className="mt-3 text-base font-bold" style={{ color: colors.text }}>The globe is quiet right now</Text>
            <Text className="mt-2 text-center text-xs leading-5" style={{ color: colors.muted }}>
              Stories with location coordinates will appear as pins here.
            </Text>
          </View>
        )
      ) : (
        <View className="mb-3 rounded-3xl border p-4" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <View className="flex-row items-center">
            <MaterialCommunityIcons name="map-alert-outline" size={22} color={colors.rose} />
            <Text className="ml-2 text-sm font-bold" style={{ color: colors.text }}>Android map key required</Text>
          </View>
          <Text className="mt-2 text-xs leading-5" style={{ color: colors.muted }}>
            Add ANDROID_GOOGLE_MAPS_API_KEY to the native build environment to enable Google Maps tiles. The story list remains available below.
          </Text>
        </View>
      )}

      {selectedStory ? (
        <Pressable
          onPress={() => router.push("/story/" + encodeURIComponent(selectedStory._id))}
          className="mb-4 flex-row items-center rounded-2xl border p-3"
          style={{ borderColor: colors.crimson, backgroundColor: colors.wine }}
        >
          {selectedStory.mediaUrl ? <Image source={{ uri: selectedStory.mediaUrl }} className="h-12 w-12 rounded-xl" /> : null}
          <View className="ml-3 flex-1">
            <Text className="text-xs font-bold" style={{ color: colors.rose }}>
              {selectedStory.userId?.fullname || selectedStory.userId?.username || "Story"}
            </Text>
            <Text className="mt-1 text-xs" numberOfLines={1} style={{ color: "#FFFFFF" }}>
              {selectedStory.caption || "Open this story"}
            </Text>
          </View>
          <MaterialCommunityIcons name="arrow-up-right" size={19} color={colors.rose} />
        </Pressable>
      ) : null}

      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Recent moments</Text>
        <Text className="text-xs" style={{ color: colors.muted }}>{stories.length} stories</Text>
      </View>
    </View>
  );

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
          ListHeaderComponent={mapHeader}
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
