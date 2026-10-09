import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** API keys live only in the Android Keystore / iOS Keychain — never in SQLite or backups. */
export type KeyName = "gemini" | "claude";

const memory = new Map<string, string>();
const web = Platform.OS === "web";
const k = (name: KeyName) => `agentx.key.${name}`;

export async function getKey(name: KeyName): Promise<string | null> {
  if (web) return memory.get(k(name)) ?? null;
  return SecureStore.getItemAsync(k(name));
}

export async function setKey(name: KeyName, value: string): Promise<void> {
  const v = value.trim();
  if (web) {
    if (v) memory.set(k(name), v);
    else memory.delete(k(name));
    return;
  }
  if (v) await SecureStore.setItemAsync(k(name), v);
  else await SecureStore.deleteItemAsync(k(name));
}

export const maskKey = (v: string | null) => (v ? `${v.slice(0, 6)}••••••${v.slice(-4)}` : "");
