import "@/background";
import * as Notifications from "expo-notifications";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Loading } from "@/components/ui";
import type { Settings } from "@/core/types";
import { loadSettings, openDb } from "@/db";
import { registerBackgroundSync } from "@/background";
import { syncAll } from "@/integrations";
import { useT } from "@/lib/i18n";
import { AppLockGate } from "@/lib/lock";
import { SettingsProvider, useSettings } from "@/lib/settings";
import { useTheme } from "@/lib/theme";
import { rescheduleAll, setupNotifications } from "@/notifications";
import { handleNotificationResponse } from "@/services";

function Routes() {
  const c = useTheme();
  const { t } = useT();
  const { settings } = useSettings();

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.bg);
  }, [c.bg]);

  // Notification buttons and taps (also the one that launched the app).
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((r) => void handleNotificationResponse(r));
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        void Notifications.clearLastNotificationResponseAsync();
        void handleNotificationResponse(r);
      }
    });
    return () => sub.remove();
  }, []);

  // Re-sync systems whenever the app comes back to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && void syncAll());
    return () => sub.remove();
  }, []);

  // Reminder texts depend on language and times.
  useEffect(() => {
    void rescheduleAll(settings).catch(() => {});
  }, [settings.lang, settings.briefingTime, settings.reviewTime, settings.nagMinutes, settings.quietStart, settings.quietEnd, settings.hideOnLockScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    headerShadowVisible: false,
    contentStyle: { backgroundColor: c.bg },
  };
  return (
    <>
      <StatusBar style={c.dark ? "light" : "dark"} />
      <Stack screenOptions={{ ...header, headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="voice" options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade_from_bottom" }} />
        <Stack.Screen name="task/[id]" options={{ title: t("task.edit") }} />
        <Stack.Screen name="system/[id]" options={{ title: t("systems.title") }} />
        <Stack.Screen name="areas" options={{ title: t("areas.title") }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    void (async () => {
      await openDb();
      const s = await loadSettings();
      setSettings(s);
      await setupNotifications(s.lang).catch(() => false);
      await registerBackgroundSync().catch(() => {});
      void syncAll();
    })();
  }, []);

  return (
    <SafeAreaProvider>
      {settings ? (
        <SettingsProvider initial={settings}>
          <AppLockGate>
            <Routes />
          </AppLockGate>
        </SettingsProvider>
      ) : (
        <Loading />
      )}
    </SafeAreaProvider>
  );
}
