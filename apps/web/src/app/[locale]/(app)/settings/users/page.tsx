import { getTranslations } from "next-intl/server";
import { UsersSettings } from "@/components/settings/users-settings";

export async function generateMetadata() {
  const t = await getTranslations("nav.items");
  return { title: t("users") };
}

export default function UsersSettingsPage() {
  return <UsersSettings />;
}
