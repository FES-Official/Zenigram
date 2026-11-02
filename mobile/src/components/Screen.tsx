import type { PropsWithChildren } from "react";
import { SafeAreaView, ScrollView, View } from "react-native";
import { colors } from "@/theme/colors";

export function Screen({children,scroll=true}:PropsWithChildren<{scroll?:boolean}>) {
  const content = <View className="flex-1 px-5 pt-4" style={{backgroundColor:colors.background}}>{children}</View>;
  return (
    <SafeAreaView className="flex-1" style={{backgroundColor:colors.background}}>
      {scroll ? <ScrollView className="flex-1" contentContainerStyle={{flexGrow:1,paddingBottom:28}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}
