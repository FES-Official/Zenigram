import { useCallback, useEffect, useRef, useState } from "react";
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
import { VideoView, useVideoPlayer } from "expo-video";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type ClipMedia = { url?: string; type?: "image" | "video" };
type Clip = {
  _id: string;
  caption?: string;
  duration?: number;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  mediaItems?: ClipMedia[];
  likesCount?: number;
  viewsCount?: number;
  shares?: number;
  commentsCount?: number;
  viewerLiked?: boolean;
  viewerSaved?: boolean;
  viewerPreference?: "interested" | "not_interested" | null;
  user?: { username?: string; fullname?: string; profilePic?: string };
};
type ClipsResponse = { success?: boolean; clips?: Clip[] };
type ClipActionResponse = {
  success?: boolean;
  liked?: boolean;
  likesCount?: number;
  viewsCount?: number;
  shares?: number;
  saved?: boolean;
  preference?: "interested" | "not_interested";
};

function ClipCard({
  clip,
  active,
  height,
  busy,
  onAction,
  onViewed,
  onComment,
}: {
  clip: Clip;
  active: boolean;
  height: number;
  busy: boolean;
  onAction: (action: "like" | "save" | "interested" | "not_interested") => void;
  onViewed: () => void;
  onComment: () => void;
}) {
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const media = clip.mediaItems?.find(item => item.type === "video") || clip.mediaItems?.[0];
  const videoUrl = media?.type === "video" ? media.url : clip.mediaType === "video" ? clip.mediaUrl : "";
  const imageUrl = media?.type === "image" ? media.url : clip.mediaType === "image" ? clip.mediaUrl : "";
  const player = useVideoPlayer(videoUrl || null, instance => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    if (active) {
      onViewed();
      if (videoUrl) {
        player.muted = muted;
        player.play();
        setPlaying(true);
      }
      return;
    }

    if (videoUrl) player.pause();
    setPlaying(false);
  }, [active, muted, onViewed, player, videoUrl]);

  function togglePlayback() {
    if (player.playing) {
      player.pause();
      setPlaying(false);
    } else {
      player.play();
      setPlaying(true);
    }
  }

  function toggleMuted() {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  }

  return (
    <View className="overflow-hidden rounded-3xl" style={{ height, backgroundColor: "#090609" }}>
      {videoUrl ? (
        <VideoView
          player={player}
          style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
          contentFit="cover"
          nativeControls={false}
          surfaceType="textureView"
        />
      ) : imageUrl ? (
        <Image source={{ uri: imageUrl }} resizeMode="cover" className="absolute h-full w-full" />
      ) : (
        <View className="absolute inset-0 items-center justify-center" style={{ backgroundColor: colors.surface }}>
          <MaterialCommunityIcons name="movie-open-remove-outline" size={42} color={colors.muted} />
          <Text className="mt-2 text-sm" style={{ color: colors.muted }}>Media unavailable</Text>
        </View>
      )}

      <View className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.16)" }} pointerEvents="none" />

      {videoUrl ? (
        <Pressable
          onPress={togglePlayback}
          accessibilityRole="button"
          accessibilityLabel={playing ? "Pause clip" : "Play clip"}
          className="absolute inset-0 items-center justify-center"
        >
          {!playing ? <MaterialCommunityIcons name="play-circle" size={62} color="#FFFFFF" /> : null}
        </Pressable>
      ) : null}

      <View className="absolute left-4 right-4 top-4 flex-row items-center justify-between">
        <View className="rounded-full px-3 py-2" style={{ backgroundColor: "rgba(18,8,13,0.72)" }}>
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: "#FFFFFF" }}>ZENIGRAM CLIPS</Text>
        </View>
        {videoUrl ? (
          <Pressable onPress={toggleMuted} className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(18,8,13,0.72)" }} accessibilityLabel={muted ? "Unmute clip" : "Mute clip"}>
            <MaterialCommunityIcons name={muted ? "volume-off" : "volume-high"} size={20} color="#FFFFFF" />
          </Pressable>
        ) : null}
      </View>

      <View className="absolute bottom-4 left-4 right-16">
        <View className="mb-2 flex-row items-center">
          <View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
            <Text className="font-bold" style={{ color: colors.rose }}>
              {(clip.user?.username || "z").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <Text className="ml-2 flex-1 text-sm font-bold" numberOfLines={1} style={{ color: "#FFFFFF" }}>
            {clip.user?.fullname || clip.user?.username || "Zenigram creator"}
          </Text>
        </View>
        {clip.caption ? <Text className="text-sm leading-5" numberOfLines={3} style={{ color: "#FFFFFF" }}>{clip.caption}</Text> : null}
        <View className="mt-2 flex-row items-center">
          <MaterialCommunityIcons name="eye-outline" size={15} color="#FFFFFF" />
          <Text className="ml-1 text-xs" style={{ color: "#FFFFFF" }}>{Number(clip.viewsCount || 0).toLocaleString()} views</Text>
          {clip.duration ? <Text className="ml-3 text-xs" style={{ color: "#FFFFFF" }}>{Math.round(clip.duration)} sec</Text> : null}
        </View>
      </View>

      <View className="absolute bottom-5 right-3 items-center">
        <Pressable disabled={busy} onPress={() => onAction("like")} className="mb-4 items-center">
          <MaterialCommunityIcons name={clip.viewerLiked ? "heart" : "heart-outline"} size={29} color={clip.viewerLiked ? colors.rose : "#FFFFFF"} />
          <Text className="mt-1 text-xs font-bold" style={{ color: "#FFFFFF" }}>{Number(clip.likesCount || 0).toLocaleString()}</Text>
        </Pressable>
        <Pressable onPress={onComment} className="mb-4 items-center" accessibilityLabel="Open clip comments">
          <MaterialCommunityIcons name="comment-outline" size={26} color="#FFFFFF" />
          <Text className="mt-1 text-xs" style={{ color: "#FFFFFF" }}>{Number(clip.commentsCount || 0).toLocaleString()}</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => onAction("save")} className="mb-4 items-center">
          <MaterialCommunityIcons name={clip.viewerSaved ? "bookmark" : "bookmark-outline"} size={27} color={clip.viewerSaved ? colors.rose : "#FFFFFF"} />
          <Text className="mt-1 text-xs" style={{ color: "#FFFFFF" }}>Save</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => onAction("interested")} className="mb-4 items-center">
          <MaterialCommunityIcons name="thumb-up-outline" size={25} color={clip.viewerPreference === "interested" ? colors.rose : "#FFFFFF"} />
          <Text className="mt-1 text-xs" style={{ color: "#FFFFFF" }}>More</Text>
        </Pressable>
        <Pressable disabled={busy} onPress={() => onAction("not_interested")} className="items-center">
          <MaterialCommunityIcons name="thumb-down-outline" size={25} color={clip.viewerPreference === "not_interested" ? colors.rose : "#FFFFFF"} />
          <Text className="mt-1 text-xs" style={{ color: "#FFFFFF" }}>Less</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ClipsScreen() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pageHeight, setPageHeight] = useState(560);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyClipId, setBusyClipId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const viewedIds = useRef(new Set<string>());

  const loadClips = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await api.get<ClipsResponse>("/api/clips?limit=40");
      setClips(Array.isArray(data?.clips) ? data.clips : []);
      setActiveIndex(0);
      viewedIds.current.clear();
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadClips();
      return () => setActiveIndex(-1);
    }, [loadClips]),
  );

  const updateClip = useCallback((clipId: string, patch: Partial<Clip>) => {
    setClips(current => current.map(clip => clip._id === clipId ? { ...clip, ...patch } : clip));
  }, []);

  const runAction = useCallback(async (clip: Clip, action: "like" | "save" | "interested" | "not_interested") => {
    if (busyClipId) return;
    setBusyClipId(clip._id);
    setError("");
    try {
      const { data } = await api.patch<ClipActionResponse>("/api/clips/" + encodeURIComponent(clip._id), { action });
      if (action === "like") {
        updateClip(clip._id, { viewerLiked: Boolean(data.liked), likesCount: data.likesCount });
      } else if (action === "save") {
        updateClip(clip._id, { viewerSaved: Boolean(data.saved) });
      } else if (action === "interested" || action === "not_interested") {
        updateClip(clip._id, { viewerPreference: data.preference || action });
        if (action === "not_interested") {
          setClips(current => current.filter(item => item._id !== clip._id));
          setActiveIndex(index => Math.max(0, index - (clips.findIndex(item => item._id === clip._id) < index ? 1 : 0)));
        }
      }
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusyClipId(null);
    }
  }, [busyClipId, clips, updateClip]);

  const markViewed = useCallback(async (clip: Clip) => {
    if (viewedIds.current.has(clip._id)) return;
    viewedIds.current.add(clip._id);
    try {
      const { data } = await api.patch<ClipActionResponse>("/api/clips/" + encodeURIComponent(clip._id), { action: "view" });
      updateClip(clip._id, { viewsCount: data.viewsCount });
    } catch {
      viewedIds.current.delete(clip._id);
    }
  }, [updateClip]);

  return (
    <Screen scroll={false}>
      <View className="mb-3 flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>SHORT FORM</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Clips</Text>
        </View>
        <Pressable onPress={() => void loadClips(true)} disabled={refreshing} className="h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          {refreshing ? <ActivityIndicator color={colors.rose} /> : <MaterialCommunityIcons name="refresh" size={20} color={colors.rose} />}
        </Pressable>
      </View>

      {error ? <Text className="mb-2 text-xs" style={{ color: colors.danger }}>{error}</Text> : null}
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.rose} size="large" />
          <Text className="mt-3 text-xs" style={{ color: colors.muted }}>Loading your clips...</Text>
        </View>
      ) : clips.length ? (
        <View className="flex-1" onLayout={event => setPageHeight(Math.max(320, event.nativeEvent.layout.height))}>
          <FlatList
            data={clips}
            keyExtractor={item => item._id}
            renderItem={({ item, index }) => (
              <ClipCard
                clip={item}
                active={index === activeIndex}
                height={pageHeight}
                busy={busyClipId === item._id}
                onAction={action => void runAction(item, action)}
                onViewed={() => void markViewed(item)}
                onComment={() => router.push("/clip/" + encodeURIComponent(item._id) + "/comments")}
              />
            )}
            pagingEnabled
            snapToInterval={pageHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
            onMomentumScrollEnd={event => {
              const next = Math.round(event.nativeEvent.contentOffset.y / pageHeight);
              setActiveIndex(Math.min(clips.length - 1, Math.max(0, next)));
            }}
            initialNumToRender={1}
            maxToRenderPerBatch={2}
            windowSize={3}
            removeClippedSubviews
            showsVerticalScrollIndicator={false}
          />
        </View>
      ) : (
        <View className="flex-1 items-center justify-center rounded-3xl border px-7" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <MaterialCommunityIcons name="play-box-multiple-outline" size={48} color={colors.muted} />
          <Text className="mt-4 text-xl font-bold" style={{ color: colors.text }}>No clips to show</Text>
          <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>
            Clips from creators you can view will appear here. The native clip creator is the next part of this feature.
          </Text>
        </View>
      )}
    </Screen>
  );
}
