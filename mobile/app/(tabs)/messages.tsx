import { Text } from "react-native";
import { Screen } from "@/components/Screen";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { colors } from "@/theme/colors";
export default function MessagesScreen(){return <Screen><Text className="text-3xl font-black" style={{color:colors.text}}>Messages</Text><FeaturePlaceholder eyebrow="Conversations" title="Stay close, in real time" description="Direct messages, Close Ones groups, read receipts, media sharing and authenticated Socket.IO events need the mobile token and persistent realtime gateway first."/></Screen>;}
