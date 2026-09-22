-- AlterTable
ALTER TABLE "MarketplaceProduct"
ADD COLUMN "compareAtPrice" TEXT,
ADD COLUMN "compareAtPriceSource" TEXT;

-- AlterTable
ALTER TABLE "Subscription"
ADD COLUMN "compareAtPricesEnabled" BOOLEAN NOT NULL DEFAULT true;
