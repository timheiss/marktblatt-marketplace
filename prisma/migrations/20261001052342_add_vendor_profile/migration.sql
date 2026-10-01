-- CreateTable
CREATE TABLE "VendorProfile" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "companyDescription" TEXT,
    "backgroundImageId" TEXT,
    "discountCode" TEXT,
    "discountPercent" INTEGER,
    "discountMinimumOrderValue" TEXT,
    "homepageUrl" TEXT,
    "imprintUrl" TEXT,
    "withdrawalUrl" TEXT,
    "facebookUrl" TEXT,
    "instagramUrl" TEXT,
    "tiktokUrl" TEXT,
    "youtubeUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorProfile_customerId_key" ON "VendorProfile"("customerId");

-- CreateIndex
CREATE INDEX "VendorProfile_customerId_idx" ON "VendorProfile"("customerId");

