import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Screen } from "@/components/Screen";
import { api, getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

type Creator = {
  _id: string;
  username: string;
  fullname?: string;
  profilePic?: string;
  ishidden?: boolean;
  supportersCount?: number;
  mutualCount?: number;
  mutualSupporters?: Array<{ _id: string; username: string; profilePic?: string }>;
};

type SearchResponse = { users?: Creator[] };
type SuggestionsResponse = { suggestions?: Creator[] };

function CreatorRow({
  creator,
  hint,
}: {
  creator: Creator;
  hint?: string;
}) {
  const username = creator.username || "creator";
  return (
    <Pressable
      onPress={() => router.push("/profile/" + encodeURIComponent(username))}
      accessibilityRole="button"
      accessibilityLabel={"View @" + username}
      className="mb-3 flex-row items-center rounded-2xl border p-3"
      style={{ backgroundColor: colors.panel, borderColor: colors.line }}
    >
      {creator.profilePic ? (
        <Image source={{ uri: creator.profilePic }} className="h-12 w-12 rounded-full" />
      ) : (
        <View className="h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: colors.wine }}>
          <Text className="text-lg font-black" style={{ color: colors.rose }}>{username.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      <View className="ml-3 min-w-0 flex-1">
        <Text numberOfLines={1} className="text-sm font-bold" style={{ color: colors.text }}>
          {creator.fullname || username}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-xs" style={{ color: colors.muted }}>@{username}</Text>
        {hint ? <Text numberOfLines={1} className="mt-1 text-xs" style={{ color: colors.rose }}>{hint}</Text> : null}
      </View>
      {creator.ishidden ? (
        <MaterialCommunityIcons name="lock-outline" size={17} color={colors.muted} />
      ) : null}
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.muted} />
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Creator[]>([]);
  const [suggestions, setSuggestions] = useState<Creator[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [error, setError] = useState("");

  const loadSuggestions = useCallback(async () => {
    setLoadingSuggestions(true);
    try {
      const { data } = await api.get<SuggestionsResponse>("/api/support-suggestions");
      setSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setLoadingSuggestions(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadSuggestions();
    return undefined;
  }, [loadSuggestions]));

  useEffect(() => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let active = true;
    const timeout = setTimeout(async () => {
      setSearching(true);
      setError("");
      try {
        const { data } = await api.get<SearchResponse>("/api/search/users", {
          params: { q: cleanQuery },
        });
        if (active) setResults(Array.isArray(data?.users) ? data.users : []);
      } catch (caught) {
        if (active) {
          setResults([]);
          setError(getApiErrorMessage(caught));
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  const showingSearch = query.trim().length >= 2;

  return (
    <Screen>
      <View className="mb-5 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          className="mr-3 h-10 w-10 items-center justify-center rounded-full border"
          style={{ backgroundColor: colors.panel, borderColor: colors.line }}
        >
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-xs font-bold uppercase tracking-widest" style={{ color: colors.rose }}>FIND YOUR PEOPLE</Text>
          <Text className="mt-1 text-2xl font-black" style={{ color: colors.text }}>Discover</Text>
        </View>
      </View>

      <View className="mb-5 flex-row items-center rounded-2xl border px-4" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
        <MaterialCommunityIcons name="magnify" size={21} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search usernames..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={50}
          className="min-h-12 flex-1 px-3 text-sm"
          style={{ color: colors.text }}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear search">
            <MaterialCommunityIcons name="close-circle" size={19} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View className="mb-4 rounded-2xl border p-3" style={{ backgroundColor: colors.panel, borderColor: colors.danger }}>
          <Text className="text-sm" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : null}

      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {showingSearch ? (
          <>
            <Text className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: colors.muted }}>Search results</Text>
            {searching ? (
              <View className="items-center py-8"><ActivityIndicator color={colors.rose} /></View>
            ) : results.length ? (
              results.map(creator => <CreatorRow key={creator._id} creator={creator} hint="Open creator profile" />)
            ) : (
              <View className="rounded-2xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
                <Text className="text-sm" style={{ color: colors.muted }}>No creators found. Try another username.</Text>
              </View>
            )}
          </>
        ) : (
          <>
            <View className="mb-4">
              <Text className="text-lg font-bold" style={{ color: colors.text }}>People to support</Text>
              <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>
                Suggestions are ranked using mutual support, creator activity and account reach. You choose who becomes part of your circle.
              </Text>
            </View>
            {loadingSuggestions ? (
              <View className="items-center py-8"><ActivityIndicator color={colors.rose} /></View>
            ) : suggestions.length ? (
              suggestions.map(creator => (
                <CreatorRow
                  key={creator._id}
                  creator={creator}
                  hint={creator.mutualCount
                    ? creator.mutualCount + " mutual supporter" + (creator.mutualCount === 1 ? "" : "s")
                    : Number(creator.supportersCount || 0).toLocaleString() + " supporters"}
                />
              ))
            ) : (
              <View className="rounded-2xl border p-5" style={{ backgroundColor: colors.panel, borderColor: colors.line }}>
                <Text className="text-sm font-semibold" style={{ color: colors.text }}>No suggestions right now</Text>
                <Text className="mt-1 text-xs leading-5" style={{ color: colors.muted }}>Search for a creator by username to discover them.</Text>
              </View>
            )}
          </>
        )}
        <View className="h-8" />
      </ScrollView>
    </Screen>
  );
}
