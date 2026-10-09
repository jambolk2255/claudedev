import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { BrandMark, Button, Card, Empty, H1, Screen, Small } from "@/components/ui";
import { relativeLabel } from "@/core/time";
import { repo } from "@/db";
import { useNow, useQuery } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

function Flow() {
  const c = useTheme();
  const box = (label: string, hub?: boolean) => (
    <View
      style={{
        flex: 1,
        paddingVertical: space(2.5),
        borderRadius: radius.sm,
        alignItems: "center",
        backgroundColor: hub ? c.primary : c.card2,
        borderWidth: 1,
        borderColor: hub ? c.primary : c.border,
      }}
    >
      <Text style={{ color: hub ? "#FFFFFF" : c.text, fontWeight: hub ? "800" : "500", fontSize: 12, textAlign: "center" }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {box("🎤\nAgent X")}
      <Ionicons name="swap-horizontal" size={16} color={c.muted} />
      {box("n8n", true)}
      <Ionicons name="swap-horizontal" size={16} color={c.muted} />
      {box("💼\nCRM · HR · Ads")}
    </View>
  );
}

export default function SystemsScreen() {
  const c = useTheme();
  const { t, lang } = useT();
  const now = useNow();
  const { data } = useQuery(async () => ({ systems: await repo.listSystems(), actions: await repo.listActions() }));
  const systems = data?.systems ?? [];

  return (
    <Screen>
      <View style={{ gap: 2, marginTop: space(2) }}>
        <BrandMark />
        <H1>{t("systems.title")}</H1>
      </View>
      <Card>
        <Small>{t("systems.how")}</Small>
        <Flow />
      </Card>
      {systems.length === 0 ? (
        <Empty icon="git-network-outline" title={t("systems.empty")} body={t("systems.emptyBody")} />
      ) : (
        systems.map((s) => {
          const actions = (data?.actions ?? []).filter((a) => a.systemId === s.id && a.enabled);
          const status = s.lastError ? `⚠ ${s.lastError}` : s.lastOkAt ? `● ${relativeLabel(s.lastOkAt, false, now, lang)}` : t("systems.never");
          const bits = [
            actions.length ? `${actions.length} actions` : "",
            s.events.length ? `${s.events.length} events` : "",
            s.inboxUrl ? "inbox" : "",
          ].filter(Boolean);
          return (
            <Pressable
              key={s.id}
              onPress={() => router.push({ pathname: "/system/[id]", params: { id: s.id } })}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: space(3),
                padding: space(3.5),
                borderRadius: radius.md,
                backgroundColor: c.card,
                borderWidth: 1,
                borderColor: c.border,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <View style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22 }}>{s.icon || "⚡"}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>{s.name}</Text>
                <Small>{bits.join(" · ") || "—"}</Small>
                <Text style={{ fontSize: 11, color: s.lastError ? c.danger : c.primaryBright }} numberOfLines={1}>
                  {status}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.muted} />
            </Pressable>
          );
        })
      )}
      <Button title={t("systems.add")} icon="add" variant="outline" onPress={() => router.push({ pathname: "/system/[id]", params: { id: "new" } })} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space(3),
          padding: space(3.5),
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.border,
          borderStyle: "dashed",
        }}
      >
        <Text style={{ fontSize: 22 }}>💬</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 15 }}>{t("more.whatsapp")}</Text>
          <Small>{t("more.soon")}</Small>
        </View>
      </View>
    </Screen>
  );
}
