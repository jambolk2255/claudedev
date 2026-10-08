import { getTranslations } from "next-intl/server";
import { OrderForm } from "@/components/commerce/order-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewOrderPage() {
  const t = await getTranslations("commerce.titles");
  return (
    <>
      <PageHeader level="section" title={t("newQuotation")} />
      <OrderForm kind="quotation" />
    </>
  );
}
