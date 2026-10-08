import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, Text, TextInput, View, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";
import type { Paginated, Product } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";
import { Divider, ListRow } from "./ui";

/** Searchable product picker in a sheet-style modal. */
export function ProductSearch({
  visible,
  onClose,
  onPick,
  warehouseId,
  stockOnly,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (p: Product) => void;
  warehouseId?: string;
  stockOnly?: boolean;
}) {
  const { t, qty, money } = useI18n();
  const c = useTheme();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const results = useQuery({
    queryKey: ["products", "picker", q, warehouseId],
    enabled: visible,
    queryFn: () =>
      api<Paginated<Product>>(`/products?pageSize=30${q ? `&search=${encodeURIComponent(q)}` : ""}${warehouseId ? `&warehouseId=${warehouseId}` : ""}`),
  });
  const items = (results.data?.items ?? []).filter((p) => !stockOnly || p.type === "stock");
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space(3), padding: space(4) }}>
          <TextInput
            autoFocus
            value={search}
            onChangeText={setSearch}
            placeholder={t("stock.search")}
            placeholderTextColor={c.muted}
            autoCorrect={false}
            style={{
              flex: 1,
              height: 44,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              paddingHorizontal: space(3),
              fontSize: 16,
              color: c.text,
            }}
          />
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={{ color: c.primary, fontSize: 16, fontWeight: "600" }}>{t("common.close")}</Text>
          </Pressable>
        </View>
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: space(4) }}
          ItemSeparatorComponent={Divider}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={`${item.sku} · ${money(item.sellPrice)}`}
              right={item.type === "stock" ? qty(item.onHand) : undefined}
              onPress={() => {
                onPick(item);
                setSearch("");
              }}
            />
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}
