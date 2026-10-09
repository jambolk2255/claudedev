import { Ionicons } from "@expo/vector-icons";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, type RecordingOptions } from "expo-audio";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createSession, describeError, type AgentSession } from "@/ai/agent";
import { transcribe } from "@/ai/gemini";
import { getKey } from "@/ai/keys";
import { briefingText, reviewText } from "@/core/briefing";
import type { ToolCard } from "@/core/tools";
import { logVoice, repo } from "@/db";
import { runAction } from "@/integrations";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { speak, stopSpeaking } from "@/lib/speech";
import { onTaskChange } from "@/services";

/** Small mono AAC files: quick to upload and a format Gemini accepts (audio/aac). */
const RECORDING: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: ".aac",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 48000,
  android: { extension: ".aac", outputFormat: "aac_adts", audioEncoder: "aac" },
};
const MIME = Platform.OS === "android" ? "audio/aac" : Platform.OS === "ios" ? "audio/mp4" : "audio/webm";
const INK = "#0B0D12";
const BLUE = "#2D5BFF";
const BLUE2 = "#5B7CFF";
const CARD = "#141821";
const LINE = "#262C3B";
const MUTED = "#9AA3B5";

type Msg = { id: number; kind: "me" | "ai" | "error"; text: string };
type CardItem = { id: number; kind: "card"; card: ToolCard };
type Item = Msg | CardItem;
type NewItem = Omit<Msg, "id"> | Omit<CardItem, "id">;
type Phase = "idle" | "recording" | "transcribing" | "thinking";

function Wave({ active }: { active: boolean }) {
  const bars = useRef(Array.from({ length: 16 }, () => new Animated.Value(0.2))).current;
  useEffect(() => {
    if (!active) {
      bars.forEach((b) => b.setValue(0.2));
      return;
    }
    const loops = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 380 + (i % 5) * 70, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(b, { toValue: 0.2, duration: 380 + (i % 4) * 80, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l, i) => setTimeout(() => l.start(), i * 60));
    return () => loops.forEach((l) => l.stop());
  }, [active, bars]);
  return (
    <View style={{ flexDirection: "row", gap: 4, height: 44, alignItems: "center", justifyContent: "center" }}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={{ width: 5, height: 40, borderRadius: 3, backgroundColor: BLUE2, opacity: active ? 1 : 0.4, transform: [{ scaleY: b }] }}
        />
      ))}
    </View>
  );
}

