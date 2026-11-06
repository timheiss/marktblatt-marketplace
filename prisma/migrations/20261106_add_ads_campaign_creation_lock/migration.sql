-- AlterTable
ALTER TABLE "AdsVendorCampaign" ADD COLUMN     "creationError" TEXT,
ADD COLUMN     "creationStartedAt" TIMESTAMP(3),
ADD COLUMN     "creationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdsVendorCampaign_creationToken_key" ON "AdsVendorCampaign"("creationToken");
