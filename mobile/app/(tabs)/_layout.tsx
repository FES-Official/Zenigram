import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors } from "@/theme/colors";
const icons={index:"home-variant-outline",clips:"play-box-multiple-outline",create:"plus-box-outline",messages:"message-outline",profile:"account-circle-outline"} as const;
export default function TabLayout() {
  return <Tabs screenOptions={({route})=>({
    headerShown:false,tabBarHideOnKeyboard:true,
    tabBarActiveTintColor:colors.rose,tabBarInactiveTintColor:colors.muted,
    tabBarStyle:{backgroundColor:colors.panel,borderTopColor:colors.line,height:66,paddingTop:7,paddingBottom:8},
    tabBarLabelStyle:{fontSize:10,fontWeight:"600"},
    tabBarIcon:({color,size})=><MaterialCommunityIcons name={icons[route.name as keyof typeof icons]||"circle-outline"} color={color} size={size}/>
  })}>
    <Tabs.Screen name="index" options={{title:"Home"}}/>
    <Tabs.Screen name="clips" options={{title:"Clips"}}/>
    <Tabs.Screen name="create" options={{title:"Create"}}/>
    <Tabs.Screen name="messages" options={{title:"Messages"}}/>
    <Tabs.Screen name="profile" options={{title:"Profile"}}/>
  </Tabs>;
}
