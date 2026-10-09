import { randomUUID } from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Button, Card, Chip, ChipRow, Field, Group, Row, Screen, SectionTitle, Small, Toggle } from "@/components/ui";
import { checkUrl } from "@/core/integration";
import type { Action, ActionParam, System, TaskEvent } from "@/core/types";
import { repo } from "@/db";
import { pollInbox, runAction } from "@/integrations";
import { useQuery } from "@/lib/data";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { space, useTheme } from "@/lib/theme";

const ICONS = ["💼", "👥", "📈", "🏪", "🧾", "📣", "🎓", "💳", "🗂", "⚡", "🤖", "📦"];
const EVENTS: TaskEvent[] = ["task.created", "task.completed", "task.overdue"];

/** `clientName*, note` → params (`*` marks required). */
const parseParams = (s: string): ActionParam[] =>
  s
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => ({ name: p.replace(/\*$/, "").trim(), description: "", required: p.endsWith("*") }));
const formatParams = (ps: ActionParam[]) => ps.map((p) => `${p.name}${p.required ? "*" : ""}`).join(", ");

/** Shows an alert and returns false when a filled-in URL is not https (or a local-network http) URL. */
function urlsOk(t: (k: "url.invalid" | "url.insecure") => string, ...urls: string[]): boolean {
  for (const u of urls) {
    if (!u.trim()) continue;
    const res = checkUrl(u);
    if (!res.ok) {
      Alert.alert("⚠", `${t(res.reason === "insecure" ? "url.insecure" : "url.invalid")}\n\n${u.trim()}`);
      return false;
    }
  }
  return true;
}

