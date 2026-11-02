import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "zenigram.access-token";
const REFRESH_TOKEN_KEY = "zenigram.refresh-token";
const USER_KEY = "zenigram.user";

export type MobileUser = { id:string; username:string; email?:string; profilePic?:string };
export type MobileSession = { accessToken:string; refreshToken:string; user:MobileUser };

export async function saveSession(session:MobileSession):Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user));
}
export async function getAccessToken():Promise<string|null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}
export async function clearSession():Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY)
  ]);
}
