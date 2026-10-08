import { Prisma } from "@prisma/client";
import { DEFAULT_DOCUMENT_PREFIXES, type DocumentType } from "@stockflow/schemas";

/** Internal series that are not shown in the numbering settings. */
const INTERNAL_PREFIXES = { product: "P", customer: "CUS", supplier: "SUP" } as const;
export type SequenceType = DocumentType | keyof typeof INTERNAL_PREFIXES;

/**
 * Atomically reserves the next number of a series inside the caller's transaction.
 * The row lock taken by UPDATE serialises concurrent callers, so numbers never repeat.
 */
export async function nextNumber(tx: Prisma.TransactionClient, organizationId: string, type: SequenceType): Promise<string> {
  const internal = type in INTERNAL_PREFIXES;
  const prefix = internal ? INTERNAL_PREFIXES[type as keyof typeof INTERNAL_PREFIXES] : DEFAULT_DOCUMENT_PREFIXES[type as DocumentType];
  await tx.$executeRaw`
    INSERT INTO "DocumentSequence" (id, "organizationId", type, prefix, "includeYear", padding, "nextNumber", "updatedAt")
    VALUES (gen_random_uuid(), ${organizationId}::uuid, ${type}, ${prefix}, ${!internal}, ${internal ? 4 : 5}, 1, now())
    ON CONFLICT ("organizationId", type) DO NOTHING`;
  const rows = await tx.$queryRaw<{ prefix: string; includeYear: boolean; padding: number; n: number }[]>`
    UPDATE "DocumentSequence" SET "nextNumber" = "nextNumber" + 1, "updatedAt" = now()
    WHERE "organizationId" = ${organizationId}::uuid AND type = ${type}
    RETURNING prefix, "includeYear", padding, "nextNumber" - 1 AS n`;
  const row = rows[0]!;
  return [row.prefix, row.includeYear ? new Date().getFullYear() : null, String(row.n).padStart(row.padding, "0")].filter(Boolean).join("-");
}
