import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { TaskRow } from "@/components/task-row";
import { BrandMark, Empty, H1, Screen, SectionTitle } from "@/components/ui";
import { addDays, dayKey, longDate, startOfDay, weekdayName } from "@/core/time";
import { upcoming } from "@/core/views";
import { repo } from "@/db";
import { useNow, useQuery } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

export default function UpcomingScreen() {
  const c = useTheme();
  const { t, lang } = useT();
  const now = useNow();
  const [selected, setSelected] = useState<string | null>(null);
  const { data } = useQuery(async () => ({ tasks: await repo.listTasks(), areas: await repo.listAreas() }));
  const areas = new Map((data?.areas ?? []).map((a) => [a.id, a]));
  const groups = upcoming(data?.tasks ?? [], now, 30);
  const busy = new Set(groups.map((g) => g.day));
  const days = Array.from({ length: 14 }, (_, i) => addDays(startOfDay(now), i + 1));
  const shown = selected ? groups.filter((g) => g.day === selected) : groups.filter((g) => g.date < addDays(startOfDay(now), 8));

  return (
    <Screen>
      <View style={{ gap: 2, marginTop: space(2) }}>
        <BrandMark />
        <H1>{t("upcoming.title")}</H1>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        {days.map((d) => {
          const key = dayKey(d);
          const on = selected === key;
          return (
            <Pressable
              key={key}
              onPress={() => setSelected(on ? null : key)}
              style={{
                width: 54,
                paddingVertical: space(2.5),
                borderRadius: radius.md,
                alignItems: "center",
                backgroundColor: on ? c.primary : c.card,
                borderWidth: 1,
                borderColor: on ? c.primary : c.border,
              }}
            >
              <Text style={{ fontSize: 11, color: on ? "#FFFFFF" : c.muted }}>{weekdayName(d, lang, true)}</Text>
              <Text style={{ fontSize: 18, fontWeight: "700", color: on ? "#FFFFFF" : c.text }}>{d.getDate()}</Text>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 3,
                  marginTop: 3,
                  backgroundColor: busy.has(key) ? (on ? "#FFFFFF" : c.primaryBright) : "transparent",
                }}
              />
            </Pressable>
          );
        })}
      </ScrollView>
      {shown.length === 0 ? (
        <Empty icon="calendar-outline" title={t("upcoming.empty")} />
      ) : (
        shown.map((g) => (
          <View key={g.day} style={{ gap: space(2) }}>
            <SectionTitle title={longDate(g.date, lang)} right={String(g.tasks.length)} />
            {g.tasks.map((task) => (
              <TaskRow key={task.id} task={task} area={task.areaId ? areas.get(task.areaId) : undefined} now={now} />
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}
