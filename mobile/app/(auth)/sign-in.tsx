import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { signInWithPassword } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

export default function SignInScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!identifier.trim() || !password) {
      setError("Enter your username/email and password.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await signInWithPassword(identifier.trim(), password);
      router.replace("/(tabs)");
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView
        className="flex-1 justify-center"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="mb-10">
          <View
            className="mb-8 h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.wine }}
          >
            <Text className="text-2xl font-black" style={{ color: colors.rose }}>
              Z
            </Text>
          </View>

          <Text className="text-4xl font-black tracking-tight" style={{ color: colors.text }}>
            Your world.
          </Text>

          <Text className="mt-3 text-base" style={{ color: colors.muted }}>
            Log into your Zenigram account.
          </Text>
        </View>

        <View className="space-y-4">
          <View
            className="rounded-2xl border p-3"
            style={{ backgroundColor: colors.panel, borderColor: colors.line }}
          >
            <Text
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: colors.muted }}
            >
              Username or email
            </Text>
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="username or email"
              placeholderTextColor={colors.muted}
              className="text-base"
              style={{ color: colors.text }}
            />
          </View>

          <View
            className="rounded-2xl border p-3"
            style={{ backgroundColor: colors.panel, borderColor: colors.line }}
          >
            <Text
              className="mb-2 text-xs font-bold uppercase tracking-widest"
              style={{ color: colors.muted }}
            >
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="password"
              placeholderTextColor={colors.muted}
              className="text-base"
              style={{ color: colors.text }}
            />
          </View>

          {error ? (
            <Text className="text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={busy}
            className="mt-2 rounded-2xl px-4 py-4"
            style={{
              backgroundColor: busy ? colors.wine : colors.rose,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? (
              <View className="flex-row items-center justify-center">
                <ActivityIndicator color={colors.text} />
                <Text className="ml-2 text-base font-bold" style={{ color: colors.text }}>
                  Signing in...
                </Text>
              </View>
            ) : (
              <Text className="text-center text-base font-bold" style={{ color: colors.text }}>
                Sign in
              </Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
