import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type FeedMode = "balanced" | "circle" | "latest" | "interests" | "discover";
type FeedPreferences = { mode?: FeedMode };
type FeedPost = {
  _id: string;
  caption?: string;
  createdAt?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  mediaItems?: Array<{ url?: string; type?: "image" | "video" }>;
  likesCount?: number;
  commentsCount?: number;
  shareCount?: number;
  likes?: string[];
  viewerLiked?: boolean;
  viewerSaved?: boolean;
  closeOnesOnly?: boolean;
  user?: { username?: string; fullname?: string; profilePic?: string };
};
type FeedResponse = { post?: FeedPost[]; feedPreferences?: FeedPreferences };

const MODES: Array<{ id: FeedMode; label: string }> = [
  { id: "balanced", label: "For you" },
  { id: "circle", label: "Your circle" },
  { id: "latest", label: "Latest" },
  { id: "interests", label: "Interests" },
  { id: "discover", label: "Discover" },
];

function PostCard({
  post,
  busy,
  onLike,
  onSave,
  onComment,
}: {
  post: FeedPost;
  busy: boolean;
  onLike: () => void;
  onSave: () => void;
  onComment: () => void;
}) {
  const media = post.mediaItems?.[0];
  const mediaUrl = media?.url || post.mediaUrl || "";
  const mediaType = media?.type || post.mediaType;
  const username = post.user?.username || "zenigram_user";
  const liked = Boolean(post.viewerLiked || post.likes?.length);
  const saved = Boolean(post.viewerSaved);

  return (
    <View
      className="mb-5 overflow-hidden rounded-3xl border"
      style={{ backgroundColor: colors.panel, borderColor: colors.line }}
    >
      <View className="flex-row items-center px-4 py-4">
        {post.user?.profilePic ? (
          <Image source={{ uri: post.user.profilePic }} className="h-10 w-10 rounded-full" />
        ) : (
          <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
            <Text className="font-bold" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View className="ml-3 flex-1">
          <Text className="font-bold" style={{ color: colors.text }}>{post.user?.fullname || username}</Text>
          <Text className="mt-0.5 text-xs" style={{ color: colors.muted }}>@{username}</Text>
        </View>
        {post.closeOnesOnly ? (
          <View className="rounded-full px-3 py-1" style={{ backgroundColor: colors.wine }}>
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Close Ones</Text>
          </View>
        ) : null}
      </View>

      {mediaUrl && mediaType !== "video" ? (
        <Image source={{ uri: mediaUrl }} resizeMode="cover" className="w-full" style={{ height: 360, backgroundColor: colors.surface }} />
      ) : mediaType === "video" ? (
        <View className="items-center justify-center" style={{ height: 300, backgroundColor: colors.surface }}>
          <MaterialCommunityIcons name="play-circle-outline" size={58} color={colors.rose} />
          <Text className="mt-2 text-sm font-semibold" style={{ color: colors.text }}>Video post</Text>
          <Text className="mt-1 text-xs" style={{ color: colors.muted }}>Native video playback is the next media milestone.</Text>
        </View>
      ) : null}

      {post.caption ? (
        <Text className="px-4 pb-3 pt-4 text-sm leading-6" style={{ color: colors.text }}>{post.caption}</Text>
      ) : null}

      <View className="flex-row items-center justify-between border-t px-4 py-3" style={{ borderColor: colors.line }}>
        <Pressable
          disabled={busy}
          onPress={onLike}
          accessibilityRole="button"
          accessibilityLabel={liked ? "Unlike post" : "Like post"}
          className="flex-row items-center rounded-full px-2 py-2"
          style={{ opacity: busy ? 0.55 : 1 }}
        >
          <MaterialCommunityIcons name={liked ? "heart" : "heart-outline"} size={22} color={liked ? colors.rose : colors.muted} />
          <Text className="ml-2 text-xs font-semibold" style={{ color: liked ? colors.rose : colors.muted }}>
            {Number(post.likesCount || 0).toLocaleString()}
          </Text>
        </Pressable>
        <Pressable
          onPress={onComment}
          accessibilityRole="button"
          accessibilityLabel="Open comments"
          className="flex-row items-center"
        >
          <MaterialCommunityIcons name="comment-outline" size={19} color={colors.muted} />
          <Text className="ml-2 text-xs" style={{ color: colors.muted }}>{Number(post.commentsCount || 0).toLocaleString()}</Text>
        </Pressable>
        <View className="flex-row items-center">
          <MaterialCommunityIcons name="share-outline" size={19} color={colors.muted} />
          <Text className="ml-2 text-xs" style={{ color: colors.muted }}>{Number(post.shareCount || 0).toLocaleString()}</Text>
        </View>
        <Pressable
          disabled={busy}
          onPress={onSave}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove saved post" : "Save post"}
          className="rounded-full p-2"
          style={{ opacity: busy ? 0.55 : 1 }}
        >
          <MaterialCommunityIcons name={saved ? "bookmark" : "bookmark-outline"} size={21} color={saved ? colors.rose : colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [mode, setMode] = useState<FeedMode>("balanced");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadFeed = useCallback(async (pullToRefresh = false) => {
    if (pullToRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const { data } = await api.get<FeedResponse>("/api/posts");
      setPosts(Array.isArray(data?.post) ? data.post : []);
      setMode(data?.feedPreferences?.mode || "balanced");
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFeed(true);
      return undefined;
    }, [loadFeed]),
  );

  const updatePost = useCallback((postId: string, patch: Partial<FeedPost>) => {
    setPosts(current => current.map(post => post._id === postId ? { ...post, ...patch } : post));
  }, []);

  const toggleLike = useCallback(async (post: FeedPost) => {
    if (busyPostId) return;
    setBusyPostId(post._id);
    setError("");
    try {
      const { data } = await api.post<{ liked: boolean; likesCount: number }>("/api/post/like", {
        postId: post._id,
      });
      updatePost(post._id, {
        viewerLiked: data.liked,
        likes: data.liked ? ["viewer"] : [],
        likesCount: data.likesCount,
      });
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusyPostId(null);
    }
  }, [busyPostId, updatePost]);

  const toggleSave = useCallback(async (post: FeedPost) => {
    if (busyPostId) return;
    setBusyPostId(post._id);
    setError("");
    try {
      const { data } = await api.post<{ saved: boolean }>("/api/posts/" + encodeURIComponent(post._id) + "/save");
      updatePost(post._id, { viewerSaved: data.saved });
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusyPostId(null);
    }
  }, [busyPostId, updatePost]);

  const header = useMemo(() => (
    <View>
      <View className="mb-5 flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>ZENIGRAM</Text>
          <Text className="mt-1 text-3xl font-black" style={{ color: colors.text }}>Your feed</Text>
          <Text className="mt-1 text-xs" style={{ color: colors.muted }}>Your interests. Your rules.</Text>
        </View>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => void loadFeed(true)}
            accessibilityRole="button"
            accessibilityLabel="Refresh feed"
            className="mr-2 h-11 w-11 items-center justify-center rounded-full border"
            style={{ borderColor: colors.line, backgroundColor: colors.panel }}
          >
            <MaterialCommunityIcons name="refresh" size={21} color={colors.rose} />
          </Pressable>
          <Pressable
            onPress={() => router.push("/feed-controls")}
            accessibilityRole="button"
            accessibilityLabel="Open feed controls"
            className="h-11 w-11 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.wine }}
          >
            <MaterialCommunityIcons name="tune-variant" size={21} color={colors.rose} />
          </Pressable>
        </View>
      </View>

      <View className="mb-5">
        <View className="mb-2 flex-row items-center justify-between">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Feed mode</Text>
          <Pressable onPress={() => router.push("/feed-controls")}>
            <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Customize</Text>
          </Pressable>
        </View>
        <View className="flex-row flex-wrap">
          {MODES.map(item => {
            const active = item.id === mode;
            return (
              <Pressable
                key={item.id}
                onPress={() => router.push("/feed-controls")}
                className="mb-2 mr-2 rounded-full border px-3 py-2"
                style={{ borderColor: active ? colors.crimson : colors.line, backgroundColor: active ? colors.wine : colors.panel }}
              >
                <Text className="text-xs font-semibold" style={{ color: active ? colors.rose : colors.muted }}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  ), [loadFeed, mode]);

  if (loading) {
    return (
      <Screen scroll={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.rose} size="large" />
          <Text className="mt-3 text-sm" style={{ color: colors.muted }}>Loading your feed...</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <FlatList
        data={posts}
        keyExtractor={post => post._id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            busy={busyPostId === item._id}
            onLike={() => void toggleLike(item)}
            onSave={() => void toggleSave(item)}
            onComment={() => router.push("/post/" + encodeURIComponent(item._id) + "/comments")}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={(
          <View className="rounded-3xl border p-6" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <Text className="text-xl font-bold" style={{ color: colors.text }}>Your feed starts here</Text>
            <Text className="mt-2 text-sm leading-6" style={{ color: colors.muted }}>
              Follow creators, choose topics, and adjust your feed controls to shape what appears here.
            </Text>
            <Pressable onPress={() => router.push("/feed-controls")} className="mt-4 self-start rounded-full px-4 py-3" style={{ backgroundColor: colors.rose }}>
              <Text className="font-bold" style={{ color: colors.background }}>Set my interests</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={error ? (
          <View className="mb-5 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
            <Text className="text-sm" style={{ color: colors.danger }}>{error}</Text>
          </View>
        ) : null}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadFeed(true)} tintColor={colors.rose} />}
        contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={5}
        windowSize={7}
        removeClippedSubviews
      />
    </Screen>
  );
}
