import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Platform, View } from "react-native";
import { Button, Chip, ChipRow, Field, Group, Row, Screen, SectionTitle, Small, Toggle } from "@/components/ui";
import { reopenTask } from "@/core/ops";
import { describeRule } from "@/core/recurrence";
import { longDate, timeLabel, toLocalISO } from "@/core/time";
import type { Priority, Task } from "@/core/types";
import { repo } from "@/db";
import { useQuery } from "@/lib/data";
import { useT, type MessageKey } from "@/lib/i18n";
import { space } from "@/lib/theme";
import { complete, onTaskChange, snooze } from "@/services";

const REMIND = [0, 10, 30, 60, 1440];
const REPEATS: { label: MessageKey; rule: (d: Date) => string | null }[] = [
  { label: "task.never", rule: () => null },
  { label: "task.daily", rule: () => "FREQ=DAILY" },
  { label: "task.weekly", rule: (d) => `FREQ=WEEKLY;BYDAY=${["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d.getDay()]}` },
  { label: "task.monthly", rule: (d) => `FREQ=MONTHLY;BYMONTHDAY=${d.getDate()}` },
  { label: "task.yearly", rule: () => "FREQ=YEARLY" },
];

const nextHour = () => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
};

export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { t, lang } = useT();
  const { data: areas } = useQuery(() => repo.listAreas());
  const [task, setTask] = useState<Task | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [areaId, setAreaId] = useState<string | null>(null);
  const [due, setDue] = useState<Date | null>(null);
  const [allDay, setAllDay] = useState(false);
  const [remind, setRemind] = useState<number[]>([0]);
  const [rrule, setRrule] = useState<string | null>(null);
  const [priority, setPriority] = useState<Priority>("normal");
  const [amount, setAmount] = useState("");
  const [assignee, setAssignee] = useState("");
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew) return;
    void repo.getTask(id).then((tk) => {
      if (!tk) return;
      setTask(tk);
      setTitle(tk.title);
      setNotes(tk.notes);
      setAreaId(tk.areaId);
      setDue(tk.dueAt ? new Date(tk.dueAt) : null);
      setAllDay(tk.allDay);
      setRemind(tk.remind);
      setRrule(tk.rrule);
      setPriority(tk.priority);
      setAmount(tk.amount ? String(tk.amount) : "");
      setAssignee(tk.assignee ?? "");
    });
  }, [id, isNew]);

  const onPick = (e: DateTimePickerEvent, value?: Date) => {
    const mode = picker;
    if (Platform.OS === "android") setPicker(null);
    if (e.type !== "set" || !value) return;
    const base = due ?? nextHour();
    const next = new Date(base);
    if (mode === "date") next.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
    else next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    setDue(next);
  };

  const save = async () => {
    if (!title.trim()) {
      Alert.alert(t("task.titleRequired"));
      return;
    }
    setSaving(true);
    try {
      const fields: Partial<Task> = {
        title: title.trim(),
        notes: notes.trim(),
        areaId,
        dueAt: due ? toLocalISO(due) : null,
        allDay: !!due && allDay,
        remind: due ? remind : [],
        rrule: due ? rrule : null,
        priority,
        amount: amount.trim() ? Number(amount.replace(/[^\d.]/g, "")) || null : null,
        assignee: assignee.trim() || null,
      };
      if (isNew) {
        const created = await repo.createTask({ ...fields, title: fields.title!, source: "app" });
        await onTaskChange(created, "created");
      } else {
        const updated = await repo.updateTask(id, fields);
        await onTaskChange(updated, "updated");
      }
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(t("task.deleteConfirm"), title, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("task.delete"),
        style: "destructive",
        onPress: async () => {
          await repo.deleteTask(id);
          if (task) await onTaskChange(task, "deleted");
          router.back();
        },
      },
    ]);

  const toggleRemind = (m: number) => setRemind((r) => (r.includes(m) ? r.filter((x) => x !== m) : [...r, m].sort((a, b) => a - b)));
  const remindLabel = (m: number) => (m === 0 ? t("task.atTime") : m < 60 ? `${m} min` : m < 1440 ? `${m / 60}h` : lang === "si" ? "දවසකට කලින්" : "1 day");

  return (
    <Screen edges={[]} bottomPad={60}>
      <Stack.Screen options={{ title: isNew ? t("task.new") : t("task.edit") }} />
      <Field label={t("task.title")} value={title} onChangeText={setTitle} autoFocus={isNew} placeholder="ABC client meeting" />
      <Field label={t("task.notes")} value={notes} onChangeText={setNotes} multiline style={{ minHeight: 80, textAlignVertical: "top" }} />

      <SectionTitle title={t("task.area")} />
      <ChipRow>
        <Chip label={t("task.none")} active={!areaId} onPress={() => setAreaId(null)} />
        {(areas ?? []).map((a) => (
          <Chip key={a.id} label={`${a.icon} ${a.name}`} active={areaId === a.id} onPress={() => setAreaId(a.id)} />
        ))}
      </ChipRow>

      <SectionTitle title={t("task.when")} />
      <Group>
        <Row icon="calendar-outline" title={due ? longDate(due, lang) : t("task.noDate")} onPress={() => setPicker("date")} />
        {due && !allDay ? <Row icon="time-outline" title={timeLabel(due)} onPress={() => setPicker("time")} /> : null}
        {due ? <Row title={t("task.allDay")} right={<Toggle value={allDay} onChange={setAllDay} />} /> : null}
        {due ? <Row icon="close-circle-outline" title={t("task.clearDate")} onPress={() => setDue(null)} last /> : null}
      </Group>
      {picker ? <DateTimePicker value={due ?? nextHour()} mode={picker} onChange={onPick} display={Platform.OS === "ios" ? "spinner" : "default"} /> : null}

      {due ? (
        <>
          <SectionTitle title={t("task.remind")} />
          <ChipRow>
            {REMIND.map((m) => (
              <Chip key={m} label={remindLabel(m)} active={remind.includes(m)} onPress={() => toggleRemind(m)} />
            ))}
          </ChipRow>
          <SectionTitle title={t("task.repeat")} right={rrule ? describeRule(rrule, lang) : undefined} />
          <ChipRow>
            {REPEATS.map((r) => {
              const rule = r.rule(due);
              const active = rule === null ? !rrule : !!rrule && rrule.split(";")[0] === rule.split(";")[0];
              return <Chip key={r.label} label={t(r.label)} active={active} onPress={() => setRrule(rule)} />;
            })}
          </ChipRow>
        </>
      ) : null}

      <SectionTitle title={t("task.priority")} />
      <ChipRow>
        {(["low", "normal", "high"] as const).map((p) => (
          <Chip key={p} label={t(`task.${p}`)} active={priority === p} onPress={() => setPriority(p)} tone={p === "high" ? "danger" : undefined} />
        ))}
      </ChipRow>

      <View style={{ flexDirection: "row", gap: space(3) }}>
        <View style={{ flex: 1 }}>
          <Field label={t("task.amount")} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={t("task.assignee")} value={assignee} onChangeText={setAssignee} placeholder="Kasun" />
        </View>
      </View>

      <Button title={t("task.save")} icon="checkmark" onPress={save} loading={saving} style={{ marginTop: space(2) }} />
      {!isNew && task ? (
        <>
          {task.status === "open" ? (
            <View style={{ flexDirection: "row", gap: space(3) }}>
              <Button
                style={{ flex: 1 }}
                variant="outline"
                icon="alarm-outline"
                title={t("task.snooze")}
                onPress={async () => {
                  await snooze(task.id, 60);
                  router.back();
                }}
              />
              <Button
                style={{ flex: 1 }}
                variant="outline"
                icon="checkmark-done"
                title={t("task.complete")}
                onPress={async () => {
                  await complete(task.id);
                  router.back();
                }}
              />
            </View>
          ) : (
            <Button
              variant="outline"
              icon="refresh"
              title={t("task.reopen")}
              onPress={async () => {
                const r = await reopenTask(repo, task.id);
                await onTaskChange(r, "updated");
                router.back();
              }}
            />
          )}
          <Button variant="danger" icon="trash-outline" title={t("task.delete")} onPress={remove} />
          <Small style={{ textAlign: "center" }}>
            {task.source === "voice" ? "🎤 Voice" : task.source === "inbox" ? "📥 Inbox" : "✍ App"} · {new Date(task.createdAt).toLocaleString()}
          </Small>
        </>
      ) : null}
    </Screen>
  );
}
