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

type ClipComment = {
  _id: string;
  clipId: string;
  userId: string;
  text: string;
  parentId?: string | null;
  likes?: string[];
  viewerLiked?: boolean;
  createdAt?: string | number;
  user?: { username?: string; fullname?: string } | null;
};
type CommentsResponse = { success?: boolean; comments?: ClipComment[] };
type CommentResponse = { success?: boolean; comment: ClipComment };

function CommentRow({
  item,
  onReply,
  onLike,
  busy,
}: {
  item: ClipComment;
  onReply: (item: ClipComment) => void;
  onLike: (item: ClipComment) => void;
  busy: boolean;
}) {
  const username = item.user?.username || "zenigram_user";
  const date = item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "";
  return (
    <View className="mb-5 flex-row">
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
        <Text className="font-bold" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View className="flex-1">
        <View className="rounded-2xl px-4 py-3" style={{ backgroundColor: colors.panel }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-sm font-bold" style={{ color: colors.text }}>{item.user?.fullname || username}</Text>
            <Text className="text-xs" style={{ color: colors.muted }}>{date}</Text>
          </View>
          {item.parentId ? <Text className="mt-1 text-xs" style={{ color: colors.rose }}>Reply</Text> : null}
          <Text className="mt-2 text-sm leading-6" style={{ color: colors.text }}>{item.text}</Text>
        </View>
        <View className="mt-2 flex-row items-center">
          <Pressable disabled={busy} onPress={() => onLike(item)} className="mr-5 flex-row items-center">
            <MaterialCommunityIcons name={item.viewerLiked ? "heart" : "heart-outline"} size={17} color={item.viewerLiked ? colors.rose : colors.muted} />
            <Text className="ml-1 text-xs" style={{ color: item.viewerLiked ? colors.rose : colors.muted }}>{Array.isArray(item.likes) ? item.likes.length : 0}</Text>
          </Pressable>
          <Pressable onPress={() => onReply(item)}>
            <Text className="text-xs font-semibold" style={{ color: colors.muted }}>Reply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function ClipCommentsScreen() {
  const params = useLocalSearchParams<{ clipId: string }>();
  const clipId = Array.isArray(params.clipId) ? params.clipId[0] : params.clipId || "";
  const [comments, setComments] = useState<ClipComment[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ClipComment | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const endpoint = "/api/clips/" + encodeURIComponent(clipId) + "/comments";

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

  async function toggleLike(item: ClipComment) {
    if (busyId) return;
    setBusyId(item._id);
    try {
      const { data } = await api.patch<CommentResponse>(endpoint, {
        action: "like",
        commentId: item._id,
      });
      setComments(current => current.map(comment => comment._id === item._id ? data.comment : comment));
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
            <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>CLIP DISCUSSION</Text>
            <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Comments</Text>
          </View>
          <Text className="text-sm font-semibold" style={{ color: colors.muted }}>{comments.length}</Text>
        </View>
        {error ? <Text className="mb-3 rounded-xl p-3 text-xs" style={{ color: colors.danger, backgroundColor: colors.panel }}>{error}</Text> : null}
        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.rose} size="large" /></View>
        ) : (
          <FlatList
            data={comments}
            keyExtractor={item => item._id}
            renderItem={({ item }) => <CommentRow item={item} busy={busyId === item._id} onReply={setReplyTo} onLike={toggleLike} />}
            ListEmptyComponent={<View className="items-center px-8 py-14"><MaterialCommunityIcons name="message-text-outline" size={42} color={colors.muted} /><Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>Start the conversation</Text><Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>Be the first to comment on this clip.</Text></View>}
            contentContainerStyle={{ flexGrow: 1, paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
          />
        )}
        <View className="border-t pt-3" style={{ borderColor: colors.line }}>
          {replyTo ? (
            <View className="mb-2 flex-row items-center justify-between rounded-xl px-3 py-2" style={{ backgroundColor: colors.surface }}>
              <Text className="flex-1 text-xs" style={{ color: colors.rose }}>Replying to @{replyTo.user?.username || "zenigram_user"}</Text>
              <Pressable onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply"><MaterialCommunityIcons name="close" size={18} color={colors.muted} /></Pressable>
            </View>
          ) : null}
          <View className="flex-row items-end">
            <TextInput
              value={draft}
              onChangeText={value => { setDraft(value); if (error) setError(""); }}
              multiline
              maxLength={500}
              placeholder={replyTo ? "Write a reply..." : "Write a comment..."}
              placeholderTextColor={colors.muted}
              className="max-h-28 min-h-12 flex-1 rounded-2xl border px-4 py-3 text-sm"
              style={{ color: colors.text, backgroundColor: colors.panel, borderColor: colors.line }}
            />
            <Pressable onPress={() => void submit()} disabled={!draft.trim() || sending} className="ml-2 h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: draft.trim() ? colors.rose : colors.wine, opacity: sending ? 0.6 : 1 }} accessibilityLabel="Send comment">
              {sending ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="send" size={20} color={colors.background} />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
