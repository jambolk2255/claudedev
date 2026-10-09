import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Tabs, type BottomTabBarProps } from "expo-router/js-tabs";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { IconName } from "@/components/ui";
import { useT, type MessageKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

const TABS: { name: string; label: MessageKey; icon: IconName; active: IconName }[] = [
  { name: "index", label: "tabs.today", icon: "home-outline", active: "home" },
  { name: "upcoming", label: "tabs.upcoming", icon: "calendar-outline", active: "calendar" },
  { name: "systems", label: "tabs.systems", icon: "apps-outline", active: "apps" },
  { name: "more", label: "tabs.more", icon: "ellipsis-horizontal-circle-outline", active: "ellipsis-horizontal-circle" },
];

/** Bottom bar: two tabs · big centre mic · two tabs. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const c = useTheme();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;

  const tab = (def: (typeof TABS)[number]) => {
    const on = current === def.name;
    return (
      <Pressable
        key={def.name}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => navigation.navigate(def.name)}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingTop: 10 }}
      >
        <Ionicons name={on ? def.active : def.icon} size={23} color={on ? c.primaryBright : c.muted} />
        <Text style={{ fontSize: 11, color: on ? c.primaryBright : c.muted, fontWeight: on ? "600" : "400" }}>{t(def.label)}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: c.card,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingBottom: Math.max(insets.bottom, 10),
        height: 66 + Math.max(insets.bottom, 10),
      }}
    >
      {TABS.slice(0, 2).map(tab)}
      <View style={{ width: 88, alignItems: "center" }}>
        <Pressable
          accessibilityLabel="Agent X voice"
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/voice");
          }}
          style={({ pressed }) => ({
            width: 72,
            height: 72,
            borderRadius: 36,
            marginTop: -30,
            backgroundColor: c.primary,
            borderWidth: 5,
            borderColor: c.bg,
            alignItems: "center",
            justifyContent: "center",
            transform: [{ scale: pressed ? 0.94 : 1 }],
            shadowColor: c.primary,
            shadowOpacity: 0.5,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          })}
        >
          <Ionicons name="mic" size={32} color="#FFFFFF" />
        </Pressable>
      </View>
      {TABS.slice(2).map(tab)}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      {TABS.map((d) => (
        <Tabs.Screen key={d.name} name={d.name} />
      ))}
    </Tabs>
  );
}
