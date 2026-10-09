import * as Speech from "expo-speech";

let siVoice: string | null | undefined;

async function findSinhalaVoice(): Promise<string | null> {
  if (siVoice !== undefined) return siVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    siVoice = voices.find((v) => v.language?.toLowerCase().startsWith("si"))?.identifier ?? null;
  } catch {
    siVoice = null;
  }
  return siVoice;
}

/** Sinhala text uses the phone's Sinhala voice (Google TTS "si-LK") when installed. */
const hasSinhala = (text: string) => /[඀-෿]/.test(text);

export function speak(text: string, lang: "si" | "en", rate = 1, onDone?: () => void): void {
  void Speech.stop();
  const sinhala = lang === "si" || hasSinhala(text);
  void findSinhalaVoice().then((voice) => {
    Speech.speak(text, {
      language: sinhala ? "si-LK" : "en-US",
      voice: sinhala && voice ? voice : undefined,
      rate,
      onDone,
      onStopped: onDone,
      onError: () => onDone?.(),
    });
  });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
