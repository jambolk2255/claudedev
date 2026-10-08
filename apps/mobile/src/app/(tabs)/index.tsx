import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { Badge, Body, Card, Divider, H1, H2, ListRow, Screen, Small, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";
import type { StockAlert, StockSummary } from "@/lib/types";

export default function HomeScreen() {
  const { t, compactMoney } = useI18n();
  const { user, can } = useAuth();
  const c = useTheme();
  const inventory = can("inventory.view");
  const summary = useQuery({ queryKey: ["stock", "summary"], queryFn: () => api<StockSummary>("/stock/summary"), enabled: inventory });
  const alerts = useQuery({ queryKey: ["stock", "alerts"], queryFn: () => api<StockAlert[]>("/stock/alerts"), enabled: inventory });
  const modules = user?.organization.modules ?? [];
  const hour = new Date().getHours();

  const actions = [
    { key: "scan", icon: "scan" as const, label: t("home.scan"), onPress: () => router.navigate("/(tabs)/scan"), show: true },
    { key: "count", icon: "clipboard" as const, label: t("home.count"), onPress: () => router.push("/count"), show: can("inventory.count") },
    {
      key: "sale",
      icon: "cart" as const,
      label: t("home.sale"),
      onPress: () => router.push("/sale"),
      show: modules.includes("sales") && can("sales.dispatch"),
    },
    {
      key: "receive",
      icon: "download" as const,
      label: t("home.receive"),
      onPress: () => router.navigate("/(tabs)/orders"),
      show: modules.includes("purchasing") && can("purchasing.receive"),
    },
  ].filter((a) => a.show);

  return (
    <Screen
      refreshing={summary.isRefetching}
      onRefresh={() => {
        void summary.refetch();
        void alerts.refetch();
      }}
    >
      <View style={{ gap: 2, marginBottom: space(2) }}>
        <Small>{user?.organization.name}</Small>
        <H1>{t(hour < 12 ? "home.morning" : hour < 17 ? "home.afternoon" : "home.evening", { name: user?.name.split(" ")[0] ?? "" })}</H1>
      </View>

      {user?.subscription?.readOnly && (
        <Card style={{ backgroundColor: c.dangerSoft, borderColor: c.danger }}>
          <Body style={{ color: c.danger, fontWeight: "600" }}>{t(user.subscription.blocked ? "home.suspended" : "home.readOnly")}</Body>
        </Card>
      )}

      {inventory && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
          <Stat icon="cash-outline" label={t("home.stockValue")} value={summary.data ? compactMoney(summary.data.stockValue) : "…"} />
          <Stat
            icon="warning-outline"
            label={t("home.alerts")}
            value={summary.data ? String(summary.data.lowStock + summary.data.outOfStock + summary.data.expiring) : "…"}
            tone={summary.data && summary.data.outOfStock > 0 ? "danger" : summary.data && summary.data.lowStock > 0 ? "warning" : undefined}
          />
        </View>
      )}

      <H2 style={{ marginTop: space(2) }}>{t("home.quick")}</H2>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(3) }}>
        {actions.map((a) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            style={({ pressed }) => ({
              width: "47%",
              flexGrow: 1,
              backgroundColor: c.card,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: c.border,
              padding: space(4),
              gap: space(3),
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Ionicons name={a.icon} size={20} color={c.primary} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "600", color: c.text }}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {inventory && (
        <>
          <H2 style={{ marginTop: space(2) }}>{t("home.stockAlerts")}</H2>
          <Card style={{ paddingVertical: space(1) }}>
            {alerts.data?.length === 0 && (
              <Body muted style={{ paddingVertical: space(3) }}>
                {t("home.allGood")}
              </Body>
            )}
            {alerts.data?.slice(0, 8).map((a, i) => (
              <View key={`${a.productId}-${a.type}-${a.batchNo ?? ""}-${i}`}>
                {i > 0 && <Divider />}
                <ListRow
                  title={a.name}
                  subtitle={[a.sku, a.batchNo, a.warehouseName].filter(Boolean).join(" · ")}
                  rightSub={
                    <Badge
                      label={t(`alert.${a.type}`)}
                      tone={a.type === "low_stock" || a.type === "expiring" ? "warning" : a.type === "overstock" ? "muted" : "danger"}
                    />
                  }
                  onPress={() => router.push(`/product/${a.productId}`)}
                />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
