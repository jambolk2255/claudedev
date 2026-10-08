import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { ProductSearch } from "@/components/product-search";
import { ScannerModal } from "@/components/scanner";
import { Body, Button, Card, Divider, Empty, Screen, Segmented, Small } from "@/components/ui";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { today } from "@/lib/orders";
import { radius, space, useTheme } from "@/lib/theme";
import type { Product } from "@/lib/types";
import { useWarehouses } from "@/lib/use-warehouses";

type Line = { product: Product; counted: string };

/** Walk the shelves: scan each item (every scan adds one) or type the counted quantity, then post a stock count. */
export default function CountScreen() {
  const { t, qty } = useI18n();
  const c = useTheme();
  const qc = useQueryClient();
  const { warehouses, warehouseId, setWarehouseId } = useWarehouses();
  const [lines, setLines] = useState<Line[]>([]);
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  function add(p: Product, by = 1) {
    if (p.type !== "stock") return Alert.alert(t("count.serviceTitle"), t("count.service", { name: p.name }));
    setLines((ls) => {
      const existing = ls.find((l) => l.product.id === p.id);
      if (existing) return ls.map((l) => (l.product.id === p.id ? { ...l, counted: String((Number(l.counted) || 0) + by) } : l));
      return [{ product: p, counted: String(by) }, ...ls];
    });
  }

  async function onScan(code: string) {
    setScanning(false);
    try {
      add(await api<Product>(`/products/lookup?code=${encodeURIComponent(code)}`));
      setTimeout(() => setScanning(true), 400);
    } catch {
      Alert.alert(t("scan.notFoundTitle"), t("scan.notFound", { code }));
    }
  }

  async function submit() {
    if (!lines.length) return;
    setBusy(true);
    try {
      const doc = await api<{ number: string }>("/stock/documents", {
        method: "POST",
        body: { type: "count", warehouseId, documentDate: today(), lines: lines.map((l) => ({ productId: l.product.id, quantity: Number(l.counted) || 0 })) },
      });
      await qc.invalidateQueries({ queryKey: ["stock"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      Alert.alert(t("count.posted", { number: doc.number }), undefined, [{ text: "OK", onPress: () => router.back() }]);
    } catch (err) {
      Alert.alert(t("common.error"), isApiError(err) ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <Small>{t("count.intro")}</Small>
      {warehouses.length > 1 && (
        <Segmented value={warehouseId} onChange={setWarehouseId} options={warehouses.slice(0, 4).map((w) => ({ value: w.id, label: w.code }))} />
      )}
      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button title={t("count.scan")} icon="scan-outline" onPress={() => setScanning(true)} style={{ flex: 1 }} />
        <Button title={t("count.add")} icon="search-outline" variant="outline" onPress={() => setPicking(true)} style={{ flex: 1 }} />
      </View>
      {lines.length === 0 ? (
        <Empty icon="clipboard-outline" title={t("count.empty")} body={t("count.emptyBody")} />
      ) : (
        <Card style={{ gap: 0, paddingVertical: space(1) }}>
          {lines.map((l, i) => {
            const variance = (Number(l.counted) || 0) - l.product.onHand;
            return (
              <View key={l.product.id}>
                {i > 0 && <Divider />}
                <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3) }}>
                  <View style={{ flex: 1 }}>
                    <Body numberOfLines={1} style={{ fontWeight: "500" }}>
                      {l.product.name}
                    </Body>
                    <Small>
                      {warehouses.length <= 1 ? t("count.system", { qty: qty(l.product.onHand) }) : l.product.sku}
                      {warehouses.length <= 1 && variance !== 0 && (
                        <Small style={{ color: variance > 0 ? c.success : c.danger }}>{`  ${variance > 0 ? "+" : ""}${qty(variance)}`}</Small>
                      )}
                    </Small>
                  </View>
                  <TextInput
                    value={l.counted}
                    onChangeText={(v) => setLines((ls) => ls.map((x) => (x.product.id === l.product.id ? { ...x, counted: v } : x)))}
                    keyboardType="decimal-pad"
                    accessibilityLabel={t("count.counted")}
                    style={{
                      width: 72,
                      height: 42,
                      textAlign: "center",
                      borderWidth: 1,
                      borderColor: c.border,
                      borderRadius: radius.sm,
                      color: c.text,
                      fontSize: 17,
                      fontWeight: "600",
                    }}
                  />
                  <Pressable
                    onPress={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}
                    hitSlop={8}
                    accessibilityLabel={t("common.remove")}
                  >
                    <Ionicons name="close-circle" size={22} color={c.muted} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </Card>
      )}
      {lines.length > 0 && <Button title={t("count.post", { count: lines.length })} size="lg" loading={busy} onPress={submit} />}
      <ScannerModal
        visible={scanning}
        title={t("count.scanTitle", { count: lines.length })}
        onClose={() => setScanning(false)}
        onScan={(code) => void onScan(code)}
      />
      <ProductSearch
        visible={picking}
        warehouseId={warehouseId}
        stockOnly
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          add(p, 0);
        }}
      />
    </Screen>
  );
}
