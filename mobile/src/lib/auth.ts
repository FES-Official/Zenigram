import { api, assertApiConfigured } from "./api";
import { MobileSession, saveSession, clearSession } from "./session";

export async function signInWithPassword(identifier:string,password:string):Promise<MobileSession> {
  assertApiConfigured();
  // This mobile endpoint must be implemented in Next.js; never reuse NextAuth browser cookies.
  const {data} = await api.post<MobileSession>("/api/mobile/auth/login",{identifier,password});
  if (!data?.accessToken || !data?.refreshToken || !data?.user?.id) {
    throw new Error("The mobile authentication response is incomplete.");
  }
  await saveSession(data);
  return data;
}
export async function signOut():Promise<void> {
  try { await api.post("/api/mobile/auth/logout"); }
  finally { await clearSession(); }
}
