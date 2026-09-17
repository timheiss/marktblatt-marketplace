-- CreateTable
CREATE TABLE "MarketplaceProduct" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" TEXT,
    "currency" TEXT,
    "vendor" TEXT,
    "brand" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "images" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "shopifyProductId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProduct_shopifyProductId_key" ON "MarketplaceProduct"("shopifyProductId");

-- CreateIndex
CREATE INDEX "MarketplaceProduct_customerId_idx" ON "MarketplaceProduct"("customerId");

-- CreateIndex
CREATE INDEX "MarketplaceProduct_status_idx" ON "MarketplaceProduct"("status");
