import axios, { AxiosError } from "axios";
import { getAccessToken } from "./session";

const baseURL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "");
export const api = axios.create({
  baseURL, timeout:20000, headers:{Accept:"application/json"}
});
api.interceptors.request.use(async config => {
  const token = await getAccessToken();
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});
export function getApiErrorMessage(error:unknown):string {
  if (axios.isAxiosError(error)) {
    const e = error as AxiosError<{message?:string;error?:string}>;
    if (!e.response) return "Unable to reach Zenigram. Check your internet connection.";
    return e.response.data?.message || e.response.data?.error || "Zenigram returned an error (" + e.response.status + ").";
  }
  return error instanceof Error ? error.message : "Something went wrong.";
}
export function assertApiConfigured():void {
  if (!baseURL) throw new Error("Set EXPO_PUBLIC_API_URL in mobile/.env before connecting the app.");
}