export default function VoiceScreen() {
  const { t, lang } = useT();
  const { settings } = useSettings();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const recorder = useAudioRecorder(RECORDING);
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [options, setOptions] = useState<string[]>([]);
  const [text, setText] = useState("");
  const session = useRef<AgentSession | null>(null);
  const nextId = useRef(1);
  const pressedAt = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const abort = useRef<AbortController | null>(null);
  const scroll = useRef<ScrollView>(null);

  const add = useCallback((item: NewItem) => {
    setItems((list) => [...list, { ...item, id: nextId.current++ }]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  const say = useCallback(
    (reply: string, after?: () => void) => {
      if (settings.speak && reply) speak(reply, lang, settings.speechRate, after);
      else after?.();
    },
    [lang, settings.speak, settings.speechRate],
  );

  // Opening message (or the briefing when launched from the morning notification).
  useEffect(() => {
    void (async () => {
      if (mode === "briefing" || mode === "review") {
        const tasks = await repo.listTasks();
        const msg = mode === "briefing" ? briefingText(tasks, new Date(), lang, settings.userName) : reviewText(tasks, new Date(), lang);
        add({ kind: "ai", text: msg });
        say(msg);
      } else {
        add({ kind: "ai", text: t("voice.hello") });
      }
    })();
    return () => {
      stopSpeaking();
      abort.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ensureSession = async () => {
    if (!session.current) {
      session.current = await createSession({
        repo,
        lang,
        userName: settings.userName,
        settings,
        onTaskChange,
        runAction: (action, params) => runAction(action, params, lang),
        // Deletes and confirm=true actions are approved by the user here, not by the AI.
        confirm: (question) =>
          new Promise<boolean>((resolve) => {
            if (settings.speak) speak(question, lang, settings.speechRate);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            Alert.alert(
              "Agent X",
              question,
              [
                { text: t("common.no"), style: "cancel", onPress: () => resolve(false) },
                { text: t("common.yes"), style: "destructive", onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            );
          }),
      });
    }
    return session.current;
  };

  const startRecording = async () => {
    stopSpeaking();
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      add({ kind: "error", text: t("voice.micDenied") });
      return false;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    phaseRef.current = "recording";
    setPhase("recording");
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return true;
  };

  const send = async (utterance: string) => {
    const said = utterance.trim();
    if (!said) {
      setPhase("idle");
      return;
    }
    setOptions([]);
    add({ kind: "me", text: said });
    setPhase("thinking");
    const started = Date.now();
    abort.current = new AbortController();
    try {
      const s = await ensureSession();
      const res = await s.send(said, abort.current.signal);
      for (const card of res.cards) add({ kind: "card", card });
      if (res.reply) add({ kind: "ai", text: res.reply });
      setOptions(res.ask?.options ?? []);
      void logVoice(said, res.reply, res.tools, Date.now() - started).catch(() => {});
      setPhase("idle");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // When the assistant asked a question, listen again as soon as it finishes speaking.
      say(res.reply, res.ask ? () => void startRecording() : undefined);
    } catch (e) {
      setPhase("idle");
      add({ kind: "error", text: describeError(e, lang) });
    }
  };

  const stopAndSend = async () => {
    if (phaseRef.current !== "recording") return;
    phaseRef.current = "transcribing";
    setPhase("transcribing");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      const key = await getKey("gemini");
      if (!key) {
        add({ kind: "error", text: t("voice.noGemini") });
        setPhase("idle");
        return;
      }
      if (!uri) throw new Error("No recording");
      const file = new File(uri);
      const audioBase64 = await file.base64();
      const transcript = await transcribe({ apiKey: key, model: settings.geminiModel, audioBase64, mimeType: MIME });
      if (file.exists) file.delete();
      if (!transcript) {
        add({ kind: "error", text: t("voice.noSpeech") });
        setPhase("idle");
        return;
      }
      await send(transcript);
    } catch (e) {
      setPhase("idle");
      add({ kind: "error", text: describeError(e, lang) });
    }
  };

  // Hold to talk (release sends). A quick tap starts recording; the next tap sends.
  const onPressIn = async () => {
    if (phaseRef.current === "recording") {
      void stopAndSend();
      return;
    }
    if (phaseRef.current !== "idle") return;
    pressedAt.current = Date.now();
    await startRecording();
  };
  const onPressOut = () => {
    const held = Date.now() - pressedAt.current;
    if (phaseRef.current === "recording" && held > 600) void stopAndSend();
  };

  const busy = phase === "transcribing" || phase === "thinking";
  const hint =
    phase === "recording"
      ? t("voice.listening")
      : phase === "transcribing"
        ? t("voice.transcribing")
        : phase === "thinking"
          ? t("voice.thinking")
          : t("voice.hold");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: INK }} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8 }}>
          <Text style={{ color: MUTED, fontSize: 13 }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "800", letterSpacing: 1.4 }}>AGENT X</Text> · {lang === "si" ? "සිංහල" : "English"}
          </Text>
          <Pressable accessibilityLabel="Close" hitSlop={12} onPress={() => router.back()}>
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 10 }}>
          {items.map((it) =>
            it.kind === "card" ? (
              <Pressable
                key={it.id}
                onPress={() => it.card.taskId && router.push({ pathname: "/task/[id]", params: { id: it.card.taskId } })}
                style={{
                  alignSelf: "flex-start",
                  width: "86%",
                  backgroundColor: CARD,
                  borderWidth: 1,
                  borderColor: LINE,
                  borderRadius: 14,
                  padding: 12,
                  flexDirection: "row",
                  gap: 10,
                }}
              >
                <Ionicons name={(it.card.icon as never) ?? "checkmark-circle"} size={20} color={BLUE2} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#FFFFFF", fontWeight: "600", fontSize: 14 }}>{it.card.title}</Text>
                  <Text style={{ color: MUTED, fontSize: 13 }}>{it.card.subtitle}</Text>
                </View>
              </Pressable>
            ) : (
              <View
                key={it.id}
                style={{
                  alignSelf: it.kind === "me" ? "flex-end" : "flex-start",
                  maxWidth: "86%",
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  borderRadius: 18,
                  borderBottomRightRadius: it.kind === "me" ? 6 : 18,
                  borderBottomLeftRadius: it.kind === "me" ? 18 : 6,
                  backgroundColor: it.kind === "me" ? "#1B2030" : it.kind === "error" ? "rgba(255,77,79,0.15)" : BLUE,
                }}
              >
                <Text style={{ color: it.kind === "error" ? "#FF8A8C" : "#FFFFFF", fontSize: 15, lineHeight: 22 }}>{it.text}</Text>
              </View>
            ),
          )}
          {busy ? <ActivityIndicator color={BLUE2} style={{ alignSelf: "flex-start", marginTop: 4 }} /> : null}
        </ScrollView>

        {options.length > 0 && phase === "idle" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingHorizontal: 20, marginBottom: 10 }}>
            {options.map((o) => (
              <Pressable
                key={o}
                onPress={() => void send(o)}
                style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: "#1B2030", borderWidth: 1, borderColor: LINE }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 14 }}>{o}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Wave active={phase === "recording"} />
        <View style={{ alignItems: "center", marginTop: 10 }}>
          <Pressable
            accessibilityLabel={hint}
            disabled={busy}
            onPressIn={() => void onPressIn()}
            onPressOut={onPressOut}
            style={({ pressed }) => ({
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: phase === "recording" ? "#FFFFFF" : BLUE,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy ? 0.5 : 1,
              transform: [{ scale: pressed || phase === "recording" ? 1.08 : 1 }],
              shadowColor: BLUE,
              shadowOpacity: 0.6,
              shadowRadius: 20,
              elevation: 12,
            })}
          >
            <Ionicons name={phase === "recording" ? "stop" : "mic"} size={36} color={phase === "recording" ? BLUE : "#FFFFFF"} />
          </Pressable>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 10 }}>{hint}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t("voice.type")}
            placeholderTextColor={MUTED}
            onSubmitEditing={() => {
              const v = text;
              setText("");
              void send(v);
            }}
            returnKeyType="send"
            editable={!busy}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 14,
              backgroundColor: CARD,
              borderWidth: 1,
              borderColor: LINE,
              paddingHorizontal: 14,
              color: "#FFFFFF",
              fontSize: 15,
            }}
          />
          <Pressable
            accessibilityLabel={t("voice.send")}
            disabled={busy || !text.trim()}
            onPress={() => {
              const v = text;
              setText("");
              void send(v);
            }}
            style={{
              width: 46,
              height: 46,
              borderRadius: 14,
              backgroundColor: BLUE,
              alignItems: "center",
              justifyContent: "center",
              opacity: busy || !text.trim() ? 0.4 : 1,
            }}
          >
            <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
