import { InvoiceDetail } from "@/components/commerce/invoice-detail";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InvoiceDetail id={id} kind="sales" />;
}
