import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type NotificationItem = {
  _id: string;
  type?: string;
  username?: string;
  profilePic?: string;
  status?: string;
  read?: boolean;
  event?: { conversationId?: string; [key: string]: unknown };
  createdAt?: string;
};

function description(item: NotificationItem): string {
  const actor = item.username || "Someone";
  switch (item.type) {
    case "like": return actor + " liked your post";
    case "comment": return actor + " commented on your post";
    case "follow": return actor + " started following you";
    case "user_blocked": return "Account safety update from " + actor;
    case "user_unblocked": return actor + " unblocked you";
    case "message_warning": return "A message you sent received a warning";
    case "support": return actor + " supported your account";
    case "story_like": return actor + " liked your story";
    case "story_comment": return actor + " replied to your story";
    default: return actor + " sent you a notification";
  }
}

export default function NotificationsScreen() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const { data } = await api.get<NotificationItem[]>("/api/notifications");
      setItems(Array.isArray(data) ? data : []);
      await api.patch("/api/notifications");
      setItems(current => current.map(item => ({ ...item, read: true })));
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

  return (
    <Screen scroll={false}>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>STAY IN THE LOOP</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Notifications</Text>
        </View>
        <Pressable onPress={() => void load(true)} disabled={refreshing} className="h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          {refreshing ? <ActivityIndicator color={colors.rose} /> : <MaterialCommunityIcons name="refresh" size={20} color={colors.rose} />}
        </Pressable>
      </View>
      {error ? <Text className="mb-3 text-sm" style={{ color: colors.danger }}>{error}</Text> : null}
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.rose} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.rose} />}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          ListEmptyComponent={<View className="flex-1 items-center justify-center px-7"><MaterialCommunityIcons name="bell-check-outline" size={46} color={colors.muted} /><Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>You’re all caught up</Text><Text className="mt-2 text-center text-sm" style={{ color: colors.muted }}>New activity will appear here.</Text></View>}
          renderItem={({ item }) => (
            <View className="mb-2 flex-row items-center rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                <MaterialCommunityIcons name={item.type?.includes("message") ? "message-outline" : item.type?.includes("like") ? "heart-outline" : "bell-outline"} size={19} color={colors.rose} />
              </View>
              <View className="flex-1">
                <Text className="text-sm leading-5" style={{ color: colors.text }}>{description(item)}</Text>
                <Text className="mt-1 text-xs" style={{ color: colors.muted }}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</Text>
              </View>
              {!item.read ? <View className="ml-2 h-2 w-2 rounded-full" style={{ backgroundColor: colors.rose }} /> : null}
            </View>
          )}
        />
      )}
    </Screen>
  );
}
