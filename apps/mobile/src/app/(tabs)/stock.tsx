import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { FlatList, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Divider, Empty, H1, ListRow, Loading } from "@/components/ui";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";
import type { Paginated, Product } from "@/lib/types";
import { useDebounced } from "@/lib/use-debounced";

export default function StockScreen() {
  const { t, qty, money } = useI18n();
  const c = useTheme();
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);
  const products = useQuery({
    queryKey: ["products", "list", q],
    queryFn: () => api<Paginated<Product>>(`/products?pageSize=50${q ? `&search=${encodeURIComponent(q)}` : ""}`),
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top"]}>
      <View style={{ padding: space(4), gap: space(3) }}>
        <H1>{t("stock.title")}</H1>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("stock.search")}
          placeholderTextColor={c.muted}
          clearButtonMode="while-editing"
          autoCorrect={false}
          style={{
            height: 46,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
            paddingHorizontal: space(3.5),
            fontSize: 16,
            color: c.text,
          }}
        />
      </View>
      {products.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={products.data?.items ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: space(4), paddingBottom: space(10) }}
          ItemSeparatorComponent={Divider}
          refreshing={products.isRefetching}
          onRefresh={() => void products.refetch()}
          ListEmptyComponent={<Empty icon="cube-outline" title={t("stock.empty")} />}
          renderItem={({ item }) => {
            const low = item.type === "stock" && item.reorderLevel !== null && item.onHand <= Number(item.reorderLevel);
            return (
              <ListRow
                title={item.name}
                subtitle={`${item.sku} · ${money(item.sellPrice)}`}
                right={item.type === "stock" ? `${qty(item.onHand)} ${item.unit?.code ?? ""}` : t("stock.service")}
                rightSub={item.type === "stock" ? (item.onHand <= 0 ? t("stock.out") : low ? t("stock.low") : undefined) : undefined}
                onPress={() => router.push(`/product/${item.id}`)}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
