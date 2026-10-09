import { Ionicons } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { TaskRow } from "@/components/task-row";
import { BrandMark, Empty, H1, IconButton, Screen, SectionTitle, Small } from "@/components/ui";
import { briefingText, headline } from "@/core/briefing";
import { longDate } from "@/core/time";
import { overdue, progress, someday, today } from "@/core/views";
import { repo } from "@/db";
import { syncAll } from "@/integrations";
import { useNow, useQuery } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { radius, space, useTheme } from "@/lib/theme";
import { speak } from "@/lib/speech";

function Ring({ value }: { value: number }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: 66, height: 66, alignItems: "center", justifyContent: "center" }}>
      <Svg width={66} height={66} style={{ position: "absolute" }}>
        <Circle cx={33} cy={33} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={7} fill="none" />
        <Circle
          cx={33}
          cy={33}
          r={r}
          stroke="#FFFFFF"
          strokeWidth={7}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c}`}
          strokeDashoffset={c * (1 - value)}
          transform="rotate(-90 33 33)"
        />
      </Svg>
      <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

export default function TodayScreen() {
  const c = useTheme();
  const { t, lang } = useT();
  const { settings } = useSettings();
  const now = useNow();
  const [speaking, setSpeaking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { data } = useQuery(async () => ({ tasks: await repo.listTasks(), areas: await repo.listAreas() }));
  const tasks = data?.tasks ?? [];
  const areas = new Map((data?.areas ?? []).map((a) => [a.id, a]));
  const od = overdue(tasks, now);
  const td = today(tasks, now);
  const later = someday(tasks);
  const hour = now.getHours();
  const greet =
    lang === "si"
      ? hour < 12
        ? "සුබ උදෑසනක්"
        : hour < 17
          ? "සුබ දහවලක්"
          : "සුබ සන්ධ්‍යාවක්"
      : hour < 12
        ? "Good morning"
        : hour < 17
          ? "Good afternoon"
          : "Good evening";

  const toggleBriefing = () => {
    if (speaking) {
      void Speech.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    speak(briefingText(tasks, now, lang, settings.userName), lang, settings.speechRate, () => setSpeaking(false));
  };

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await syncAll().finally(() => setRefreshing(false));
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: space(2) }}>
        <View style={{ gap: 2, flex: 1 }}>
          <BrandMark />
          <H1>
            {greet}
            {settings.userName ? ` ${settings.userName}` : ""} 👋
          </H1>
          <Small>{longDate(now, lang)}</Small>
        </View>
        <IconButton icon="add" label={t("task.new")} onPress={() => router.push({ pathname: "/task/[id]", params: { id: "new" } })} />
      </View>

      <View
        style={{
          backgroundColor: c.primary,
          borderRadius: radius.xl,
          padding: space(4.5),
          flexDirection: "row",
          gap: space(3.5),
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <View style={{ position: "absolute", right: -40, top: -40, width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(255,255,255,0.08)" }} />
        <Ring value={progress(tasks, now)} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>{headline(tasks, now, lang)}</Text>
          {td[0] && td[0].status === "open" ? (
            <Text style={{ color: "rgba(255,255,255,0.9)", fontSize: 13 }} numberOfLines={2}>
              {lang === "si" ? "ඊළඟට: " : "Next: "}
              {td.find((x) => x.status === "open")?.title}
            </Text>
          ) : null}
          <Pressable
            onPress={toggleBriefing}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: c.ink,
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 7,
            }}
          >
            <Ionicons name={speaking ? "stop" : "play"} size={14} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "600" }}>{speaking ? t("today.stop") : t("today.briefing")}</Text>
          </Pressable>
        </View>
      </View>

      {od.length > 0 && (
        <>
          <SectionTitle title={`⚠ ${t("today.overdue")}`} right={String(od.length)} tone="danger" />
          {od.map((task) => (
            <TaskRow key={task.id} task={task} area={task.areaId ? areas.get(task.areaId) : undefined} now={now} />
          ))}
        </>
      )}

      <SectionTitle title={t("today.today")} right={String(td.length)} />
      {td.length === 0 ? (
        <Empty icon="mic-outline" title={t("today.empty")} body={t("today.emptyBody")} />
      ) : (
        td.map((task) => <TaskRow key={task.id} task={task} area={task.areaId ? areas.get(task.areaId) : undefined} now={now} />)
      )}

      {later.length > 0 && (
        <>
          <SectionTitle title={t("today.someday")} right={String(later.length)} />
          {later.slice(0, 20).map((task) => (
            <TaskRow key={task.id} task={task} area={task.areaId ? areas.get(task.areaId) : undefined} now={now} />
          ))}
        </>
      )}
    </Screen>
  );
}
