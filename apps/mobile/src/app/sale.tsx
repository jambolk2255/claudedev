import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { ProductSearch } from "@/components/product-search";
import { ScannerModal } from "@/components/scanner";
import { Body, Button, Card, Divider, Empty, H2, Screen, Segmented, Small } from "@/components/ui";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { calcLine } from "@/lib/orders";
import { radius, space, useTheme } from "@/lib/theme";
import type { CashAccount, Product, TaxRate } from "@/lib/types";
import { useWarehouses } from "@/lib/use-warehouses";

type Line = { product: Product; qty: number };
type Method = "cash" | "card" | "bank_transfer";

/** Counter sale: invoice, stock issue and payment in one step (walk-in customer). */
export default function SaleScreen() {
  const { t, money } = useI18n();
  const c = useTheme();
  const qc = useQueryClient();
  const { warehouseId } = useWarehouses();
  const taxes = useQuery({ queryKey: ["tax-rates"], queryFn: () => api<TaxRate[]>("/tax-rates") });
  const accounts = useQuery({ queryKey: ["finance", "accounts"], queryFn: () => api<CashAccount[]>("/finance/accounts") });
  const [lines, setLines] = useState<Line[]>([]);
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState("");
  const [scanning, setScanning] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);

  const sscl = Number(taxes.data?.find((x) => x.code === "SSCL")?.rate ?? 0);
  const rate = (p: Product) => Number(taxes.data?.find((x) => x.id === p.taxRateId)?.rate ?? 0);
  const amounts = lines.map((l) => calcLine(l.qty, Number(l.product.sellPrice), rate(l.product), sscl));
  const total = Math.round(amounts.reduce((s, a) => s + a.total, 0) * 100) / 100;
  const paid = Number(tendered) || 0;
  const change = Math.max(0, Math.round((paid - total) * 100) / 100);

  function add(p: Product) {
    setLines((ls) =>
      ls.some((l) => l.product.id === p.id) ? ls.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { product: p, qty: 1 }],
    );
  }

  async function onScan(code: string) {
    setScanning(false);
    try {
      add(await api<Product>(`/products/lookup?code=${encodeURIComponent(code)}`));
    } catch {
      Alert.alert(t("scan.notFoundTitle"), t("scan.notFound", { code }));
    }
  }

  async function charge() {
    const cash = (accounts.data ?? []).filter((a) => a.isCash && a.active);
    const account = (method === "cash" ? cash.find((a) => /cash/i.test(a.name)) : cash.find((a) => !/cash/i.test(a.name))) ?? cash[0];
    if (!account) return Alert.alert(t("sale.noAccount"));
    if (method === "cash" && tendered && paid < total) return Alert.alert(t("sale.underpaid"));
    setBusy(true);
    try {
      const res = await api<{ number: string; total: number; change: number }>("/quick-sale", {
        method: "POST",
        body: {
          warehouseId,
          lines: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
          payment: { method, accountId: account.id, ...(method === "cash" && tendered ? { tendered: paid } : {}) },
        },
      });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["stock"] });
      Alert.alert(t("sale.done", { number: res.number }), res.change > 0 ? t("sale.giveChange", { amount: money(res.change) }) : money(res.total), [
        { text: t("sale.newSale"), onPress: () => (setLines([]), setTendered("")) },
        { text: t("common.close"), onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert(t("common.error"), isApiError(err) ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]}>
      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button title={t("sale.scan")} icon="scan-outline" onPress={() => setScanning(true)} style={{ flex: 1 }} />
        <Button title={t("sale.add")} icon="search-outline" variant="outline" onPress={() => setPicking(true)} style={{ flex: 1 }} />
      </View>
      {lines.length === 0 ? (
        <Empty icon="cart-outline" title={t("sale.empty")} />
      ) : (
        <Card style={{ gap: 0, paddingVertical: space(1) }}>
          {lines.map((l, i) => (
            <View key={l.product.id}>
              {i > 0 && <Divider />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), paddingVertical: space(3) }}>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1} style={{ fontWeight: "500" }}>
                    {l.product.name}
                  </Body>
                  <Small>
                    {l.qty} × {money(l.product.sellPrice)}
                  </Small>
                </View>
                <QtyButtons
                  onMinus={() => setLines((ls) => ls.flatMap((x) => (x.product.id !== l.product.id ? [x] : x.qty > 1 ? [{ ...x, qty: x.qty - 1 }] : [])))}
                  onPlus={() => add(l.product)}
                />
                <Text style={{ width: 90, textAlign: "right", fontWeight: "600", color: c.text, fontVariant: ["tabular-nums"] }}>
                  {money(amounts[i]!.subtotal)}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      )}

      <Card>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
          <H2>{t("sale.total")}</H2>
          <Text testID="sale-total" style={{ fontSize: 28, fontWeight: "800", color: c.text, fontVariant: ["tabular-nums"] }}>
            {money(total)}
          </Text>
        </View>
        <Small>{t("sale.taxNote")}</Small>
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: "cash", label: t("sale.cash") },
            { value: "card", label: t("sale.card") },
            { value: "bank_transfer", label: t("sale.bank") },
          ]}
        />
        {method === "cash" && (
          <View style={{ gap: space(2) }}>
            <TextInput
              value={tendered}
              onChangeText={setTendered}
              keyboardType="decimal-pad"
              placeholder={t("sale.tendered")}
              placeholderTextColor={c.muted}
              style={{ height: 48, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: space(3), fontSize: 18, color: c.text }}
            />
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
              <Small>{t("sale.change")}</Small>
              <Text style={{ fontSize: 18, fontWeight: "700", color: c.success, fontVariant: ["tabular-nums"] }}>{money(change)}</Text>
            </View>
          </View>
        )}
      </Card>
      <Button title={t("sale.charge", { amount: money(total) })} size="lg" loading={busy} disabled={!lines.length || !warehouseId} onPress={charge} />

      <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScan={(code) => void onScan(code)} />
      <ProductSearch
        visible={picking}
        warehouseId={warehouseId}
        onClose={() => setPicking(false)}
        onPick={(p) => {
          setPicking(false);
          add(p);
        }}
      />
    </Screen>
  );
}

function QtyButtons({ onMinus, onPlus }: { onMinus: () => void; onPlus: () => void }) {
  const c = useTheme();
  const b = (icon: "remove" | "add", onPress: () => void) => (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: c.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={16} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {b("remove", onMinus)}
      {b("add", onPlus)}
    </View>
  );
}
