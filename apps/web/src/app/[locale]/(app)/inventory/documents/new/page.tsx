import { STOCK_DOCUMENT_TYPES, type StockDocumentType } from "@stockflow/schemas";
import { StockDocumentForm } from "@/components/inventory/document-form";

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ type?: string; product?: string }> }) {
  const { type, product } = await searchParams;
  const initialType = STOCK_DOCUMENT_TYPES.includes(type as StockDocumentType) ? (type as StockDocumentType) : undefined;
  return <StockDocumentForm key={`${initialType}-${product}`} initialType={initialType} initialProductId={product} />;
}
