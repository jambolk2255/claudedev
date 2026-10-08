import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Encrypted on device (Keychain / Android Keystore). Falls back to memory on web. */
const memory = new Map<string, string>();
const web = Platform.OS === "web";

export const storage = {
  get: (key: string) => (web ? Promise.resolve(memory.get(key) ?? null) : SecureStore.getItemAsync(key)),
  set: (key: string, value: string) => (web ? Promise.resolve(void memory.set(key, value)) : SecureStore.setItemAsync(key, value)),
  remove: (key: string) => (web ? Promise.resolve(void memory.delete(key)) : SecureStore.deleteItemAsync(key)),
};
