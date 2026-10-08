import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { Badge, Body, Card, Divider, H1, H2, ListRow, Loading, Screen, Small } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { space } from "@/lib/theme";
import type { ProductDetail } from "@/lib/types";

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, qty, money, date } = useI18n();
  const q = useQuery({ queryKey: ["products", "detail", id], queryFn: () => api<ProductDetail>(`/products/${id}`) });
  const p = q.data;
  if (!p) return <Loading />;
  const low = p.reorderLevel !== null && p.onHand <= Number(p.reorderLevel);

  return (
    <Screen edges={[]} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ gap: space(1) }}>
        <Small>{[p.sku, p.barcode, p.category?.name].filter(Boolean).join(" · ")}</Small>
        <H1>{p.name}</H1>
        <View style={{ flexDirection: "row", gap: space(2) }}>
          {p.type === "service" ? (
            <Badge label={t("stock.service")} tone="muted" />
          ) : p.onHand <= 0 ? (
            <Badge label={t("stock.out")} tone="danger" />
          ) : low ? (
            <Badge label={t("stock.low")} tone="warning" />
          ) : (
            <Badge label={t("product.inStock")} tone="success" />
          )}
          {p.trackBatches && <Badge label={t("product.batches")} tone="muted" />}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: space(3) }}>
        <Card style={{ flex: 1 }}>
          <Small>{t("product.onHand")}</Small>
          <H2>
            {qty(p.onHand)} {p.unit?.code ?? ""}
          </H2>
        </Card>
        <Card style={{ flex: 1 }}>
          <Small>{t("product.price")}</Small>
          <H2>{money(p.sellPrice)}</H2>
        </Card>
      </View>
      {p.levels.length > 0 && (
        <Card style={{ paddingVertical: space(1) }}>
          <Body muted style={{ paddingTop: space(2) }}>
            {t("product.byWarehouse")}
          </Body>
          {p.levels.map((l, i) => (
            <View key={l.warehouse.id}>
              {i > 0 && <Divider />}
              <ListRow icon="business-outline" title={l.warehouse.name} subtitle={l.warehouse.code} right={qty(l.quantity)} rightSub={money(l.value)} />
            </View>
          ))}
        </Card>
      )}
      {p.batches.length > 0 && (
        <Card style={{ paddingVertical: space(1) }}>
          <Body muted style={{ paddingTop: space(2) }}>
            {t("product.batchList")}
          </Body>
          {p.batches.map((b, i) => (
            <View key={b.id}>
              {i > 0 && <Divider />}
              <ListRow
                title={b.batchNo}
                subtitle={b.expiryDate ? t("product.expires", { date: date(b.expiryDate) }) : undefined}
                right={qty(b.balances.reduce((s, x) => s + Number(x.quantity), 0))}
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
