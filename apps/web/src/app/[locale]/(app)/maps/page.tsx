import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { MapsPage } from "@/components/maps/maps-page";

export default async function MapPage() {
  const t = await getTranslations("mapsPage");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <MapsPage />
    </>
  );
}
