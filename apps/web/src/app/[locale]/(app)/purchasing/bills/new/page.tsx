import { getTranslations } from "next-intl/server";
import { InvoiceForm } from "@/components/commerce/invoice-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams;
  const t = await getTranslations("commerce.titles");
  return (
    <>
      <PageHeader level="section" title={t("newBill")} />
      <InvoiceForm key={order} kind="purchase" orderId={order} />
    </>
  );
}
