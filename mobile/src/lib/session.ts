import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "zenigram.access-token";
const REFRESH_TOKEN_KEY = "zenigram.refresh-token";
const USER_KEY = "zenigram.user";

export type MobileUser = {
  id: string;
  username: string;
  fullname?: string;
  email?: string;
  profilePic?: string;
  ishidden?: boolean;
};

export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  user: MobileUser;
  tokenType?: "Bearer";
  expiresIn?: number;
  refreshExpiresAt?: number;
};

export async function saveSession(session: MobileSession): Promise<void> {
  if (!session?.accessToken || !session?.refreshToken || !session?.user?.id) {
    throw new Error("Cannot store an incomplete Zenigram session.");
  }

  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user)),
  ]);
}

export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function getStoredUser(): Promise<MobileUser | null> {
  const value = await SecureStore.getItemAsync(USER_KEY);
  if (!value) return null;
  try {
    const user = JSON.parse(value) as MobileUser;
    return user?.id ? user : null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}
