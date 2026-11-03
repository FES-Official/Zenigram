import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { getStoredUser } from "@/lib/session";
import { colors } from "@/theme/colors";

type ConnectionUser = {
  _id: string;
  username: string;
  fullname?: string;
  profilePic?: string;
  ishidden?: boolean;
};

type PublicProfile = {
  _id: string;
  username: string;
  fullname?: string;
  bio?: string;
  website?: string;
  profilePic?: string;
  ishidden?: boolean;
  supporters?: string[];
  supporting?: string[];
  closeOnes?: string[];
  supporterProfiles?: ConnectionUser[];
  supportingProfiles?: ConnectionUser[];
  closeProfiles?: ConnectionUser[];
  mutualSupporters?: ConnectionUser[];
  mutualSupportersCount?: number;
  connectionsVisible?: boolean;
  viewerSupportsProfile?: boolean;
};

type ConnectionTab = "supporters" | "supporting" | "close";

function ConnectionRow({ user }: { user: ConnectionUser }) {
  const username = user.username || "creator";
  return (
    <Pressable
      onPress={() => router.push("/profile/" + encodeURIComponent(username))}
      className="mb-2 flex-row items-center rounded-xl border p-3"
      style={{ backgroundColor: colors.surface, borderColor: colors.line }}
    >
      {user.profilePic ? (
        <Image source={{ uri: user.profilePic }} className="h-10 w-10 rounded-full" />
      ) : (
        <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
          <Text className="font-bold" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View className="ml-3 flex-1">
        <Text className="text-sm font-bold" style={{ color: colors.text }}>{user.fullname || username}</Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.muted }}>@{username}</Text>
      </View>
      {user.ishidden ? <MaterialCommunityIcons name="lock-outline" size={16} color={colors.muted} /> : null}
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.muted} />
    </Pressable>
  );
}

