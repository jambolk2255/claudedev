import { EditOrder } from "@/components/commerce/edit-order";

export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditOrder id={id} />;
}
