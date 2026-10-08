-- CreateEnum
CREATE TYPE "public"."OrderKind" AS ENUM ('purchase', 'quotation', 'sales');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('draft', 'confirmed', 'partial', 'fulfilled', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."InvoiceKind" AS ENUM ('sales', 'purchase');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('open', 'partially_paid', 'paid', 'void');

-- CreateEnum
CREATE TYPE "public"."NoteKind" AS ENUM ('credit', 'debit');

-- CreateEnum
CREATE TYPE "public"."NoteStatus" AS ENUM ('open', 'applied');

-- CreateEnum
CREATE TYPE "public"."PaymentKind" AS ENUM ('receipt', 'payment');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'cheque', 'card');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('posted', 'bounced');

-- CreateEnum
CREATE TYPE "public"."ChequeStatus" AS ENUM ('pending', 'cleared', 'bounced');

-- CreateEnum
CREATE TYPE "public"."AccountType" AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."StockDocumentType" ADD VALUE 'grn';
ALTER TYPE "public"."StockDocumentType" ADD VALUE 'delivery';
ALTER TYPE "public"."StockDocumentType" ADD VALUE 'return_outward';
ALTER TYPE "public"."StockDocumentType" ADD VALUE 'return_inward';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."StockMovementType" ADD VALUE 'purchase_in';
ALTER TYPE "public"."StockMovementType" ADD VALUE 'sale_out';
ALTER TYPE "public"."StockMovementType" ADD VALUE 'return_out';
ALTER TYPE "public"."StockMovementType" ADD VALUE 'return_in';

-- AlterTable
ALTER TABLE "public"."StockDocument" ADD COLUMN     "orderId" UUID;

-- AlterTable
ALTER TABLE "public"."StockDocumentLine" ADD COLUMN     "orderLineId" UUID;

-- CreateTable
CREATE TABLE "public"."Order" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "public"."OrderKind" NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'draft',
    "orderDate" DATE NOT NULL,
    "expectedDate" DATE,
    "reference" TEXT,
    "notes" TEXT,
    "deliveryAddress" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ssclTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "convertedFromId" UUID,
    "trackingToken" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OrderLine" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "fulfilledQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "invoicedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRateId" UUID,
    "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invoice" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "public"."InvoiceKind" NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "orderId" UUID,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "supplierRef" TEXT,
    "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'open',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discountTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(18,2) NOT NULL,
    "ssclTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "journalEntryId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."InvoiceLine" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID,
    "orderLineId" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxRateId" UUID,
    "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "costAmount" DECIMAL(18,2),

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Note" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "public"."NoteKind" NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "invoiceId" UUID,
    "stockDocumentId" UUID,
    "noteDate" DATE NOT NULL,
    "reason" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "taxTotal" DECIMAL(18,2) NOT NULL,
    "ssclTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "amountApplied" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "public"."NoteStatus" NOT NULL DEFAULT 'open',
    "journalEntryId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NoteLine" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxRate" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "NoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "kind" "public"."PaymentKind" NOT NULL,
    "number" TEXT NOT NULL,
    "partnerId" UUID NOT NULL,
    "paymentDate" DATE NOT NULL,
    "method" "public"."PaymentMethod" NOT NULL,
    "accountId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "amountAllocated" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'posted',
    "reference" TEXT,
    "chequeNo" TEXT,
    "chequeDate" DATE,
    "chequeStatus" "public"."ChequeStatus",
    "notes" TEXT,
    "journalEntryId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Allocation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "paymentId" UUID,
    "noteId" UUID,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."AccountType" NOT NULL,
    "systemKey" TEXT,
    "isCash" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JournalEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "memo" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."JournalLine" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "entryId" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "partnerId" UUID,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "public"."Order"("trackingToken");

-- CreateIndex
CREATE INDEX "Order_organizationId_kind_status_idx" ON "public"."Order"("organizationId", "kind", "status");

-- CreateIndex
CREATE INDEX "Order_organizationId_partnerId_idx" ON "public"."Order"("organizationId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_organizationId_number_key" ON "public"."Order"("organizationId", "number");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "public"."OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_kind_status_idx" ON "public"."Invoice"("organizationId", "kind", "status");

-- CreateIndex
CREATE INDEX "Invoice_organizationId_partnerId_idx" ON "public"."Invoice"("organizationId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_organizationId_number_key" ON "public"."Invoice"("organizationId", "number");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "public"."InvoiceLine"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_stockDocumentId_key" ON "public"."Note"("stockDocumentId");

-- CreateIndex
CREATE INDEX "Note_organizationId_kind_status_idx" ON "public"."Note"("organizationId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Note_organizationId_number_key" ON "public"."Note"("organizationId", "number");

-- CreateIndex
CREATE INDEX "NoteLine_noteId_idx" ON "public"."NoteLine"("noteId");

-- CreateIndex
CREATE INDEX "Payment_organizationId_kind_paymentDate_idx" ON "public"."Payment"("organizationId", "kind", "paymentDate");

-- CreateIndex
CREATE INDEX "Payment_organizationId_partnerId_idx" ON "public"."Payment"("organizationId", "partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_organizationId_number_key" ON "public"."Payment"("organizationId", "number");

-- CreateIndex
CREATE INDEX "Allocation_invoiceId_idx" ON "public"."Allocation"("invoiceId");

-- CreateIndex
CREATE INDEX "Allocation_paymentId_idx" ON "public"."Allocation"("paymentId");

-- CreateIndex
CREATE INDEX "Allocation_noteId_idx" ON "public"."Allocation"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_organizationId_code_key" ON "public"."Account"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Account_organizationId_systemKey_key" ON "public"."Account"("organizationId", "systemKey");

-- CreateIndex
CREATE INDEX "JournalEntry_organizationId_entryDate_idx" ON "public"."JournalEntry"("organizationId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_organizationId_sourceType_sourceId_idx" ON "public"."JournalEntry"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_organizationId_number_key" ON "public"."JournalEntry"("organizationId", "number");

-- CreateIndex
CREATE INDEX "JournalLine_organizationId_accountId_idx" ON "public"."JournalLine"("organizationId", "accountId");

-- CreateIndex
CREATE INDEX "JournalLine_organizationId_partnerId_idx" ON "public"."JournalLine"("organizationId", "partnerId");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "public"."JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "StockDocument_orderId_idx" ON "public"."StockDocument"("orderId");

-- AddForeignKey
ALTER TABLE "public"."StockDocument" ADD CONSTRAINT "StockDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "public"."Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Order" ADD CONSTRAINT "Order_convertedFromId_fkey" FOREIGN KEY ("convertedFromId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OrderLine" ADD CONSTRAINT "OrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "public"."Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceLine" ADD CONSTRAINT "InvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "public"."Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Note" ADD CONSTRAINT "Note_stockDocumentId_fkey" FOREIGN KEY ("stockDocumentId") REFERENCES "public"."StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoteLine" ADD CONSTRAINT "NoteLine_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "public"."Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoteLine" ADD CONSTRAINT "NoteLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "public"."Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Allocation" ADD CONSTRAINT "Allocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Allocation" ADD CONSTRAINT "Allocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Allocation" ADD CONSTRAINT "Allocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Allocation" ADD CONSTRAINT "Allocation_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "public"."Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalEntry" ADD CONSTRAINT "JournalEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."JournalLine" ADD CONSTRAINT "JournalLine_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "public"."Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
