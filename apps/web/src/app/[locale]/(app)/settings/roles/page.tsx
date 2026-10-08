import { getTranslations } from "next-intl/server";
import { RolesSettings } from "@/components/settings/roles-settings";

export async function generateMetadata() {
  const t = await getTranslations("nav.items");
  return { title: t("roles") };
}

export default function RolesSettingsPage() {
  return <RolesSettings />;
}
