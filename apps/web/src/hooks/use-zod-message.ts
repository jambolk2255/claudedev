"use client";

import { useTranslations } from "next-intl";
import { useCallback } from "react";

/** Translates schema messages ("password.min", "too_small:2", "required") into the current language. */
export function useZodMessage() {
  const t = useTranslations("validation");
  return useCallback(
    (message?: string) => {
      if (!message) return undefined;
      const [rawKey, arg] = message.split(":");
      const key = rawKey!.replace(/\./g, "_");
      if (!t.has(key)) return t("invalid");
      return arg !== undefined ? t(key, { n: Number(arg) }) : t(key);
    },
    [t],
  );
}
