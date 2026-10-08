-- CreateEnum
CREATE TYPE "public"."ProductType" AS ENUM ('stock', 'service');

-- CreateEnum
CREATE TYPE "public"."PartnerType" AS ENUM ('customer', 'supplier');

-- CreateEnum
CREATE TYPE "public"."StockDocumentType" AS ENUM ('opening', 'stock_in', 'stock_out', 'adjustment', 'count', 'transfer');

-- CreateEnum
CREATE TYPE "public"."StockDocumentStatus" AS ENUM ('posted', 'in_transit', 'received');

-- CreateEnum
CREATE TYPE "public"."StockMovementType" AS ENUM ('opening', 'stock_in', 'stock_out', 'adjustment_in', 'adjustment_out', 'transfer_out', 'transfer_in');

-- AlterTable
ALTER TABLE "public"."Organization" ADD COLUMN     "expiryAlertDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "barcode" TEXT,
    "type" "public"."ProductType" NOT NULL DEFAULT 'stock',
    "categoryId" UUID,
    "unitId" UUID,
    "taxRateId" UUID,
    "costPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "sellPrice" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,4),
    "maxLevel" DECIMAL(18,4),
    "trackBatches" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Partner" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "public"."PartnerType" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "taxNo" TEXT,
    "address" TEXT,
    "city" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "creditLimit" DECIMAL(18,2),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Batch" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "expiryDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockLevel" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "avgCost" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BatchBalance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "BatchBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CostLayer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "originalQty" DECIMAL(18,4) NOT NULL,
    "remainingQty" DECIMAL(18,4) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockDocument" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "public"."StockDocumentType" NOT NULL,
    "status" "public"."StockDocumentStatus" NOT NULL DEFAULT 'posted',
    "number" TEXT NOT NULL,
    "warehouseId" UUID NOT NULL,
    "toWarehouseId" UUID,
    "partnerId" UUID,
    "reference" TEXT,
    "reason" TEXT,
    "note" TEXT,
    "documentDate" DATE NOT NULL,
    "totalValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdById" UUID,
    "receivedById" UUID,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockDocumentLine" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "productId" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "systemQuantity" DECIMAL(18,4),
    "unitCost" DECIMAL(18,4),
    "batchNo" TEXT,
    "expiryDate" DATE,
    "note" TEXT,

    CONSTRAINT "StockDocumentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StockMovement" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "batchId" UUID,
    "documentId" UUID,
    "type" "public"."StockMovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitCost" DECIMAL(18,4) NOT NULL,
    "totalCost" DECIMAL(18,4) NOT NULL,
    "balanceAfter" DECIMAL(18,4) NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_organizationId_name_idx" ON "public"."Product"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Product_organizationId_barcode_idx" ON "public"."Product"("organizationId", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_sku_key" ON "public"."Product"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "Partner_organizationId_type_name_idx" ON "public"."Partner"("organizationId", "type", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_organizationId_type_code_key" ON "public"."Partner"("organizationId", "type", "code");

-- CreateIndex
CREATE INDEX "Batch_organizationId_expiryDate_idx" ON "public"."Batch"("organizationId", "expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_productId_batchNo_key" ON "public"."Batch"("productId", "batchNo");

-- CreateIndex
CREATE INDEX "StockLevel_organizationId_warehouseId_idx" ON "public"."StockLevel"("organizationId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_productId_warehouseId_key" ON "public"."StockLevel"("productId", "warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "BatchBalance_batchId_warehouseId_key" ON "public"."BatchBalance"("batchId", "warehouseId");

-- CreateIndex
CREATE INDEX "CostLayer_productId_warehouseId_receivedAt_idx" ON "public"."CostLayer"("productId", "warehouseId", "receivedAt");

-- CreateIndex
CREATE INDEX "StockDocument_organizationId_type_createdAt_idx" ON "public"."StockDocument"("organizationId", "type", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StockDocument_organizationId_number_key" ON "public"."StockDocument"("organizationId", "number");

-- CreateIndex
CREATE INDEX "StockDocumentLine_documentId_idx" ON "public"."StockDocumentLine"("documentId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_productId_createdAt_idx" ON "public"."StockMovement"("organizationId", "productId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_warehouseId_createdAt_idx" ON "public"."StockMovement"("organizationId", "warehouseId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_taxRateId_fkey" FOREIGN KEY ("taxRateId") REFERENCES "public"."TaxRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Partner" ADD CONSTRAINT "Partner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Batch" ADD CONSTRAINT "Batch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Batch" ADD CONSTRAINT "Batch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockLevel" ADD CONSTRAINT "StockLevel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockLevel" ADD CONSTRAINT "StockLevel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockLevel" ADD CONSTRAINT "StockLevel_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchBalance" ADD CONSTRAINT "BatchBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchBalance" ADD CONSTRAINT "BatchBalance_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BatchBalance" ADD CONSTRAINT "BatchBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CostLayer" ADD CONSTRAINT "CostLayer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CostLayer" ADD CONSTRAINT "CostLayer_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocument" ADD CONSTRAINT "StockDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocument" ADD CONSTRAINT "StockDocument_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocument" ADD CONSTRAINT "StockDocument_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocument" ADD CONSTRAINT "StockDocument_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "public"."Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocument" ADD CONSTRAINT "StockDocument_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."StockDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockDocumentLine" ADD CONSTRAINT "StockDocumentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."StockDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StockMovement" ADD CONSTRAINT "StockMovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
