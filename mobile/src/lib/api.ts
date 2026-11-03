import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from "axios";
import { router } from "expo-router";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  saveSession,
  type MobileSession,
} from "./session";

const baseURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");

export const api = axios.create({
  baseURL,
  timeout: 20000,
  headers: { Accept: "application/json" },
});

type RetriableRequest = InternalAxiosRequestConfig & {
  _zenigramRetried?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

api.interceptors.request.use(async config => {
  const token = await getAccessToken();
  if (token) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set("Authorization", "Bearer " + token);
  }
  return config;
});

async function refreshSession(): Promise<boolean> {
  try {
    if (!baseURL) return false;

    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      await clearSession();
      return false;
    }

    const response = await axios.post<MobileSession>(
      baseURL + "/api/mobile/auth/refresh",
      { refreshToken },
      {
        timeout: 20000,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Client": "zenigram-mobile",
        },
      },
    );

    const nextSession = response.data;
    if (!nextSession?.accessToken || !nextSession?.refreshToken || !nextSession?.user?.id) {
      throw new Error("The refresh response was incomplete.");
    }

    await saveSession(nextSession);
    return true;
  } catch {
    try {
      await clearSession();
    } catch {
      // Keep the failed refresh result deterministic even if secure storage fails.
    }
    return false;
  }
}

api.interceptors.response.use(
  response => response,
  async caught => {
    if (!axios.isAxiosError(caught)) throw caught;

    const error = caught as AxiosError;
    const original = error.config as RetriableRequest | undefined;
    const url = original?.url || "";
    const isAuthRequest = [
      "/api/mobile/auth/login",
      "/api/mobile/auth/refresh",
      "/api/mobile/auth/logout",
    ].some(path => url.includes(path));

    if (
      error.response?.status !== 401 ||
      !original ||
      original._zenigramRetried ||
      isAuthRequest
    ) {
      throw caught;
    }

    original._zenigramRetried = true;
    const pending = refreshPromise ?? (refreshPromise = refreshSession());
    const refreshed = await pending;
    if (refreshPromise === pending) refreshPromise = null;

    if (!refreshed) {
      router.replace("/(auth)/sign-in");
      throw caught;
    }

    const token = await getAccessToken();
    if (!token) {
      router.replace("/(auth)/sign-in");
      throw caught;
    }

    original.headers = AxiosHeaders.from(original.headers);
    original.headers.set("Authorization", "Bearer " + token);
    return api.request(original);
  },
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const e = error as AxiosError<{ message?: string; error?: string }>;
    if (!e.response) {
      return "Unable to reach Zenigram. Check your internet connection.";
    }
    return (
      e.response.data?.message ||
      e.response.data?.error ||
      "Zenigram returned an error (" + e.response.status + ")."
    );
  }

  return error instanceof Error ? error.message : "Something went wrong.";
}

export function assertApiConfigured(): void {
  if (!baseURL) {
    throw new Error("Set EXPO_PUBLIC_API_URL in mobile/.env before connecting the app.");
  }
}
