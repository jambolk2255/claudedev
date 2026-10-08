import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "si"],
  defaultLocale: "en",
  // English URLs stay clean (/dashboard); Sinhala uses /si/dashboard.
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
