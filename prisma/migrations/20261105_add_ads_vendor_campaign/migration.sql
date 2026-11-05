-- Neue Google Ads Kampagnenzuordnung pro Anbieter

CREATE TABLE "AdsVendorCampaign" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "googleAdsCustomerId" TEXT NOT NULL DEFAULT '2908836119',
    "googleCampaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsVendorCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdsVendorCampaign_customerId_key"
ON "AdsVendorCampaign"("customerId");

CREATE UNIQUE INDEX "AdsVendorCampaign_googleCampaignId_key"
ON "AdsVendorCampaign"("googleCampaignId");

CREATE INDEX "AdsVendorCampaign_status_idx"
ON "AdsVendorCampaign"("status");
