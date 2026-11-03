import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type StoryComment = {
  _id: string;
  text: string;
  parentId?: string | null;
  likes?: string[];
  viewerLiked?: boolean;
  createdAt?: string | number;
  user?: { username?: string; fullname?: string } | null;
};
type CommentsResponse = { comments?: StoryComment[] };
type CommentResponse = { comment: StoryComment };

export default function StoryCommentsScreen() {
  const params = useLocalSearchParams<{ storyId: string }>();
  const storyId = Array.isArray(params.storyId) ? params.storyId[0] : params.storyId || "";
  const endpoint = "/api/stories/" + encodeURIComponent(storyId) + "/comments";
  const [comments, setComments] = useState<StoryComment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<StoryComment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<CommentsResponse>(endpoint);
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { void load(); }, [load]);

  async function submit() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const { data } = await api.post<CommentResponse>(endpoint, {
        text,
        parentId: replyTo?._id || null,
      });
      setComments(current => [data.comment, ...current]);
      setDraft("");
      setReplyTo(null);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  async function toggleLike(comment: StoryComment) {
    if (busyId) return;
    setBusyId(comment._id);
    try {
      const { data } = await api.patch<CommentResponse>(endpoint, {
        action: "like",
        commentId: comment._id,
      });
      setComments(current => current.map(item => item._id === comment._id ? data.comment : item));
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View className="mb-4 flex-row items-center">
          <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
            <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>STORY DISCUSSION</Text>
            <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Comments</Text>
          </View>
          <Text className="text-sm font-semibold" style={{ color: colors.muted }}>{comments.length}</Text>
        </View>
        {error ? <Text className="mb-3 rounded-xl p-3 text-xs" style={{ backgroundColor: colors.panel, color: colors.danger }}>{error}</Text> : null}
        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.rose} size="large" /></View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={item => item._id}
            renderItem={({ item }) => {
              const username = item.user?.username || "zenigram_user";
              return (
                <View className="mb-5 flex-row">
                  <View className="mr-3 h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                    <Text className="font-bold" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View className="flex-1">
                    <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: colors.panel }}>
                      <Text className="text-sm font-bold" style={{ color: colors.text }}>{item.user?.fullname || username}</Text>
                      <Text className="mt-2 text-sm leading-6" style={{ color: colors.text }}>{item.text}</Text>
                    </View>
                    <View className="mt-2 flex-row items-center">
                      <Pressable disabled={busyId === item._id} onPress={() => void toggleLike(item)} className="mr-5 flex-row items-center">
                        <MaterialCommunityIcons name={item.viewerLiked ? "heart" : "heart-outline"} size={17} color={item.viewerLiked ? colors.rose : colors.muted} />
                        <Text className="ml-1 text-xs" style={{ color: colors.muted }}>{item.likes?.length || 0}</Text>
                      </Pressable>
                      <Pressable onPress={() => setReplyTo(item)}><Text className="text-xs font-semibold" style={{ color: colors.muted }}>Reply</Text></Pressable>
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={<View className="items-center px-8 py-14"><MaterialCommunityIcons name="message-text-outline" size={42} color={colors.muted} /><Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Start the conversation</Text><Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>Be the first to reply to this story.</Text></View>}
            contentContainerStyle={{ flexGrow: 1, paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
          />
        )}
        <View className="border-t pt-3" style={{ borderColor: colors.line }}>
          {replyTo ? <View className="mb-2 flex-row items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: colors.surface }}><Text className="flex-1 text-xs" style={{ color: colors.rose }}>Replying to @{replyTo.user?.username || "zenigram_user"}</Text><Pressable onPress={() => setReplyTo(null)}><MaterialCommunityIcons name="close" size={18} color={colors.muted} /></Pressable></View> : null}
          <View className="flex-row items-end">
            <TextInput value={draft} onChangeText={setDraft} multiline maxLength={500} placeholder={replyTo ? "Write a reply..." : "Write a comment..."} placeholderTextColor={colors.muted} className="max-h-28 min-h-12 flex-1 rounded-2xl border px-4 py-3 text-sm" style={{ color: colors.text, backgroundColor: colors.panel, borderColor: colors.line }} />
            <Pressable onPress={() => void submit()} disabled={!draft.trim() || sending} className="ml-2 h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.rose, opacity: !draft.trim() || sending ? 0.5 : 1 }} accessibilityLabel="Send comment">
              {sending ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="send" size={20} color={colors.background} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
