import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { getAccessToken } from "@/lib/session";
import { colors } from "@/theme/colors";

export default function IndexRoute() {
  const [signedIn,setSignedIn] = useState<boolean|null>(null);
  useEffect(() => {
    let active=true;
    getAccessToken().then(token=>{if(active)setSignedIn(Boolean(token));})
      .catch(()=>{if(active)setSignedIn(false);});
    return ()=>{active=false;};
  },[]);
  if(signedIn===null) return <View className="flex-1 items-center justify-center" style={{backgroundColor:colors.background}}><ActivityIndicator color={colors.rose}/></View>;
  return signedIn ? <Redirect href="/(tabs)"/> : <Redirect href="/(auth)/sign-in"/>;
}
