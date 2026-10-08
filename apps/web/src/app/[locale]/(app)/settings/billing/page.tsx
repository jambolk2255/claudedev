import { BillingPage } from "@/components/billing/billing-page";

export default async function SettingsBillingPage({ searchParams }: { searchParams: Promise<{ paid?: string; cancelled?: string }> }) {
  const { paid, cancelled } = await searchParams;
  return <BillingPage paid={paid} cancelled={cancelled} />;
}
