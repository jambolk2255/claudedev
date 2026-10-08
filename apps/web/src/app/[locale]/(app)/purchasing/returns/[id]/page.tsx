import { NoteDetailView } from "@/components/commerce/returns";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoteDetailView id={id} kind="debit" />;
}
