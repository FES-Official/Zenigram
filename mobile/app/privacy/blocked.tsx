import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, RefreshControl, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type BlockedUser = { _id: string; username: string; fullname?: string; profilePic?: string };
type BlockedResponse = { users?: BlockedUser[] };

export default function BlockedAccountsScreen() {
  const [users, setUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { data } = await api.get<BlockedResponse>("/api/users/blocked");
      setUsers(Array.isArray(data?.users) ? data.users : []);
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

  function confirmUnblock(user: BlockedUser) {
    Alert.alert(
      "Unblock @" + user.username + "?",
      "They may be able to find your profile and interact with you again, subject to your privacy settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Unblock",
          onPress: () => {
            void (async () => {
              setBusyId(user._id);
              setError("");
              try {
                await api.post("/api/users/block", { targetUserId: user._id, action: "unblock" });
                setUsers(current => current.filter(item => item._id !== user._id));
              } catch (caught) {
                setError(getApiErrorMessage(caught));
              } finally {
                setBusyId("");
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <Screen scroll={false}>
      <View className="mb-5 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ backgroundColor: colors.panel, borderColor: colors.line }} accessibilityLabel="Back">
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>ACCOUNT SAFETY</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Blocked accounts</Text>
        </View>
        <Pressable onPress={() => void load(true)} disabled={refreshing} className="h-10 w-10 items-center justify-center rounded-full border" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          {refreshing ? <ActivityIndicator color={colors.rose} /> : <MaterialCommunityIcons name="refresh" size={19} color={colors.rose} />}
        </Pressable>
      </View>
      <Text className="mb-4 text-xs leading-5" style={{ color: colors.muted }}>
        Accounts you block cannot access your profile or interact with you. You can reverse a block here.
      </Text>
      {error ? <Text className="mb-3 text-sm" style={{ color: colors.danger }}>{error}</Text> : null}
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.rose} /></View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item._id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.rose} />}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
          ListEmptyComponent={<View className="flex-1 items-center justify-center px-7"><MaterialCommunityIcons name="shield-check-outline" size={46} color={colors.muted} /><Text className="mt-4 text-lg font-bold" style={{ color: colors.text }}>No blocked accounts</Text><Text className="mt-2 text-center text-sm" style={{ color: colors.muted }}>Accounts you block will appear here.</Text></View>}
          renderItem={({ item }) => (
            <View className="mb-3 flex-row items-center rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
              {item.profilePic ? <Image source={{ uri: item.profilePic }} className="h-11 w-11 rounded-full" /> : <View className="h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}><Text className="font-bold" style={{ color: colors.rose }}>{item.username.slice(0, 1).toUpperCase()}</Text></View>}
              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold" style={{ color: colors.text }}>{item.fullname || item.username}</Text>
                <Text className="mt-0.5 text-xs" style={{ color: colors.muted }}>@{item.username}</Text>
              </View>
              <Pressable onPress={() => confirmUnblock(item)} disabled={busyId === item._id} className="min-w-20 items-center rounded-xl px-3 py-2" style={{ backgroundColor: colors.wine, opacity: busyId === item._id ? 0.5 : 1 }}>
                {busyId === item._id ? <ActivityIndicator size="small" color={colors.rose} /> : <Text className="text-xs font-bold" style={{ color: colors.rose }}>Unblock</Text>}
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
