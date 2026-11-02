import { Text } from "react-native";
import { Screen } from "@/components/Screen";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { colors } from "@/theme/colors";
export default function ClipsScreen(){return <Screen><Text className="text-3xl font-black" style={{color:colors.text}}>Clips</Text><FeaturePlaceholder eyebrow="Short-form video" title="A native-first viewing experience" description="Preserve the clip timeline, multi-asset uploads, trim points, filters, text layers, topics, audience controls and engagement."/></Screen>;}
