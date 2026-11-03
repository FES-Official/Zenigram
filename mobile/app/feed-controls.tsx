import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type FeedMode = "balanced" | "circle" | "latest" | "interests" | "discover";
type Preferences = {
  version?: number;
  mode: FeedMode;
  topicWeights: Record<string, number>;
  sourceWeights: Record<string, number>;
  mutedTopics: string[];
  mutedCreators: string[];
  creatorWeights: Record<string, number>;
};

const MODES = [
  { id: "balanced", title: "Balanced", detail: "A mix of your settings, freshness and discovery." },
  { id: "circle", title: "Your circle", detail: "Prioritize creators you support and mutual connections." },
  { id: "latest", title: "Latest", detail: "Put the newest visible posts first." },
  { id: "interests", title: "My interests", detail: "Give your chosen topics the strongest influence." },
  { id: "discover", title: "Discover", detail: "Give newer-to-you creators more room." },
] as const;

const TOPICS = [
  ["technology", "Technology"], ["education", "Education"], ["gaming", "Gaming"],
  ["travel", "Travel"], ["sports", "Sports"], ["art", "Art & Design"],
  ["food", "Food"], ["fashion", "Fashion & Beauty"], ["news", "News & Current Affairs"],
  ["entertainment", "Entertainment"], ["fitness", "Fitness & Wellness"],
] as const;

const SOURCES = [
  ["circle", "People in my circle"], ["interests", "My selected topics"],
  ["discovery", "New creators"], ["freshness", "Fresh posts"],
  ["trending", "Popular posts"],
] as const;

