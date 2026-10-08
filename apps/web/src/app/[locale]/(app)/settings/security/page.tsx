import { getTranslations } from "next-intl/server";
import { SecuritySettings } from "@/components/settings/security-settings";

export async function generateMetadata() {
  const t = await getTranslations("nav.items");
  return { title: t("security") };
}

export default function SecuritySettingsPage() {
  return <SecuritySettings />;
}
