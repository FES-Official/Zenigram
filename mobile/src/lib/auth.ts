import { api, assertApiConfigured } from "./api";
import {
  clearSession,
  saveSession,
  type MobileSession,
} from "./session";

export async function signInWithPassword(
  identifier: string,
  password: string,
): Promise<MobileSession> {
  assertApiConfigured();

  const { data } = await api.post<MobileSession>(
    "/api/mobile/auth/login",
    { identifier, password },
    { headers: { "X-Device-Name": "Zenigram mobile" } },
  );

  if (!data?.accessToken || !data?.refreshToken || !data?.user?.id) {
    throw new Error("The mobile authentication response is incomplete.");
  }

  await saveSession(data);
  return data;
}

export async function signOut(): Promise<void> {
  try {
    await api.post("/api/mobile/auth/logout");
  } finally {
    await clearSession();
  }
}