export default function PublicProfileScreen() {
  const params = useLocalSearchParams<{ username?: string | string[] }>();
  const username = Array.isArray(params.username) ? params.username[0] : params.username || "";
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [requested, setRequested] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [connectionTab, setConnectionTab] = useState<ConnectionTab>("supporters");

  const loadProfile = useCallback(async () => {
    if (!username) {
      setError("This profile link is invalid.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [storedUser, response] = await Promise.all([
        getStoredUser(),
        api.post<PublicProfile>("/api/profile", { username }),
      ]);
      const next = response.data;
      if (!next?._id) throw new Error("Creator profile was not found.");
      setCurrentUserId(storedUser?.id || "");
      setProfile(next);
      setSupported(Boolean(next.viewerSupportsProfile));
      setRequested(false);

      if (next.ishidden && storedUser?.id !== String(next._id) && !next.viewerSupportsProfile) {
        const requestStatus = await api.post<{ requested?: boolean }>("/api/check-request", {
          targetUserId: next._id,
        });
        setRequested(Boolean(requestStatus.data?.requested));
      }
    } catch (caught) {
      setProfile(null);
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [username]);

  useFocusEffect(useCallback(() => {
    void loadProfile();
    return undefined;
  }, [loadProfile]));

  const isOwnProfile = Boolean(profile && currentUserId && currentUserId === String(profile._id));
  const activeConnections = connectionTab === "supporters"
    ? profile?.supporterProfiles || []
    : connectionTab === "supporting"
      ? profile?.supportingProfiles || []
      : profile?.closeProfiles || [];

  async function toggleSupport() {
    if (!profile || mutating || isOwnProfile) return;
    setMutating(true);
    setError("");
    try {
      if (profile.ishidden && !supported) {
        if (requested) {
          await api.post("/api/support/cancel", { targetUserId: profile._id });
          setRequested(false);
        } else {
          const { data } = await api.post<{ requested?: boolean }>("/api/support", {
            targetUserId: profile._id,
          });
          setRequested(Boolean(data?.requested));
        }
        return;
      }

      const { data } = await api.post<{ supported: boolean }>("/api/support", {
        targetUserId: profile._id,
      });
      setSupported(Boolean(data?.supported));
      setRequested(false);
      await loadProfile();
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setMutating(false);
    }
  }

  function confirmBlock() {
    if (!profile || mutating || isOwnProfile) return;
    Alert.alert(
      "Block @" + profile.username + "?",
      "This prevents profile access and interactions between both accounts. You can unblock this account later from Blocked accounts.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setMutating(true);
              try {
                await api.post("/api/users/block", { targetUserId: profile._id, action: "block" });
                router.back();
              } catch (caught) {
                setError(getApiErrorMessage(caught));
              } finally {
                setMutating(false);
              }
            })();
          },
        },
      ],
    );
  }

  const connectionCount = (tab: ConnectionTab) => {
    if (tab === "supporters") return profile?.supporters?.length || 0;
    if (tab === "supporting") return profile?.supporting?.length || 0;
    return profile?.closeOnes?.length || 0;
  };

  return (
    <Screen scroll={false}>
      <View className="mb-4 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ backgroundColor: colors.panel, borderColor: colors.line }} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>CREATOR PROFILE</Text>
          <Text numberOfLines={1} className="mt-1 text-xl font-black" style={{ color: colors.text }}>@{username}</Text>
        </View>
        {profile && !isOwnProfile ? (
          <Pressable onPress={confirmBlock} disabled={mutating} className="h-10 w-10 items-center justify-center rounded-full border" style={{ backgroundColor: colors.panel, borderColor: colors.line }} accessibilityLabel="Block account">
            <MaterialCommunityIcons name="account-cancel-outline" size={20} color={colors.rose} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.rose} /></View>
      ) : error && !profile ? (
        <View className="flex-1 items-center justify-center rounded-3xl border p-6" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <MaterialCommunityIcons name="account-alert-outline" size={40} color={colors.rose} />
          <Text className="mt-3 text-center text-lg font-bold" style={{ color: colors.text }}>Profile unavailable</Text>
          <Text className="mt-2 text-center text-sm leading-6" style={{ color: colors.muted }}>{error}</Text>
          <Pressable onPress={() => void loadProfile()} className="mt-4 rounded-xl px-5 py-3" style={{ backgroundColor: colors.wine }}>
            <Text className="font-bold" style={{ color: colors.rose }}>Try again</Text>
          </Pressable>
        </View>
      ) : profile ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }}>
          {error ? <Text className="mb-3 text-sm" style={{ color: colors.danger }}>{error}</Text> : null}
          <View className="overflow-hidden rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <View className="items-center">
              {profile.profilePic ? (
                <Image source={{ uri: profile.profilePic }} className="h-24 w-24 rounded-full" />
              ) : (
                <View className="h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                  <Text className="text-3xl font-black" style={{ color: colors.rose }}>{profile.username.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <Text className="mt-4 text-xl font-black" style={{ color: colors.text }}>{profile.fullname || profile.username}</Text>
              <Text className="mt-1 text-sm" style={{ color: colors.rose }}>@{profile.username}</Text>
              {profile.bio ? <Text className="mt-3 text-center text-sm leading-6" style={{ color: colors.muted }}>{profile.bio}</Text> : null}
              {profile.ishidden ? (
                <View className="mt-3 flex-row items-center rounded-full px-3 py-1.5" style={{ backgroundColor: colors.wine }}>
                  <MaterialCommunityIcons name="lock-outline" size={14} color={colors.rose} />
                  <Text className="ml-1 text-xs font-semibold" style={{ color: colors.rose }}>Hidden account</Text>
                </View>
              ) : null}
              {profile.website ? <Text className="mt-3 text-xs" style={{ color: colors.rose }}>{profile.website}</Text> : null}
              {!isOwnProfile ? (
                <Pressable onPress={() => void toggleSupport()} disabled={mutating} className="mt-5 min-w-40 flex-row items-center justify-center rounded-xl px-5 py-3" style={{ backgroundColor: supported ? colors.surface : colors.crimson, borderWidth: 1, borderColor: colors.line, opacity: mutating ? 0.6 : 1 }}>
                  {mutating ? <ActivityIndicator color={colors.text} size="small" /> : <MaterialCommunityIcons name={supported ? "heart-minus-outline" : requested ? "clock-outline" : "heart-plus-outline"} size={18} color={colors.text} />}
                  <Text className="ml-2 text-sm font-bold" style={{ color: colors.text }}>
                    {mutating ? "Updating..." : supported ? "Supporting" : requested ? "Requested · Cancel" : "Support"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable onPress={() => router.push("/profile/edit")} className="mt-5 rounded-xl px-5 py-3" style={{ backgroundColor: colors.wine }}>
                  <Text className="text-sm font-bold" style={{ color: colors.rose }}>Edit profile</Text>
                </Pressable>
              )}
            </View>

            <View className="mt-6 flex-row border-t pt-5" style={{ borderColor: colors.line }}>
              {([
                ["Posts", 0],
                ["Supporters", profile.supporters?.length || 0],
                ["Supporting", profile.supporting?.length || 0],
                ["Close ones", profile.closeOnes?.length || 0],
              ] as Array<[string, number]>).map(([label, value]) => (
                <View key={label} className="flex-1 items-center px-1">
                  <Text className="text-lg font-black" style={{ color: colors.text }}>{Number(value).toLocaleString()}</Text>
                  <Text numberOfLines={1} className="mt-1 text-center text-[10px]" style={{ color: colors.muted }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>

          {!profile.connectionsVisible ? (
            <View className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
              <View className="flex-row items-center">
                <MaterialCommunityIcons name="shield-lock-outline" size={20} color={colors.rose} />
                <Text className="ml-2 text-sm font-bold" style={{ color: colors.text }}>Connections are private</Text>
              </View>
              <Text className="mt-2 text-xs leading-5" style={{ color: colors.muted }}>This creator keeps their supporter lists private. The connection counts remain visible, but individual accounts are hidden.</Text>
            </View>
          ) : (
            <View className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
              <Text className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Social circle</Text>
              <View className="mb-4 flex-row rounded-xl p-1" style={{ backgroundColor: colors.surface }}>
                {([
                  ["supporters", "Supporters"],
                  ["supporting", "Supporting"],
                  ["close", "Close ones"],
                ] as Array<[ConnectionTab, string]>).map(([tab, label]) => (
                  <Pressable key={tab} onPress={() => setConnectionTab(tab)} className="flex-1 items-center rounded-lg px-1 py-2" style={{ backgroundColor: connectionTab === tab ? colors.wine : "transparent" }}>
                    <Text numberOfLines={1} className="text-[11px] font-semibold" style={{ color: connectionTab === tab ? colors.rose : colors.muted }}>{label} · {connectionCount(tab)}</Text>
                  </Pressable>
                ))}
              </View>
              {activeConnections.length ? (
                activeConnections.map(user => <ConnectionRow key={user._id} user={user} />)
              ) : (
                <Text className="py-4 text-center text-xs" style={{ color: colors.muted }}>No accounts in this list yet.</Text>
              )}
              {profile.mutualSupportersCount ? (
                <Text className="mt-3 text-xs leading-5" style={{ color: colors.muted }}>
                  {profile.mutualSupportersCount} mutual supporter{profile.mutualSupportersCount === 1 ? "" : "s"} connect you with this creator.
                </Text>
              ) : null}
            </View>
          )}

          {profile.ishidden && !supported && !isOwnProfile ? (
            <View className="mt-4 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
              <MaterialCommunityIcons name="lock-outline" size={22} color={colors.rose} />
              <Text className="mt-2 text-sm font-bold" style={{ color: colors.text }}>This account shares content with supporters</Text>
              <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>
                {requested ? "Your support request is pending. You can cancel it using the button above." : "Send a support request to ask for access to this creator’s private content."}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </Screen>
  );
}
