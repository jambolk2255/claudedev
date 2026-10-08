import { getTranslations } from "next-intl/server";
import { CompanySettings } from "@/components/settings/company-settings";

export async function generateMetadata() {
  const t = await getTranslations("nav.items");
  return { title: t("company") };
}

export default function CompanySettingsPage() {
  return <CompanySettings />;
}
