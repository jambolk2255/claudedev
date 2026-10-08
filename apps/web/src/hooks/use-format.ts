"use client";

import { useLocale } from "next-intl";
import { useMemo } from "react";
import { useMe } from "./use-auth";

/** Number formatting in the user's language and the organization's currency. */
export function useFormat() {
  const locale = useLocale();
  const { data: me } = useMe();
  const currency = me?.organization.currency ?? "LKR";
  return useMemo(() => {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const compactMoney = new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 });
    const qty = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });
    const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
    const dateTime = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? 0 : Number(v));
    return {
      currency,
      money: (v: unknown) => money.format(num(v)),
      compactMoney: (v: unknown) => compactMoney.format(num(v)),
      qty: (v: unknown) => qty.format(num(v)),
      date: (v: string | Date) => date.format(new Date(v)),
      dateTime: (v: string | Date) => dateTime.format(new Date(v)),
    };
  }, [locale, currency]);
}
