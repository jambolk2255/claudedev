import { getTranslations } from "next-intl/server";
import { Dashboard } from "@/components/dashboard/dashboard";

export async function generateMetadata() {
  const t = await getTranslations("nav.items");
  return { title: t("dashboard") };
}

export default function DashboardPage() {
  return <Dashboard />;
}