export default function FeedControlsScreen() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get<{ preferences: Preferences }>("/api/feed-preferences");
      setPreferences(data.preferences);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(next: Preferences) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.put<{ preferences: Preferences }>("/api/feed-preferences", { preferences: next });
      setPreferences(data.preferences);
      setNotice("Your feed settings are saved.");
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeTopic(action: "moreTopic" | "lessTopic" | "muteTopic" | "unmuteTopic", topic: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data } = await api.patch<{ preferences: Preferences }>("/api/feed-preferences", { action, topic });
      setPreferences(data.preferences);
      setNotice("Your topic settings are saved.");
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  async function changeSource(source: string, amount: number) {
    if (!preferences) return;
    const current = Number(preferences.sourceWeights?.[source] ?? 50);
    await save({
      ...preferences,
      sourceWeights: {
        ...preferences.sourceWeights,
        [source]: Math.max(0, Math.min(100, current + amount)),
      },
    });
  }

  return (
    <Screen>
      <View className="mb-6 flex-row items-center">
        <Pressable onPress={() => router.back()} className="mr-3 h-10 w-10 items-center justify-center rounded-full border" style={{ borderColor: colors.line, backgroundColor: colors.panel }}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>YOUR CONTROL CENTER</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Shape your feed</Text>
        </View>
        {saving ? <ActivityIndicator color={colors.rose} /> : null}
      </View>

      <Text className="mb-4 text-sm leading-6" style={{ color: colors.muted }}>
        Choose how Zenigram ranks content. Your settings are saved to your account and apply to the same feed used on web.
      </Text>
      {error ? (
        <View className="mb-4 rounded-2xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
          <Text className="text-sm" style={{ color: colors.danger }}>{error}</Text>
          <Pressable onPress={() => void load()} className="mt-3 self-start">
            <Text className="font-bold" style={{ color: colors.rose }}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      {notice ? <Text className="mb-4 text-xs font-semibold" style={{ color: colors.success }}>{notice}</Text> : null}

      {loading ? <View className="items-center py-16"><ActivityIndicator color={colors.rose} size="large" /></View> : null}
      {!loading && preferences ? (
        <>
          <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Choose a feed mode</Text>
          {MODES.map(item => {
            const active = preferences.mode === item.id;
            return (
              <Pressable key={item.id} disabled={saving} onPress={() => void save({ ...preferences, mode: item.id })} className="mb-2 flex-row items-center rounded-2xl border p-4" style={{ borderColor: active ? colors.crimson : colors.line, backgroundColor: active ? colors.wine : colors.panel }}>
                <View className="flex-1">
                  <Text className="font-bold" style={{ color: colors.text }}>{item.title}</Text>
                  <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>{item.detail}</Text>
                </View>
                <MaterialCommunityIcons name={active ? "radiobox-marked" : "radiobox-blank"} size={22} color={active ? colors.rose : colors.muted} />
              </Pressable>
            );
          })}

          <Text className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Tune your content sources</Text>
          <View className="rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            {SOURCES.map(([id, label], index) => {
              const value = Number(preferences.sourceWeights?.[id] ?? 50);
              return (
                <View key={id} className={index ? "mt-5" : ""}>
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="flex-1 text-sm font-semibold" style={{ color: colors.text }}>{label}</Text>
                    <Text className="text-xs font-bold" style={{ color: colors.rose }}>{value}/100</Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: colors.surface }}>
                    <View className="h-2 rounded-full" style={{ width: value + "%", backgroundColor: colors.crimson }} />
                  </View>
                  <View className="mt-2 flex-row justify-end">
                    <Pressable disabled={saving || value <= 0} onPress={() => void changeSource(id, -10)} className="mr-2 rounded-full border px-3 py-1" style={{ borderColor: colors.line, opacity: value <= 0 ? 0.4 : 1 }}>
                      <Text className="text-xs font-bold" style={{ color: colors.text }}>− Less</Text>
                    </Pressable>
                    <Pressable disabled={saving || value >= 100} onPress={() => void changeSource(id, 10)} className="rounded-full border px-3 py-1" style={{ borderColor: colors.line, opacity: value >= 100 ? 0.4 : 1 }}>
                      <Text className="text-xs font-bold" style={{ color: colors.rose }}>+ More</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>

          <Text className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Topics you control</Text>
          <View className="rounded-3xl border p-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
            {TOPICS.map(([id, label], index) => {
              const muted = preferences.mutedTopics.includes(id);
              const weight = Number(preferences.topicWeights?.[id] ?? 50);
              return (
                <View key={id} className={index ? "mt-4 border-t pt-4" : ""} style={index ? { borderColor: colors.line } : undefined}>
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold" style={{ color: muted ? colors.muted : colors.text }}>{label}</Text>
                      <Text className="mt-1 text-xs" style={{ color: colors.muted }}>{muted ? "Muted in your feed" : "Interest strength: " + weight + "/100"}</Text>
                    </View>
                    <Pressable disabled={saving} onPress={() => void changeTopic(muted ? "unmuteTopic" : "muteTopic", id)} className="rounded-full border px-3 py-2" style={{ borderColor: muted ? colors.crimson : colors.line, backgroundColor: muted ? colors.wine : "transparent" }}>
                      <Text className="text-xs font-semibold" style={{ color: muted ? colors.rose : colors.muted }}>{muted ? "Unmute" : "Mute"}</Text>
                    </Pressable>
                  </View>
                  {!muted ? (
                    <View className="mt-2 flex-row">
                      <Pressable disabled={saving} onPress={() => void changeTopic("lessTopic", id)} className="mr-2 rounded-full border px-3 py-1" style={{ borderColor: colors.line }}>
                        <Text className="text-xs" style={{ color: colors.muted }}>Show less</Text>
                      </Pressable>
                      <Pressable disabled={saving} onPress={() => void changeTopic("moreTopic", id)} className="rounded-full border px-3 py-1" style={{ borderColor: colors.line }}>
                        <Text className="text-xs" style={{ color: colors.rose }}>Show more</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          <View className="mb-6 mt-5 rounded-2xl p-4" style={{ backgroundColor: colors.surface }}>
            <Text className="text-xs leading-5" style={{ color: colors.muted }}>
              Muting a topic removes matching posts from your feed. Show more and Show less adjust ranking without hiding the topic completely.
            </Text>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
