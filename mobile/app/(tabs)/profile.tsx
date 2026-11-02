import { Text } from "react-native";
import { Screen } from "@/components/Screen";
import { FeaturePlaceholder } from "@/components/FeaturePlaceholder";
import { colors } from "@/theme/colors";
export default function ProfileScreen(){return <Screen><Text className="text-3xl font-black" style={{color:colors.text}}>Your profile</Text><FeaturePlaceholder eyebrow="Identity & privacy" title="Your account, your boundaries" description="Profile editing, hidden accounts, block/unblock requests, saved posts and clips, collections, supporter milestones, progression and privacy settings are included in the migration scope."/></Screen>;}
