import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { ScannerModal } from "@/components/scanner";
import { Body, Button, Card, Divider, Field, H1, ListRow, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { isApiError } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";
import type { Product } from "@/lib/types";

/** Scan or type a barcode / SKU to open the product. */
export default function ScanScreen() {
  const { t, qty } = useI18n();
  const c = useTheme();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Product[]>([]);

  async function lookup(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const p = await api<Product>(`/products/lookup?code=${encodeURIComponent(trimmed)}`);
      setRecent((r) => [p, ...r.filter((x) => x.id !== p.id)].slice(0, 10));
      setCode("");
      router.push(`/product/${p.id}`);
    } catch (err) {
      Alert.alert(
        t("scan.notFoundTitle"),
        isApiError(err) && err.status === 404 ? t("scan.notFound", { code: trimmed }) : isApiError(err) ? err.message : t("common.error"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>{t("scan.title")}</H1>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          backgroundColor: c.primary,
          borderRadius: 20,
          paddingVertical: space(10),
          alignItems: "center",
          gap: space(3),
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Ionicons name="scan" size={56} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>{t("scan.tap")}</Text>
      </Pressable>
      <Card>
        <Field
          label={t("scan.manual")}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          onSubmitEditing={() => void lookup(code)}
          returnKeyType="search"
        />
        <Button title={t("scan.find")} variant="outline" onPress={() => void lookup(code)} loading={busy} disabled={!code.trim()} />
      </Card>
      {recent.length > 0 && (
        <Card style={{ paddingVertical: space(1) }}>
          <Body muted style={{ paddingTop: space(2) }}>
            {t("scan.recent")}
          </Body>
          {recent.map((p, i) => (
            <View key={p.id}>
              {i > 0 && <Divider />}
              <ListRow title={p.name} subtitle={p.sku} right={qty(p.onHand)} onPress={() => router.push(`/product/${p.id}`)} />
            </View>
          ))}
        </Card>
      )}
      <ScannerModal
        visible={open}
        onClose={() => setOpen(false)}
        onScan={(value) => {
          setOpen(false);
          void lookup(value);
        }}
      />
    </Screen>
  );
}
