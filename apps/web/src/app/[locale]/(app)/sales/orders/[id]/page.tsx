import { OrderDetail } from "@/components/commerce/order-detail";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail id={id} kind="sales" />;
}
