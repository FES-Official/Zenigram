import { Text,View } from "react-native";
import { Screen } from "@/components/Screen";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { colors } from "@/theme/colors";
export default function FeedScreen() {
  return <Screen>
    <View className="flex-row items-center justify-between">
      <View>
        <Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.rose}}>ZENIGRAM</Text>
        <Text className="mt-1 text-3xl font-black" style={{color:colors.text}}>Your feed</Text>
      </View>
      <View className="rounded-full border px-3 py-2" style={{borderColor:colors.line,backgroundColor:colors.panel}}>
        <Text className="text-xs font-semibold" style={{color:colors.rose}}>Feed controls</Text>
      </View>
    </View>
    <FeaturePlaceholder eyebrow="Feed Control Center" title="Your interests. Your rules." description="Balanced, Your circle, Latest, My interests and Discover will use the same saved preferences and transparent ranking rules as the web app."/>
  </Screen>;
}
