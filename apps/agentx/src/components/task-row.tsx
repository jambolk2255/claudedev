import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { describeRule } from "@/core/recurrence";
import { relativeLabel, timeLabel } from "@/core/time";
import type { Area, Task } from "@/core/types";
import { isOverdue } from "@/core/views";
import { useT } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";
import { complete } from "@/services";
import { reopenTask } from "@/core/ops";
import { repo } from "@/db";
import { Tag } from "./ui";

export function TaskRow({ task, area, now, showDay }: { task: Task; area?: Area; now: Date; showDay?: boolean }) {
  const c = useTheme();
  const { lang } = useT();
  const overdue = isOverdue(task, now);
  const done = task.status === "done";
  const when = task.dueAt ? (showDay || overdue ? relativeLabel(task.dueAt, task.allDay, now, lang) : task.allDay ? "" : timeLabel(new Date(task.dueAt))) : "";

  const toggle = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (done) await reopenTask(repo, task.id);
    else await complete(task.id);
  };

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/task/[id]", params: { id: task.id } })}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space(3),
        paddingHorizontal: space(3.5),
        paddingVertical: space(3),
        minHeight: 64,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: overdue ? c.danger : c.border,
        backgroundColor: overdue ? c.dangerSoft : c.card,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        hitSlop={10}
        onPress={toggle}
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 2,
          borderColor: done ? c.primary : overdue ? c.danger : c.border,
          backgroundColor: done ? c.primary : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 15, fontWeight: "500", color: done ? c.muted : c.text, textDecorationLine: done ? "line-through" : "none" }} numberOfLines={2}>
          {task.priority === "high" ? "❗ " : ""}
          {task.title}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          {area ? <Tag label={`${area.icon} ${area.name}`} /> : null}
          {when ? <Text style={{ fontSize: 12, color: overdue ? c.danger : c.muted, fontWeight: overdue ? "600" : "400" }}>{when}</Text> : null}
          {task.rrule ? <Text style={{ fontSize: 12, color: c.muted }}>🔁 {describeRule(task.rrule, lang)}</Text> : null}
          {task.amount ? <Text style={{ fontSize: 12, color: c.muted }}>රු. {task.amount.toLocaleString()}</Text> : null}
        </View>
      </View>
      {task.assignee ? (
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: c.card2,
            borderWidth: 1,
            borderColor: c.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: c.text, fontSize: 12, fontWeight: "700" }}>{task.assignee.slice(0, 1).toUpperCase()}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
