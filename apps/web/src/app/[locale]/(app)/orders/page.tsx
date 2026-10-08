import { getTranslations } from "next-intl/server";
import { TrackingBoard } from "@/components/commerce/tracking-board";
import { PageHeader } from "@/components/layout/page-header";

export default async function OrderTrackingPage() {
  const t = await getTranslations("commerce.board");
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <TrackingBoard />
    </>
  );
}
