import Constants from "expo-constants";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { getKey, maskKey, setKey } from "@/ai/keys";
import { BrandMark, Button, Chip, ChipRow, Field, Group, H1, Row, Screen, SectionTitle, Small, Toggle } from "@/components/ui";
import { makeBackup, parseBackup } from "@/core/integration";
import { dayKey, relativeLabel } from "@/core/time";
import { CLAUDE_MODELS, type Settings } from "@/core/types";
import { loadSettings, repo, saveSettings } from "@/db";
import { backupNow } from "@/integrations";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { space } from "@/lib/theme";
import { rescheduleAll } from "@/notifications";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function TimeField({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Field
      label={label}
      value={v}
      onChangeText={setV}
      placeholder="07:00"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      onEndEditing={() => (TIME.test(v) ? onSave(v) : setV(value))}
      style={{ width: 110 }}
    />
  );
}

export default function MoreScreen() {
  const { t, lang } = useT();
  const { settings, update } = useSettings();
  const [gemini, setGemini] = useState("");
  const [claude, setClaude] = useState("");
  const [stored, setStored] = useState<{ gemini: string | null; claude: string | null }>({ gemini: null, claude: null });
  const [savedKeys, setSavedKeys] = useState(false);
  const [name, setName] = useState(settings.userName);
  const [geminiModel, setGeminiModel] = useState(settings.geminiModel);
  const [backupUrl, setBackupUrl] = useState(settings.backupUrl);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([getKey("gemini"), getKey("claude")]).then(([g, c]) => setStored({ gemini: g, claude: c }));
  }, [savedKeys]);

  const saveKeys = async () => {
    if (gemini.trim()) await setKey("gemini", gemini);
    if (claude.trim()) await setKey("claude", claude);
    setGemini("");
    setClaude("");
    setSavedKeys((x) => !x);
    Alert.alert(t("more.saved"));
  };

  const clearKey = (name: "gemini" | "claude") =>
    Alert.alert(name === "gemini" ? t("more.gemini") : t("more.claude"), "Remove this key?", [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("common.ok"), style: "destructive", onPress: () => void setKey(name, "").then(() => setSavedKeys((x) => !x)) },
    ]);

  const exportBackup = async () => {
    setBusy("export");
    try {
      const data = await repo.allForBackup();
      const file = new File(Paths.cache, `agentx-backup-${dayKey(new Date())}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(makeBackup({ ...data, settings }, new Date()), null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Agent X backup" });
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const importBackup = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    try {
      const backup = parseBackup(await new File(res.assets[0].uri).text());
      Alert.alert(
        t("more.import"),
        `${t("more.importConfirm")}\n\n${backup.tasks.length} tasks · ${backup.areas.length} areas · ${backup.systems.length} systems`,
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.ok"),
            style: "destructive",
            onPress: async () => {
              await repo.restore(backup);
              const { lastBackupAt: _ignored, ...rest } = backup.settings as Partial<Settings>;
              await saveSettings(rest);
              await update({});
              await rescheduleAll(await loadSettings());
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    }
  };

  const runBackup = async () => {
    setBusy("webhook");
    try {
      await update({ backupUrl: backupUrl.trim() });
      await backupNow({ ...settings, backupUrl: backupUrl.trim() });
      await update({});
      Alert.alert(t("more.saved"));
    } catch (e) {
      Alert.alert(t("common.error"), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const nagOptions = [0, 30, 60, 120, 240];

  return (
    <Screen>
      <View style={{ gap: 2, marginTop: space(2) }}>
        <BrandMark />
        <H1>{t("more.title")}</H1>
      </View>

      <Group>
        <Row icon="albums-outline" title={t("more.areas")} onPress={() => router.push("/areas")} />
        <Row icon="people-outline" title={t("more.team")} subtitle={t("more.teamSoon")} />
        <Row icon="logo-whatsapp" title={t("more.whatsapp")} subtitle={t("more.soon")} last />
      </Group>

      <SectionTitle title={t("more.keys")} />
      <Small>{t("more.keysHint")}</Small>
      <Field
        label={t("more.gemini")}
        value={gemini}
        onChangeText={setGemini}
        placeholder={stored.gemini ? maskKey(stored.gemini) : "AIza…"}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        hint="aistudio.google.com → Get API key"
      />
      <Field
        label={t("more.claude")}
        value={claude}
        onChangeText={setClaude}
        placeholder={stored.claude ? maskKey(stored.claude) : "sk-ant-…"}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        hint="console.anthropic.com → API keys"
      />
      <Button title={t("more.saveKeys")} icon="key-outline" onPress={saveKeys} disabled={!gemini.trim() && !claude.trim()} />
      <ChipRow>
        {stored.gemini ? <Chip label="✕ Gemini key" onPress={() => clearKey("gemini")} /> : null}
        {stored.claude ? <Chip label="✕ Claude key" onPress={() => clearKey("claude")} /> : null}
      </ChipRow>
      <Small>{t("more.claudeModel")}</Small>
      <ChipRow>
        {CLAUDE_MODELS.map((m) => (
          <Chip key={m.id} label={m.label} active={settings.claudeModel === m.id} onPress={() => void update({ claudeModel: m.id })} />
        ))}
      </ChipRow>
      <Field
        label={t("more.geminiModel")}
        value={geminiModel}
        onChangeText={setGeminiModel}
        autoCapitalize="none"
        autoCorrect={false}
        onEndEditing={() => geminiModel.trim() && void update({ geminiModel: geminiModel.trim() })}
      />

      <SectionTitle title={t("more.voice")} />
      <Small>{t("more.lang")}</Small>
      <ChipRow>
        <Chip label="සිංහල" active={settings.lang === "si"} onPress={() => void update({ lang: "si" })} />
        <Chip label="English" active={settings.lang === "en"} onPress={() => void update({ lang: "en" })} />
      </ChipRow>
      <Small>{t("more.theme")}</Small>
      <ChipRow>
        {(["dark", "light", "system"] as const).map((th) => (
          <Chip key={th} label={t(`more.${th}`)} active={settings.theme === th} onPress={() => void update({ theme: th })} />
        ))}
      </ChipRow>
      <Group>
        <Row title={t("more.speak")} right={<Toggle value={settings.speak} onChange={(v) => void update({ speak: v })} />} last />
      </Group>
      <Field label={t("more.name")} value={name} onChangeText={setName} onEndEditing={() => void update({ userName: name.trim() })} placeholder="Kavinda" />

      <SectionTitle title={t("more.reminders")} />
      <View style={{ flexDirection: "row", gap: space(3), flexWrap: "wrap" }}>
        <TimeField label={t("more.briefing")} value={settings.briefingTime} onSave={(v) => void update({ briefingTime: v })} />
        <TimeField label={t("more.review")} value={settings.reviewTime} onSave={(v) => void update({ reviewTime: v })} />
      </View>
      <Small>{t("more.nag")}</Small>
      <ChipRow>
        {nagOptions.map((m) => (
          <Chip
            key={m}
            label={m === 0 ? t("more.nagOff") : m < 60 ? `${m} min` : `${m / 60}h`}
            active={settings.nagMinutes === m}
            onPress={() => void update({ nagMinutes: m })}
          />
        ))}
      </ChipRow>
      <Small>{t("more.quiet")}</Small>
      <View style={{ flexDirection: "row", gap: space(3) }}>
        <TimeField label="" value={settings.quietStart} onSave={(v) => void update({ quietStart: v })} />
        <TimeField label="" value={settings.quietEnd} onSave={(v) => void update({ quietEnd: v })} />
      </View>

      <SectionTitle
        title={t("more.backup")}
        right={settings.lastBackupAt ? `${t("more.lastBackup")}: ${relativeLabel(settings.lastBackupAt, false, new Date(), lang)}` : undefined}
      />
      <Group>
        <Row icon="download-outline" title={t("more.export")} onPress={exportBackup} right={busy === "export" ? "…" : undefined} />
        <Row icon="cloud-upload-outline" title={t("more.import")} onPress={importBackup} last />
      </Group>
      <Field
        label={t("more.backupUrl")}
        value={backupUrl}
        onChangeText={setBackupUrl}
        onEndEditing={() => void update({ backupUrl: backupUrl.trim() })}
        placeholder="https://n8n.example.lk/webhook/agentx-backup"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Group>
        <Row title={t("more.autoBackup")} right={<Toggle value={settings.autoBackup} onChange={(v) => void update({ autoBackup: v })} />} last />
      </Group>
      <Button
        title={t("more.backupNow")}
        variant="outline"
        icon="cloud-done-outline"
        onPress={runBackup}
        loading={busy === "webhook"}
        disabled={!backupUrl.trim()}
      />

      <Small style={{ textAlign: "center", marginTop: space(4) }}>
        Agent X · {t("more.version")} {Constants.expoConfig?.version ?? "0.1.0"}
      </Small>
    </Screen>
  );
}
