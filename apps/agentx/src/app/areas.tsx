import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Button, Card, Chip, ChipRow, Field, Screen, Small } from "@/components/ui";
import type { Area } from "@/core/types";
import { countsByArea } from "@/core/views";
import { repo } from "@/db";
import { useQuery } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

const ICONS = ["💼", "🏪", "🎓", "🏠", "💳", "📈", "🛠", "❤️", "🏋️", "✈️", "👥", "📚", "🎯", "🧾", "🚗", "🌱"];
const REMIND = [0, 15, 30, 60];

function Editor({ area, onDone }: { area: Partial<Area> | null; onDone: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(area?.name ?? "");
  const [icon, setIcon] = useState(area?.icon || "📁");
  const [remind, setRemind] = useState<number>(area?.defaultRemind?.[0] ?? 30);
  return (
    <Card>
      <Field label={t("areas.name")} value={name} onChangeText={setName} autoFocus placeholder="Side business" />
      <Small>Icon</Small>
      <ChipRow>
        {ICONS.map((i) => (
          <Chip key={i} label={i} active={icon === i} onPress={() => setIcon(i)} />
        ))}
      </ChipRow>
      <Small>{t("areas.defaultRemind")}</Small>
      <ChipRow>
        {REMIND.map((m) => (
          <Chip key={m} label={m === 0 ? t("task.atTime") : `${m} min`} active={remind === m} onPress={() => setRemind(m)} />
        ))}
      </ChipRow>
      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button style={{ flex: 1 }} variant="outline" title={t("common.cancel")} onPress={onDone} />
        <Button
          style={{ flex: 1 }}
          title={t("task.save")}
          disabled={!name.trim()}
          onPress={async () => {
            await repo.saveArea({ id: area?.id, name: name.trim(), icon, defaultRemind: [remind] });
            onDone();
          }}
        />
      </View>
    </Card>
  );
}

export default function AreasScreen() {
  const c = useTheme();
  const { t } = useT();
  const [editing, setEditing] = useState<Partial<Area> | null | undefined>(undefined);
  const { data } = useQuery(async () => ({ areas: await repo.listAreas(), tasks: await repo.listTasks() }));
  const areas = data?.areas ?? [];
  const counts = countsByArea(data?.tasks ?? [], new Date());

  const move = async (index: number, dir: -1 | 1) => {
    const ids = areas.map((a) => a.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j]!, ids[index]!];
    await repo.reorderAreas(ids);
  };

  const remove = (a: Area) =>
    Alert.alert(t("areas.delete"), t("areas.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("task.delete"), style: "destructive", onPress: () => void repo.deleteArea(a.id) },
    ]);

  return (
    <Screen edges={[]} bottomPad={60}>
      <Small>{t("areas.hint")}</Small>
      {editing !== undefined ? <Editor key={editing?.id ?? "new"} area={editing} onDone={() => setEditing(undefined)} /> : null}
      {areas.map((a, i) => {
        const n = counts.get(a.id);
        return (
          <View
            key={a.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space(3),
              padding: space(3),
              borderRadius: radius.md,
              backgroundColor: c.card,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 20 }}>{a.icon}</Text>
            </View>
            <Pressable style={{ flex: 1 }} onPress={() => setEditing(a)}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: "600" }}>{a.name}</Text>
              <Small>
                {n?.open ?? 0} {t("common.open")}
                {n?.overdue ? ` · ${n.overdue} ${t("common.overdue")}` : ""}
              </Small>
            </Pressable>
            <Pressable accessibilityLabel="Move up" hitSlop={8} onPress={() => void move(i, -1)}>
              <Ionicons name="chevron-up" size={20} color={i === 0 ? c.border : c.muted} />
            </Pressable>
            <Pressable accessibilityLabel="Move down" hitSlop={8} onPress={() => void move(i, 1)}>
              <Ionicons name="chevron-down" size={20} color={i === areas.length - 1 ? c.border : c.muted} />
            </Pressable>
            <Pressable accessibilityLabel={t("areas.delete")} hitSlop={8} onPress={() => remove(a)}>
              <Ionicons name="trash-outline" size={19} color={c.danger} />
            </Pressable>
          </View>
        );
      })}
      {editing === undefined ? <Button title={t("areas.add")} icon="add" variant="outline" onPress={() => setEditing(null)} /> : null}
    </Screen>
  );
}
