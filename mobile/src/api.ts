import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const DEFAULT_API_URL = Platform.select({
  android: "http://10.0.2.2:4000",
  default: "http://localhost:4000",
});

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

const ACCESS_KEY = "bos.accessToken";
const REFRESH_KEY = "bos.refreshToken";
const DEVICE_ID_KEY = "bos.deviceId";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;
  const fresh = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await SecureStore.setItemAsync(DEVICE_ID_KEY, fresh);
  return fresh;
}

export async function persistSession(accessToken: string, refreshToken: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_KEY);
  await SecureStore.deleteItemAsync(REFRESH_KEY);
}

export async function getStoredAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

interface SendOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function send<T>(path: string, options: SendOptions = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Network error");
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = {};
  }
  if (!res.ok) {
    const msg =
      (json as { message?: string })?.message ??
      (json as { error?: { message?: string } })?.error?.message ??
      `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return json as T;
}

let refreshing: Promise<boolean> | null = null;

async function refreshOnce(): Promise<boolean> {
  const refreshToken = await getStoredRefreshToken();
  if (!refreshToken) return false;
  const deviceId = await getDeviceId();
  try {
    const res = await send<{ data: { accessToken: string; refreshToken: string } }>(
      "/api/v1/auth/refresh",
      { method: "POST", body: { refreshToken, deviceId } }
    );
    await persistSession(res.data.accessToken, res.data.refreshToken);
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return send<T>(path, { method: options.method, body: options.body });
}

export async function authRequest<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const access = await getStoredAccessToken();
  const attempt = (tok?: string | null) => send<T>(path, { method: options.method, body: options.body, token: tok });
  try {
    return await attempt(access);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      refreshing = refreshing ?? refreshOnce();
      const ok = await refreshing;
      refreshing = null;
      if (!ok) throw err;
      const fresh = await getStoredAccessToken();
      return attempt(fresh);
    }
    throw err;
  }
}