import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";
import { getStoredUser } from "@/lib/session";

type Person = { _id?: string; username?: string; fullname?: string; profilePic?: string };
type Conversation = {
  _id: string;
  participants?: Person[];
  participantIds?: string[];
  lastMessage?: { text?: string; sender?: string; createdAt?: string; media?: unknown[] };
  lastMessageAt?: string;
  unreadCount?: number;
  groupTitle?: string;
  isCloseOnesGroup?: boolean;
  blockState?: { blocked?: boolean };
};

export default function MessagesScreen() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [myId, setMyId] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [user, response] = await Promise.all([
        getStoredUser(),
        api.get<{ conversations?: Conversation[] }>("/api/conversations"),
      ]);
      setMyId(user?.id || "");
      setItems(Array.isArray(response.data.conversations) ? response.data.conversations : []);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return undefined;
  }, [load]));

  function title(item: Conversation) {
    if (item.groupTitle) return item.groupTitle;
    const person = item.participants?.find(p => p._id !== myId);
    return person?.fullname || person?.username || "Conversation";
  }

  function preview(item: Conversation) {
    if (item.blockState?.blocked) return "Messaging is restricted for this conversation";
    if (item.lastMessage?.text) return item.lastMessage.text;
    if (item.lastMessage?.media?.length) return "Shared an attachment";
    return "Start the conversation";
  }

  return (
    <Screen scroll={false}>
      <View className="mb-5 flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>YOUR PEOPLE</Text>
          <Text className="mt-1 text-3xl font-black" style={{ color: colors.text }}>Messages</Text>
        </View>
        <Pressable onPress={() => void load(true)} disabled={refreshing} className="h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }} accessibilityLabel="Refresh messages">
          {refreshing ? <ActivityIndicator color={colors.rose} /> : <MaterialCommunityIcons name="refresh" size={20} color={colors.rose} />}
        </Pressable>
      </View>
      {error ? (
        <View className="mb-4 rounded-2xl border p-3" style={{ borderColor: colors.danger, backgroundColor: colors.panel }}>
          <Text className="text-sm" style={{ color: colors.danger }}>{error}</Text>
          <Pressable onPress={() => void load()} className="mt-2 self-start"><Text className="font-bold" style={{ color: colors.rose }}>Try again</Text></Pressable>
        </View>
      ) : null}
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.rose} /><Text className="mt-3 text-xs" style={{ color: colors.muted }}>Loading conversations...</Text></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.rose} />}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center px-7">
              <MaterialCommunityIcons name="message-text-outline" size={48} color={colors.muted} />
              <Text className="mt-4 text-xl font-bold" style={{ color: colors.text }}>No conversations yet</Text>
              <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>When you start chatting with someone on Zenigram, your conversation will appear here.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const person = item.participants?.find(p => p._id !== myId);
            const unread = Number(item.unreadCount || 0);
            return (
              <Pressable onPress={() => router.push("/conversation/" + encodeURIComponent(item._id))} className="mb-2 flex-row items-center rounded-2xl border p-3" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
                <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                  <Text className="text-lg font-black" style={{ color: colors.rose }}>{(person?.username || item.groupTitle || "z").slice(0, 1).toUpperCase()}</Text>
                </View>
                <View className="ml-3 flex-1">
                  <View className="flex-row items-center justify-between">
                    <Text className="flex-1 text-sm font-bold" numberOfLines={1} style={{ color: colors.text }}>{title(item)}</Text>
                    {unread > 0 ? <View className="ml-2 rounded-full px-2 py-1" style={{ backgroundColor: colors.crimson }}><Text className="text-xs font-bold" style={{ color: "#FFFFFF" }}>{unread}</Text></View> : null}
                  </View>
                  <Text className="mt-1 text-xs" numberOfLines={1} style={{ color: item.blockState?.blocked ? colors.danger : colors.muted }}>{preview(item)}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}
