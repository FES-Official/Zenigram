import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { signInWithPassword } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/api";
import { colors } from "@/theme/colors";

export default function SignInScreen() {
  const [identifier,setIdentifier]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function submit() {
    if(!identifier.trim()||!password){setError("Enter your username/email and password.");return;}
    setBusy(true);setError("");
    try { await signInWithPassword(identifier.trim(),password);router.replace("/(tabs)"); }
    catch(caught){setError(getApiErrorMessage(caught));}
    finally{setBusy(false);}
  }
  return (
    <Screen scroll={false}>
      <KeyboardAvoidingView className="flex-1 justify-center" behavior={Platform.OS==="ios"?"padding":undefined}>
        <View className="mb-10">
          <View className="mb-8 h-14 w-14 items-center justify-center rounded-2xl" style={{backgroundColor:colors.wine}}>
            <Text className="text-2xl font-black" style={{color:colors.rose}}>Z</Text>
          </View>
          <Text className="text-4xl font-black tracking-tight" style={{color:colors.text}}>Your world.</Text>
          <Text className="text-4xl font-black tr¶»§q«^