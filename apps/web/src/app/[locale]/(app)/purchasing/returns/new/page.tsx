import { getTranslations } from "next-intl/server";
import { ReturnForm } from "@/components/commerce/returns";
import { PageHeader } from "@/components/layout/page-header";

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ invoice?: string }> }) {
  const { invoice } = await searchParams;
  const t = await getTranslations("commerce.titles");
  return (
    <>
      <PageHeader level="section" title={t("newDebit")} />
      <ReturnForm key={invoice} kind="outward" invoiceId={invoice} />
    </>
  );
}
