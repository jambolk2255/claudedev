import { JournalPage } from "@/components/finance/journal";

export default async function GeneralJournalPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams;
  return <JournalPage key={account} initialAccount={account} />;
}
