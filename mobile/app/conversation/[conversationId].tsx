import { useCallback, useEffect, useRef, useState } from "react";
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
import { getStoredSession } from "@/lib/session";
import { colors } from "@/theme/colors";

type Person = { _id?: string; username?: string; fullname?: string };
type Message = {
  _id: string;
  text?: string;
  sender?: string | Person;
  createdAt?: string;
  readBy?: string[];
  media?: Array<{ type?: string; url?: string }>;
  reactions?: Array<{ user?: string; emoji?: string }>;
};
type Conversation = { _id: string; participants?: Person[]; groupTitle?: string; blockState?: { blocked?: boolean } };

function senderId(sender: Message["sender"]): string {
  if (typeof sender === "string") return sender;
  return sender?._id || "";
}

export default function ConversationScreen() {
  const params = useLocalSearchParams<{ conversationId: string }>();
  const conversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId || "";
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [myId, setMyId] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const session = await getStoredSession();
      setMyId(session?.user?.id || "");
      const { data } = await api.get<{ messages?: Message[]; conversation?: Conversation }>(
        "/api/conversations/" + encodeURIComponent(conversationId) + "/messages",
      );
      setMessages(Array.isArray(data.messages) ? data.messages : []);
      if (data.conversation) setConversation(data.conversation);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => { void load(); }, [load]);

  async function send() {
    const text = draft.trim();
    if (!text || sending || conversation?.blockState?.blocked) return;
    setSending(true);
    setError("");
    try {
      const { data } = await api.post<{ message?: Message }>(
        "/api/conversations/" + encodeURIComponent(conversationId) + "/messages",
        { text },
      );
      if (data.message) setMessages(current => [...current, data.message as Message]);
      setDraft("");
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSending(false);
    }
  }

  const other = conversation?.participants?.find(person => person._id !== myId);
  const title = conversation?.groupTitle || other?.fullname || other?.username || "Conversation";

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={8}>
        <View className="mb-3 flex-row items-center border-b pb-3" style={{ borderColor: colors.line }}>
          <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }} accessibilityLabel="Back to messages">
            <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
          </Pressable>
          <View className="flex-1">
            <Text className="text-base font-bold" style={{ color: colors.text }}>{title}</Text>
            <Text className="mt-0.5 text-xs" style={{ color: colors.muted }}>{conversation?.groupTitle ? "Close Ones group" : "Private conversation"}</Text>
          </View>
          <Pressable onPress={() => void load()} className="h-9 w-9 items-center justify-center rounded-full" accessibilityLabel="Refresh conversation">
            <MaterialCommunityIcons name="refresh" size={19} color={colors.rose} />
          </Pressable>
        </View>

        {error ? <Text className="mb-2 text-xs" style={{ color: colors.danger }}>{error}</Text> : null}
        {loading ? (
          <View className="flex-1 items-center justify-center"><ActivityIndicator color={colors.rose} size="large" /></View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={item => item._id}
            contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingVertical: 12 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<View className="flex-1 items-center justify-center"><Text className="text-sm" style={{ color: colors.muted }}>Say hello to start the conversation.</Text></View>}
            renderItem={({ item }) => {
              const mine = senderId(item.sender) === myId;
              const sender = typeof item.sender === "object" ? item.sender : null;
              return (
                <View className={mine ? "mb-3 items-end" : "mb-3 items-start"}>
                  {!mine && sender?.username ? <Text className="mb-1 ml-2 text-xs" style={{ color: colors.muted }}>{sender.fullname || sender.username}</Text> : null}
                  <View className="max-w-[84%] rounded-2xl px-4 py-3" style={{ backgroundColor: mine ? colors.wine : colors.panel, borderWidth: 1, borderColor: mine ? colors.crimson : colors.line }}>
                    {item.text ? <Text className="text-sm leading-5" style={{ color: colors.text }}>{item.text}</Text> : null}
                    {item.media?.length ? <Text className="mt-1 text-xs" style={{ color: colors.rose }}>Attachment · open full media support coming in the next pass</Text> : null}
                    <View className="mt-2 flex-row items-center justify-end">
                      <Text className="text-[10px]" style={{ color: colors.muted }}>{item.createdAt ? new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</Text>
                      {mine ? <MaterialCommunityIcons name={item.readBy && item.readBy.length > 1 ? "check-all" : "check"} size={13} color={colors.rose} /> : null}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {conversation?.blockState?.blocked ? (
          <View className="my-2 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
            <Text className="text-sm font-semibold" style={{ color: colors.danger }}>Messaging is unavailable while this account is blocked.</Text>
          </View>
        ) : (
          <View className="mt-2 flex-row items-end rounded-2xl border p-2" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Write a message..."
              placeholderTextColor={colors.muted}
              multiline
              maxLength={1000}
              className="max-h-28 min-h-10 flex-1 px-2 py-2 text-sm"
              style={{ color: colors.text }}
            />
            <Pressable onPress={() => void send()} disabled={sending || !draft.trim()} className="ml-2 h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.rose, opacity: sending || !draft.trim() ? 0.45 : 1 }} accessibilityLabel="Send message">
              {sending ? <ActivityIndicator color={colors.background} size="small" /> : <MaterialCommunityIcons name="send" size={19} color={colors.background} />}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
