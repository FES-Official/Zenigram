import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { getStoredUser, type MobileUser } from "@/lib/session";
import { colors } from "@/theme/colors";

type ProfileResponse = {
  username?: string;
  bio?: string;
  website?: string;
  profilePic?: string;
  ishidden?: boolean;
  progression?: { currentPower?: number; bestPower?: number; totalPower?: number };
};

export default function ProfileScreen() {
  const [user, setUser] = useState<MobileUser | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [stored, response] = await Promise.all([
          getStoredUser(),
          api.get<ProfileResponse>("/api/user/me"),
        ]);
        if (mounted) {
          setUser(stored);
          setProfile(response.data);
        }
      } catch (caught) {
        if (mounted) setError(getApiErrorMessage(caught));
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => { mounted = false; };
  }, []);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
    } catch {
      // The local Keychain/Keystore session is cleared even if the network is offline.
    } finally {
      setBusy(false);
      router.replace("/(auth)/sign-in");
    }
  }

  const username = profile?.username || user?.username || "Zenigram member";
  const profilePic = profile?.profilePic || user?.profilePic;

  return (
    <Screen>
      <View className="mb-6 flex-row items-center justify-between">
        <Text className="text-3xl font-black" style={{ color: colors.text }}>Your profile</Text>
        <Pressable
          onPress={handleSignOut}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          className="h-11 w-11 items-center justify-center rounded-full border"
          style={{ borderColor: colors.line, backgroundColor: colors.panel }}
        >
          {busy ? <ActivityIndicator color={colors.rose} /> : <MaterialCommunityIcons name="logout" size={20} color={colors.rose} />}
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.rose} size="large" />
      ) : error ? (
        <View className="rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
          <Text className="text-sm" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : (
        <>
          <View className="items-center rounded-3xl border p-6" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            {profilePic ? (
              <Image source={{ uri: profilePic }} className="h-24 w-24 rounded-full" />
            ) : (
              <View className="h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                <Text className="text-3xl font-black" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <Text className="mt-4 text-xl font-black" style={{ color: colors.text }}>{user?.fullname || username}</Text>
            <Text className="mt-1 text-sm" style={{ color: colors.rose }}>@{username}</Text>
            {profile?.bio ? <Text className="mt-3 text-center text-sm leading-6" style={{ color: colors.muted }}>{profile.bio}</Text> : null}
            {profile?.ishidden ? (
              <View className="mt-3 rounded-full px-3 py-1" style={{ backgroundColor: colors.wine }}>
                <Text className="text-xs font-semibold" style={{ color: colors.rose }}>Hidden account</Text>
              </View>
            ) : null}
          </View>

          <View className="mt-4 rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>
              ZENIGRAM PROGRESSION
            </Text>
            <View className="mt-4 flex-row justify-between">
              <View>
                <Text className="text-2xl font-black" style={{ color: colors.text }}>{profile?.progression?.currentPower || 0}</Text>
                <Text className="mt-1 text-xs" style={{ color: colors.muted }}>Current power</Text>
              </View>
              <View>
                <Text className="text-2xl font-black" style={{ color: colors.text }}>{profile?.progression?.bestPower || 0}</Text>
                <Text className="mt-1 text-xs" style={{ color: colors.muted }}>Best power</Text>
              </View>
              <View>
                <Text className="text-2xl font-black" style={{ color: colors.text }}>{profile?.progression?.totalPower || 0}</Text>
                <Text className="mt-1 text-xs" style={{ color: colors.muted }}>Total power</Text>
              </View>
            </View>
          </View>

          <View className="mt-4 rounded-3xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <Text className="text-lg font-bold" style={{ color: colors.text }}>Account & privacy</Text>
            <Text className="mt-2 text-sm leading-6" style={{ color: colors.muted }}>
              Update your public profile and control whether your account is hidden. Existing server-side audience and privacy rules remain in force.
            </Text>
            <Pressable onPress={() => router.push("/profile/edit")} className="mt-4 flex-row items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: colors.line }}>
              <View className="flex-row items-center">
                <MaterialCommunityIcons name="account-edit-outline" size={19} color={colors.rose} />
                <Text className="ml-2 text-sm font-semibold" style={{ color: colors.text }}>Edit profile & privacy</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={19} color={colors.muted} />
            </Pressable>
          </View>
        </>
      )}
    </Screen>
  );
}
