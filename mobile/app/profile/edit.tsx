import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";
import { deleteUploadedMedia, uploadPickedImage, type UploadedImage } from "@/lib/nativeUpload";

type ProfileData = { username?: string; bio?: string; website?: string; profilePic?: string; ishidden?: boolean };

export default function EditProfileScreen() {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [hidden, setHidden] = useState(false);
  const [profilePic, setProfilePic] = useState("");
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    api.get<ProfileData>("/api/user/me").then(({ data }) => {
      if (!active) return;
      setUsername(data.username || "");
      setBio(data.bio || "");
      setWebsite(data.website || "");
      setProfilePic(data.profilePic || "");
      setHidden(Boolean(data.ishidden));
    }).catch(caught => {
      if (active) setError(getApiErrorMessage(caught));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  async function choosePhoto() {
    setError("");
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Allow photo access to change your profile picture.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.88,
        exif: false,
      });
      if (!result.canceled) setPhoto(result.assets[0] || null);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    let uploaded: UploadedImage | null = null;
    try {
      if (photo) uploaded = await uploadPickedImage(photo);
      await api.post("/api/profile-update", {
        username: username.trim(),
        bio: bio.trim(),
        website: website.trim(),
        ishidden: hidden,
        ...(uploaded ? { profilePicKey: uploaded.key } : {}),
      });
      if (uploaded) setProfilePic(photo?.uri || profilePic);
      setNotice("Your profile changes are saved.");
      router.back();
    } catch (caught) {
      if (uploaded?.key) await deleteUploadedMedia([uploaded.key]).catch(() => {});
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, value: string, change: (next: string) => void, placeholder: string, options?: { multiline?: boolean; maxLength?: number; autoCapitalize?: "none" | "sentences" | "words"; }) {
    return (
      <View className="mb-4 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <Text className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={change}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          multiline={options?.multiline}
          maxLength={options?.maxLength}
          autoCapitalize={options?.autoCapitalize || "sentences"}
          textAlignVertical={options?.multiline ? "top" : "center"}
          className={options?.multiline ? "min-h-24 text-sm leading-6" : "text-sm"}
          style={{ color: colors.text }}
        />
        {options?.maxLength ? <Text className="mt-2 self-end text-xs" style={{ color: colors.muted }}>{value.length}/{options.maxLength}</Text> : null}
      </View>
    );
  }

  return (
    <Screen>
      <View className="mb-6 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }} accessibilityLabel="Go back">
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>MAKE IT YOURS</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Edit profile</Text>
        </View>
      </View>

      {error ? <View className="mb-4 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}><Text className="text-sm" style={{ color: colors.danger }}>{error}</Text></View> : null}
      {notice ? <Text className="mb-4 text-sm font-semibold" style={{ color: colors.success }}>{notice}</Text> : null}
      {loading ? <View className="items-center py-12"><ActivityIndicator color={colors.rose} size="large" /></View> : (
        <>
          <View className="mb-5 flex-row items-center rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            {photo?.uri || profilePic ? (
              <Image source={{ uri: photo?.uri || profilePic }} className="h-16 w-16 rounded-full" />
            ) : (
              <View className="h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
                <MaterialCommunityIcons name="account" size={28} color={colors.rose} />
              </View>
            )}
            <View className="ml-4 flex-1">
              <Text className="text-sm font-bold" style={{ color: colors.text }}>Profile picture</Text>
              <Text className="mt-1 text-xs" style={{ color: colors.muted }}>Choose a square photo for your profile.</Text>
              <Pressable onPress={() => void choosePhoto()} disabled={saving} className="mt-2 self-start">
                <Text className="text-xs font-bold" style={{ color: colors.rose }}>Change photo</Text>
              </Pressable>
            </View>
          </View>
          {field("Username", username, setUsername, "your.username", { maxLength: 24, autoCapitalize: "none" })}
          {field("Bio", bio, setBio, "A little about you...", { multiline: true, maxLength: 300 })}
          {field("Website", website, setWebsite, "https://example.com", { maxLength: 300, autoCapitalize: "none" })}

          <View className="mb-6 flex-row items-center justify-between rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            <View className="flex-1 pr-3">
              <Text className="text-sm font-bold" style={{ color: colors.text }}>Hidden account</Text>
              <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>Limit profile and content visibility according to Zenigram’s existing hidden-account rules.</Text>
            </View>
            <Switch value={hidden} onValueChange={setHidden} disabled={saving} trackColor={{ false: colors.surface, true: colors.crimson }} thumbColor={hidden ? colors.rose : colors.muted} />
          </View>

          <Pressable onPress={() => void save()} disabled={saving || !username.trim()} className="mb-8 flex-row items-center justify-center rounded-2xl px-4 py-4" style={{ backgroundColor: colors.rose }}>
            {saving ? <ActivityIndicator color={colors.background} /> : <MaterialCommunityIcons name="content-save-outline" size={19} color={colors.background} />}
            <Text className="ml-2 text-base font-bold" style={{ color: colors.background }}>{saving ? "Saving..." : "Save changes"}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}
