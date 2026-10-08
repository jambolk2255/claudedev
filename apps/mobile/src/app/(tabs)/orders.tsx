import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Divider, Empty, H1, ListRow, Loading, Segmented } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import type { OrderSummary, Paginated } from "@/lib/types";
import { isOverdue } from "@/lib/orders";

/** Open orders to receive (supplier) or deliver (customer). */
export default function OrdersScreen() {
  const { t, money, date } = useI18n();
  const { can, user } = useAuth();
  const c = useTheme();
  const modules = user?.organization.modules ?? [];
  const kinds = (["purchase", "sales"] as const).filter((k) =>
    k === "purchase" ? modules.includes("purchasing") && can("purchasing.view") : modules.includes("sales") && can("sales.view"),
  );
  const [kind, setKind] = useState<"purchase" | "sales">(kinds[0] ?? "purchase");
  const orders = useQuery({
    queryKey: ["orders", "mobile", kind],
    enabled: kinds.length > 0,
    queryFn: async () => {
      const get = (status: string) => api<Paginated<OrderSummary>>(`/orders?kind=${kind}&status=${status}&pageSize=50`);
      const [a, b] = await Promise.all([get("confirmed"), get("partial")]);
      return [...a.items, ...b.items].sort((x, y) => (x.expectedDate ?? "9999").localeCompare(y.expectedDate ?? "9999"));
    },
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <View style={{ padding: space(4), gap: space(3) }}>
        <H1>{t("orders.title")}</H1>
        {kinds.length > 1 && (
          <Segmented
            value={kind}
            onChange={setKind}
            options={kinds.map((k) => ({ value: k, label: t(k === "purchase" ? "orders.toReceive" : "orders.toDeliver") }))}
          />
        )}
      </View>
      {kinds.length === 0 ? (
        <Empty icon="lock-closed-outline" title={t("orders.noAccess")} />
      ) : orders.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={orders.data ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(10) }}
          ItemSeparatorComponent={Divider}
          refreshing={orders.isRefetching}
          onRefresh={() => void orders.refetch()}
          ListEmptyComponent={<Empty icon="checkmark-done-outline" title={t(kind === "purchase" ? "orders.emptyReceive" : "orders.emptyDeliver")} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.partner.name}
              subtitle={`${item.number}${item.expectedDate ? ` · ${date(item.expectedDate)}` : ""}`}
              right={money(item.total)}
              rightSub={
                isOverdue(item) ? (
                  <Badge label={t("orders.overdue")} tone="danger" />
                ) : (
                  <Badge label={t(`status.${item.status}`)} tone={item.status === "partial" ? "warning" : "default"} />
                )
              }
              onPress={() => router.push(`/order/${item.id}`)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}
