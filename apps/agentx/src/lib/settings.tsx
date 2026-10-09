import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, type Settings } from "@/core/types";
import { loadSettings, saveSettings } from "@/db";

interface Ctx {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
}

const SettingsCtx = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: async () => {} });
const subscribers = new Set<(s: Settings) => void>();

export function SettingsProvider({ initial, children }: { initial: Settings; children: React.ReactNode }) {
  const [settings, setSettings] = useState(initial);
  useEffect(() => {
    const fn = (s: Settings) => setSettings(s);
    subscribers.add(fn);
    return () => void subscribers.delete(fn);
  }, []);
  const update = useCallback(async (patch: Partial<Settings>) => {
    await saveSettings(patch);
    const next = await loadSettings();
    for (const fn of subscribers) fn(next);
  }, []);
  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsCtx.Provider value={value}>{children}</SettingsCtx.Provider>;
}

export const useSettings = () => useContext(SettingsCtx);
