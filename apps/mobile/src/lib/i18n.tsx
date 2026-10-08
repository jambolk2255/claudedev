import { getLocales } from "expo-localization";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, type MessageKey } from "./locales/en";
import { si } from "./locales/si";
import { storage } from "./storage";

export type Lang = "en" | "si";
const DICTS: Record<Lang, Record<MessageKey, string>> = { en, si };
const LANG_KEY = "sf.lang";

type Params = Record<string, string | number>;
interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey, params?: Params) => string;
  money: (v: unknown, currency?: string) => string;
  compactMoney: (v: unknown) => string;
  qty: (v: unknown) => string;
  date: (v: string | Date) => string;
}

const Ctx = createContext<I18n | null>(null);
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function I18nProvider({ children, currency = "LKR" }: { children: React.ReactNode; currency?: string }) {
  const [lang, setLangState] = useState<Lang>(getLocales()[0]?.languageCode === "si" ? "si" : "en");
  useEffect(() => {
    void storage.get(LANG_KEY).then((v) => (v === "si" || v === "en") && setLangState(v));
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    void storage.set(LANG_KEY, l);
  }, []);

  const value = useMemo<I18n>(() => {
    const locale = lang === "si" ? "si-LK" : "en-LK";
    const dict = DICTS[lang];
    const nf = (cur: string) => new Intl.NumberFormat(locale, { style: "currency", currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const q = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
    const d = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
    return {
      lang,
      setLang,
      t: (key, params) => {
        let s = dict[key] ?? en[key] ?? key;
        if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
      money: (v, cur = currency) => nf(cur).format(num(v)),
      compactMoney: (v) => new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(num(v)),
      qty: (v) => q.format(num(v)),
      date: (v) => d.format(new Date(v)),
    };
  }, [lang, setLang, currency]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n outside I18nProvider");
  return ctx;
}
