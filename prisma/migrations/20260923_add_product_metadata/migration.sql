-- AlterTable
ALTER TABLE "MarketplaceProduct"
ADD COLUMN "adult" BOOLEAN,
ADD COLUMN "ageGroup" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "color" TEXT,
ADD COLUMN "condition" TEXT,
ADD COLUMN "gender" TEXT,
ADD COLUMN "gtin" TEXT,
ADD COLUMN "itemGroupId" TEXT,
ADD COLUMN "material" TEXT,
ADD COLUMN "metaDescription" TEXT,
ADD COLUMN "metaTitle" TEXT,
ADD COLUMN "mpn" TEXT,
ADD COLUMN "productType" TEXT,
ADD COLUMN "size" TEXT,
ADD COLUMN "sku" TEXT;