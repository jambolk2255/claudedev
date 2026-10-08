import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ColorValue } from "react-native";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

export default function TabsLayout() {
  const { t } = useI18n();
  const c = useTheme();
  const icon =
    (name: React.ComponentProps<typeof Ionicons>["name"]) =>
    ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tabs.home"), tabBarIcon: icon("grid-outline") }} />
      <Tabs.Screen name="stock" options={{ title: t("tabs.stock"), tabBarIcon: icon("cube-outline") }} />
      <Tabs.Screen name="scan" options={{ title: t("tabs.scan"), tabBarIcon: icon("scan-outline") }} />
      <Tabs.Screen name="orders" options={{ title: t("tabs.orders"), tabBarIcon: icon("clipboard-outline") }} />
      <Tabs.Screen name="more" options={{ title: t("tabs.more"), tabBarIcon: icon("ellipsis-horizontal-circle-outline") }} />
    </Tabs>
  );
}
