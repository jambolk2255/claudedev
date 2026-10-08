import { getTranslations } from "next-intl/server";
import { AuditSettings } from "@/components/settings/audit-settings";

export async function generateMetadata() {
  const t = await getTranslations("nav.items");
  return { title: t("audit") };
}

export default function AuditSettingsPage() {
  return <AuditSettings />;
}
