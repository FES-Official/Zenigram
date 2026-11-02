import { Text } from "react-native";
import { Screen } from "@/components/Screen";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { colors } from "@/theme/colors";
export default function CreateScreen(){return <Screen><Text className="text-3xl font-black" style={{color:colors.text}}>Create</Text><FeaturePlaceholder eyebrow="Create something" title="Posts · Stories · Clips" description="Native camera, gallery selection, editing tools and direct-to-S3 uploads will be connected here. The existing web editors remain untouched."/></Screen>;}
