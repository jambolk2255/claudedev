import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking, Pressable, Text, TextInput, View } from "react-native";
import { ScannerModal } from "@/components/scanner";
import { Badge, Body, Button, Card, Divider, H1, Loading, Screen, Small } from "@/components/ui";
import { api } from "@/lib/api";
import { isApiError, useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { isOverdue, today } from "@/lib/orders";
import { radius, space, useTheme } from "@/lib/theme";
import type { OrderDetail, Product } from "@/lib/types";

type Row = { qty: string; batchNo: string };

/** Order detail with goods receiving (GRN) or delivery for the open quantities. */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, qty, money, date } = useI18n();
  const { can } = useAuth();
  const c = useTheme();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["orders", "detail", id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const o = q.data;

  const open = (o?.lines ?? []).filter((l) => l.product.type === "stock" && Number(l.quantity) > Number(l.fulfilledQty));
  useEffect(() => {
    if (!o) return;
    setRows(Object.fromEntries(open.map((l) => [l.id, { qty: String(Number(l.quantity) - Number(l.fulfilledQty)), batchNo: "" }])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o?.id, o?.status]);

  if (!o) return <Loading />;
  const purchase = o.kind === "purchase";
  const canFulfil = (o.status === "confirmed" || o.status === "partial") && open.length > 0 && can(purchase ? "purchasing.receive" : "sales.dispatch");
  const set = (lineId: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [lineId]: { ...r[lineId]!, ...patch } }));

  async function onScan(code: string) {
    setScanning(false);
    try {
      const p = await api<Product>(`/products/lookup?code=${encodeURIComponent(code)}`);
      const line = open.find((l) => l.product.id === p.id);
      Alert.alert(
        line ? p.name : t("order.notOnOrder"),
        line ? t("order.scannedOk", { qty: rows[line.id]?.qty ?? "0" }) : t("order.notOnOrderBody", { name: p.name }),
      );
    } catch {
      Alert.alert(t("scan.notFoundTitle"), t("scan.notFound", { code }));
    }
  }

  async function submit() {
    const lines = open
      .filter((l) => Number(rows[l.id]?.qty) > 0)
      .map((l) => ({ orderLineId: l.id, quantity: Number(rows[l.id]!.qty), batchNo: rows[l.id]!.batchNo || null }));
    if (!lines.length) return Alert.alert(t("order.nothing"));
    if (purchase && open.some((l) => l.product.trackBatches && Number(rows[l.id]?.qty) > 0 && !rows[l.id]?.batchNo))
      return Alert.alert(t("order.batchRequired"));
    setBusy(true);
    try {
      const doc = await api<{ number: string }>(`/orders/${o!.id}/fulfil`, { method: "POST", body: { documentDate: today(), lines } });
      await qc.invalidateQueries({ queryKey: ["orders"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
      await qc.invalidateQueries({ queryKey: ["products"] });
      Alert.alert(t(purchase ? "order.received" : "order.delivered", { number: doc.number }), undefined, [{ text: "OK", onPress: () => router.back() }]);
    } catch (err) {
      Alert.alert(t("common.error"), isApiError(err) ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen edges={["bottom"]} refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ gap: space(1) }}>
        <Small>
          {o.number} · {date(o.orderDate)}
        </Small>
        <H1>{o.partner.name}</H1>
        <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
          <Badge label={t(`status.${o.status}`)} tone={o.status === "partial" ? "warning" : o.status === "fulfilled" ? "success" : "default"} />
          {isOverdue(o) && <Badge label={t("orders.overdue")} tone="danger" />}
          {o.expectedDate && <Badge label={t("order.expected", { date: date(o.expectedDate) })} tone="muted" />}
        </View>
      </View>

      <Card style={{ gap: space(1) }}>
        <Small>{t(purchase ? "order.receiveInto" : "order.shipFrom")}</Small>
        <Body>{o.warehouse.name}</Body>
        {o.deliveryAddress && (
          <>
            <Small style={{ marginTop: space(2) }}>{t("order.address")}</Small>
            <Body>{o.deliveryAddress}</Body>
          </>
        )}
        {o.partner.phone && (
          <Pressable
            onPress={() => void Linking.openURL(`tel:${o.partner.phone}`)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: space(2) }}
          >
            <Ionicons name="call-outline" size={16} color={c.primary} />
            <Text style={{ color: c.primary, fontWeight: "600" }}>{o.partner.phone}</Text>
          </Pressable>
        )}
      </Card>

      <Card style={{ gap: 0, paddingVertical: space(1) }}>
        {o.lines.map((l, i) => {
          const row = rows[l.id];
          const outstanding = Number(l.quantity) - Number(l.fulfilledQty);
          const editable = canFulfil && row && outstanding > 0 && l.product.type === "stock";
          return (
            <View key={l.id}>
              {i > 0 && <Divider />}
              <View style={{ paddingVertical: space(3), gap: space(2) }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
                  <View style={{ flex: 1 }}>
                    <Body style={{ fontWeight: "500" }}>{l.product.name}</Body>
                    <Small>
                      {l.product.sku} · {money(l.unitPrice)}
                    </Small>
                  </View>
                  <Small>
                    {t(purchase ? "order.receivedOf" : "order.deliveredOf", { done: qty(l.fulfilledQty), total: qty(l.quantity) })} {l.product.unit?.code ?? ""}
                  </Small>
                </View>
                {editable && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space(2) }}>
                    <Stepper value={row.qty} max={outstanding} onChange={(v) => set(l.id, { qty: v })} />
                    {(purchase ? l.product.trackBatches : false) && (
                      <TextInput
                        value={row.batchNo}
                        onChangeText={(v) => set(l.id, { batchNo: v })}
                        placeholder={t("order.batch")}
                        placeholderTextColor={c.muted}
                        autoCapitalize="characters"
                        style={{
                          flex: 1,
                          height: 40,
                          borderWidth: 1,
                          borderColor: c.border,
                          borderRadius: radius.sm,
                          paddingHorizontal: 10,
                          color: c.text,
                          backgroundColor: c.bg,
                        }}
                      />
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </Card>

      {canFulfil && (
        <View style={{ gap: space(2) }}>
          <Button title={t("order.checkWithScanner")} variant="outline" icon="scan-outline" onPress={() => setScanning(true)} />
          <Button
            title={t(purchase ? "order.postGrn" : "order.postDelivery")}
            icon={purchase ? "download-outline" : "car-outline"}
            size="lg"
            loading={busy}
            onPress={submit}
          />
        </View>
      )}
      <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScan={(code) => void onScan(code)} />
    </Screen>
  );
}

function Stepper({ value, max, onChange }: { value: string; max: number; onChange: (v: string) => void }) {
  const c = useTheme();
  const n = Number(value) || 0;
  const btn = (icon: "remove" | "add", next: number) => (
    <Pressable
      onPress={() => onChange(String(Math.max(0, Math.min(max, next))))}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: c.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {btn("remove", n - 1)}
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        style={{
          width: 64,
          height: 40,
          textAlign: "center",
          borderWidth: 1,
          borderColor: n > max ? c.danger : c.border,
          borderRadius: radius.sm,
          color: c.text,
          fontSize: 16,
          fontWeight: "600",
        }}
      />
      {btn("add", n + 1)}
    </View>
  );
}
