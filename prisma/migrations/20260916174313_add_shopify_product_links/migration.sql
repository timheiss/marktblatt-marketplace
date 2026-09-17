/*
  Warnings:

  - A unique constraint covering the columns `[shopifyVariantId]` on the table `MarketplaceProduct` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MarketplaceProduct" ADD COLUMN "shopifyHandle" TEXT;
ALTER TABLE "MarketplaceProduct" ADD COLUMN "shopifyVariantId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProduct_shopifyVariantId_key" ON "MarketplaceProduct"("shopifyVariantId");

-- CreateIndex
CREATE INDEX "MarketplaceProduct_sourceUrl_idx" ON "MarketplaceProduct"("sourceUrl");
