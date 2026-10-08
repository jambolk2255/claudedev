import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { PLANNED_MODULES } from "@/components/layout/nav";

export function generateStaticParams() {
  return PLANNED_MODULES.map((m) => ({ module: m.key }));
}

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!PLANNED_MODULES.some((m) => m.key === module)) return {};
  const t = await getTranslations("nav.items");
  return { title: t(module) };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!PLANNED_MODULES.some((m) => m.key === module)) notFound();
  return <ComingSoon moduleKey={module} />;
}