function ActionEditor({ systemId, action, onDone }: { systemId: string; action: Action | null; onDone: () => void }) {
  const { t } = useT();
  const { settings } = useSettings();
  const [name, setName] = useState(action?.name ?? "");
  const [description, setDescription] = useState(action?.description ?? "");
  const [url, setUrl] = useState(action?.url ?? "");
  const [params, setParams] = useState(action ? formatParams(action.params) : "");
  const [confirm, setConfirm] = useState(action?.confirm ?? false);
  const [enabled, setEnabled] = useState(action?.enabled ?? true);
  const [testing, setTesting] = useState(false);

  const save = async () => {
    if (!urlsOk(t, url)) return;
    await repo.saveAction({
      id: action?.id,
      key: action?.key,
      systemId,
      name: name.trim(),
      description: description.trim(),
      url: url.trim(),
      params: parseParams(params),
      confirm,
      enabled,
    });
    onDone();
  };
  const test = async () => {
    if (!urlsOk(t, url)) return;
    setTesting(true);
    try {
      const saved = await repo.saveAction({
        id: action?.id,
        key: action?.key,
        systemId,
        name: name.trim(),
        description: description.trim(),
        url: url.trim(),
        params: parseParams(params),
        confirm,
        enabled,
      });
      const system = await repo.getSystem(systemId);
      const res = await runAction({ ...saved, systemName: system?.name ?? "" }, Object.fromEntries(saved.params.map((p) => [p.name, "test"])), settings.lang);
      Alert.alert(res.ok ? "✓" : "⚠", res.say);
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <Field label={t("action.name")} value={name} onChangeText={setName} placeholder="Client onboarding" />
      <Field label={t("action.description")} value={description} onChangeText={setDescription} placeholder="Perera Holdings onboarding start කරන්න" />
      <Field
        label={t("action.url")}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://n8n.example.lk/webhook/onboarding"
      />
      <Field label={t("action.params")} value={params} onChangeText={setParams} autoCapitalize="none" placeholder="clientName*, email" />
      <Group>
        <Row title={t("action.confirm")} right={<Toggle value={confirm} onChange={setConfirm} />} />
        <Row title={t("action.enabled")} right={<Toggle value={enabled} onChange={setEnabled} />} last />
      </Group>
      <View style={{ flexDirection: "row", gap: space(2) }}>
        <Button style={{ flex: 1 }} variant="outline" title={t("common.cancel")} onPress={onDone} />
        <Button style={{ flex: 1 }} variant="outline" title={t("system.test")} loading={testing} disabled={!name.trim() || !url.trim()} onPress={test} />
        <Button style={{ flex: 1 }} title={t("system.save")} disabled={!name.trim() || !url.trim()} onPress={save} />
      </View>
      {action ? <Button variant="danger" title={t("action.delete")} onPress={() => void repo.deleteAction(action.id).then(onDone)} /> : null}
    </Card>
  );
}

export default function SystemScreen() {
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const { t } = useT();
  const { settings } = useSettings();
  const [system, setSystem] = useState<System | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("💼");
  const [secret, setSecret] = useState(() => randomUUID().replace(/-/g, ""));
  const [eventsUrl, setEventsUrl] = useState("");
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [inboxUrl, setInboxUrl] = useState("");
  const [editing, setEditing] = useState<Action | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const { data: actions } = useQuery(() => (system ? repo.actionsFor(system.id) : Promise.resolve([])), [system?.id]);

  useEffect(() => {
    if (isNew) return;
    void repo.getSystem(id).then((s) => {
      if (!s) return;
      setSystem(s);
      setName(s.name);
      setIcon(s.icon || "⚡");
      setSecret(s.secret);
      setEventsUrl(s.eventsUrl);
      setEvents(s.events);
      setInboxUrl(s.inboxUrl);
    });
  }, [id, isNew]);

  const save = async (): Promise<System | null> => {
    if (!name.trim() || !urlsOk(t, eventsUrl, inboxUrl)) return null;
    const saved = await repo.saveSystem({
      ...(system ?? {}),
      id: system?.id,
      name: name.trim(),
      icon,
      secret: secret.trim(),
      eventsUrl: eventsUrl.trim(),
      events,
      inboxUrl: inboxUrl.trim(),
    });
    setSystem(saved);
    return saved;
  };

  const check = async () => {
    const saved = await save();
    if (!saved) return;
    setChecking(true);
    try {
      const n = await pollInbox(saved, settings);
      Alert.alert("✓", `${n} new`);
    } catch (e) {
      Alert.alert("⚠", e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
      setSystem(await repo.getSystem(saved.id));
    }
  };

  const remove = () =>
    Alert.alert(t("system.delete"), t("system.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("task.delete"),
        style: "destructive",
        onPress: async () => {
          if (system) await repo.deleteSystem(system.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen edges={[]} bottomPad={60}>
      <Stack.Screen options={{ title: isNew && !system ? t("system.new") : `${icon} ${name}` }} />
      <Field label={t("system.name")} value={name} onChangeText={setName} placeholder="Agency CRM" autoFocus={isNew} />
      <Small>{t("system.icon")}</Small>
      <ChipRow>
        {ICONS.map((i) => (
          <Chip key={i} label={i} active={icon === i} onPress={() => setIcon(i)} />
        ))}
      </ChipRow>
      <Field label={t("system.secret")} value={secret} onChangeText={setSecret} autoCapitalize="none" autoCorrect={false} hint={t("system.secretHint")} />
      {system?.lastError ? <Text style={{ color: c.danger, fontSize: 12 }}>⚠ {system.lastError}</Text> : null}

      {system ? (
        <>
          <SectionTitle title={t("system.actions")} right={String(actions?.length ?? 0)} />
          <Small>{t("system.actionsHint")}</Small>
          {editing !== undefined ? (
            <ActionEditor key={editing?.id ?? "new"} systemId={system.id} action={editing} onDone={() => setEditing(undefined)} />
          ) : null}
          {(actions ?? []).length ? (
            <Group>
              {(actions ?? []).map((a, i, arr) => (
                <Row
                  key={a.id}
                  icon="flash"
                  title={a.name}
                  subtitle={`"${a.description}"${a.confirm ? " · confirm" : ""}${a.enabled ? "" : " · off"}`}
                  onPress={() => setEditing(a)}
                  last={i === arr.length - 1}
                />
              ))}
            </Group>
          ) : null}
          {editing === undefined ? <Button variant="outline" icon="add" title={t("system.addAction")} onPress={() => setEditing(null)} /> : null}
        </>
      ) : null}

      <SectionTitle title={t("system.events")} />
      <Field
        label={t("system.eventsUrl")}
        value={eventsUrl}
        onChangeText={setEventsUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://n8n.example.lk/webhook/agentx-events"
      />
      <Group>
        {EVENTS.map((e, i) => (
          <Row
            key={e}
            title={e}
            right={<Toggle value={events.includes(e)} onChange={(on) => setEvents((list) => (on ? [...list, e] : list.filter((x) => x !== e)))} />}
            last={i === EVENTS.length - 1}
          />
        ))}
      </Group>

      <SectionTitle title={t("system.inbox")} />
      <Field
        label={t("system.inboxUrl")}
        value={inboxUrl}
        onChangeText={setInboxUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://n8n.example.lk/webhook/agentx-inbox"
      />
      {inboxUrl.trim() ? <Button variant="outline" icon="refresh" title={t("system.checkNow")} loading={checking} onPress={check} /> : null}

      <Button
        title={t("system.save")}
        icon="checkmark"
        disabled={!name.trim()}
        onPress={async () => {
          const wasNew = !system;
          await save();
          if (!wasNew) router.back();
        }}
        style={{ marginTop: space(2) }}
      />
      {system ? <Button variant="danger" icon="trash-outline" title={t("system.delete")} onPress={remove} /> : null}
    </Screen>
  );
}
