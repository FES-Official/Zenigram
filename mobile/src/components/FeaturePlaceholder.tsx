import { View, Text } from "react-native";
import { colors } from "@/theme/colors";

type Props = {eyebrow:string;title:string;description:string};
export function FeaturePlaceholder({eyebrow,title,description}:Props) {
  return (
    <View className="mt-6 rounded-3xl border p-5" style={{backgroundColor:colors.panel,borderColor:colors.line}}>
      <Text className="text-xs font-bold uppercase tracking-widest" style={{color:colors.rose}}>{eyebrow}</Text>
      <Text className="mt-3 text-xl font-bold" style={{color:colors.text}}>{title}</Text>
      <Text className="mt-2 text-sm leading-6" style={{color:colors.muted}}>{description}</Text>
      <View className="mt-5 h-1 overflow-hidden rounded-full" style={{backgroundColor:colors.surface}}>
        <View className="h-1 w-1/3 rounded-full" style={{backgroundColor:colors.crimson}} />
      </View>
      <Text className="mt-3 text-xs" style={{color:colors.muted}}>Native screen foundation · API integration pending</Text>
    </View>
  );
}
