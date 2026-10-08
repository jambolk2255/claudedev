import { notFound } from "next/navigation";
import { PartnersList } from "@/components/contacts/partners-list";

const TYPES = { customers: "customer", suppliers: "supplier" } as const;

export function generateStaticParams() {
  return Object.keys(TYPES).map((type) => ({ type }));
}

export default async function PartnersPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const partnerType = TYPES[type as keyof typeof TYPES];
  if (!partnerType) notFound();
  return <PartnersList key={partnerType} type={partnerType} />;
}
