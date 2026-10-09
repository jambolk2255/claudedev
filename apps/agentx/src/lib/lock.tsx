import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import { useT } from "./i18n";
import { useSettings } from "./settings";

/** Re-lock after the app has been in the background this long. */
const RELOCK_MS = 60_000;

/** True when the phone has a fingerprint/face or at least a screen-lock PIN/pattern to unlock with. */
export async function canLock(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
}

export async function authenticate(prompt: string): Promise<boolean> {
  if (Platform.OS === "web") return true;
  const res = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
  return res.success;
}

/** Covers the whole app until the user unlocks with fingerprint / phone PIN (when App lock is on). */
export function AppLockGate({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { t } = useT();
  const [locked, setLocked] = useState(settings.appLock);
  const backgroundAt = useRef<number | null>(null);
  const prompting = useRef(false);

  const unlock = useCallback(async () => {
    if (prompting.current) return;
    prompting.current = true;
    try {
      if (await authenticate(t("security.unlock"))) setLocked(false);
    } finally {
      prompting.current = false;
    }
  }, [t]);

  useEffect(() => {
    if (!settings.appLock) setLocked(false);
  }, [settings.appLock]);

  useEffect(() => {
    if (locked) void unlock();
  }, [locked, unlock]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") backgroundAt.current = Date.now();
      if (state === "active" && settings.appLock && backgroundAt.current && Date.now() - backgroundAt.current > RELOCK_MS) setLocked(true);
      if (state === "active") backgroundAt.current = null;
    });
    return () => sub.remove();
  }, [settings.appLock]);

  return (
    <View style={{ flex: 1 }}>
      {children}
      {locked ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "#0B0D12",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
          }}
        >
          <Text style={{ color: "#5B7CFF", fontSize: 14, fontWeight: "800", letterSpacing: 2 }}>AGENT X</Text>
          <Ionicons name="lock-closed" size={44} color="#FFFFFF" />
          <Text style={{ color: "#9AA3B5", fontSize: 15 }}>{t("security.locked")}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void unlock()}
            style={({ pressed }) => ({
              marginTop: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: "#2D5BFF",
              paddingHorizontal: 22,
              height: 52,
              borderRadius: 14,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Ionicons name="finger-print" size={22} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "600" }}>{t("security.unlock")}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
