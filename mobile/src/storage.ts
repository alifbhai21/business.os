import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * Platform-aware secure key/value storage for auth tokens and device identity.
 *
 * - Android/iOS/tvOS: `expo-secure-store` (encrypted Keystore / iOS Keychain).
 *   Behavior is identical to before this adapter existed.
 * - Web: `expo-secure-store` ships an empty browser stub (no web implementation,
 *   see https://docs.expo.dev/versions/v57.0.0/sdk/securestore/), so any call
 *   throws `TypeError: ExpoSecureStore.getValueWithKeyAsync is not a function`.
 *   Browsers have no OS keychain API, so we persist in `localStorage`, with an
 *   in-memory fallback for environments where storage access throws
 *   (e.g. blocked cookies/private mode). Values stay per-origin, same as
 *   cookies, and never leave the browser.
 */

interface KeyValueStore {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const nativeStore: KeyValueStore = {
  getItemAsync: (key) => SecureStore.getItemAsync(key),
  setItemAsync: (key, value) => SecureStore.setItemAsync(key, value),
  deleteItemAsync: (key) => SecureStore.deleteItemAsync(key),
};

function browserLocalStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    const probe = "__bos_probe__";
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function createWebStore(): KeyValueStore {
  const memory = new Map<string, string>();
  const storage = browserLocalStorage();

  return {
    async getItemAsync(key) {
      if (!storage) return memory.get(key) ?? null;
      return storage.getItem(key);
    },
    async setItemAsync(key, value) {
      if (!storage) {
        memory.set(key, value);
        return;
      }
      storage.setItem(key, value);
    },
    async deleteItemAsync(key) {
      if (!storage) {
        memory.delete(key);
        return;
      }
      storage.removeItem(key);
    },
  };
}

export const tokenStorage: KeyValueStore =
  Platform.OS === "web" ? createWebStore() : nativeStore;
