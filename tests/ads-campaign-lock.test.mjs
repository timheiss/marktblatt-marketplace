
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const customerId = "gid://shopify/Customer/25706215604569";
const googleAdsCustomerId = "2908836119";

const campaignName = `Marktblatt | ${customerId}`;

let record;
let updateCalls = 0;
let simulateDuplicateCampaignId = false;

const prismaMock = {
  adsVendorCampaign: {
    async updateMany({ where, data }) {
      updateCalls++;

      if (
        !record ||
        Object.entries(where).some(
          ([key, value]) => record[key] !== value
        )
      ) {
        return { count: 0 };
      }

if (
  simulateDuplicateCampaignId &&
  data.googleCampaignId
) {
  const error = new Error(
    "Unique constraint failed on googleCampaignId"
  );
  error.code = "P2002";
  throw error;
}

      Object.assign(record, data);
      return { count: 1 };
    },
  },
};

mock.module("../app/db.server.js", {
  namedExports: {},
  defaultExport: prismaMock,
});

mock.module("../app/services/google-ads-api.server.js", {
  namedExports: {
    assertMarktblattGoogleAdsCustomer(id) {
      if (id !== googleAdsCustomerId) {
        throw new Error("Falsches Google Ads Konto");
      }
      return id;
    },
    buildMarktblattVendorCampaignName(id) {
      if (id !== customerId) {
        throw new Error("Ungültiger Anbieter");
      }
      return campaignName;
    },
  },
});


const sourcePath = new URL(
  "../app/services/ads-campaign-lock.server.js",
  import.meta.url
);

const source = await readFile(sourcePath, "utf8");

const testSource = source
  .replace(
    '"../db.server"',
    '"../db.server.js"'
  )
  .replace(
    '"./google-ads-api.server"',
    '"./google-ads-api.server.js"'
  );

if (testSource === source) {
  throw new Error("Test-Importpfade konnten nicht angepasst werden.");
}

const temporaryPath = new URL(
  `../app/services/ads-campaign-lock-test-${randomUUID()}.mjs`,
  import.meta.url
);

await writeFile(temporaryPath, testSource, "utf8");

let service;

try {
  service = await import(temporaryPath.href);
} finally {
  const { unlink } = await import("node:fs/promises");
  await unlink(temporaryPath);
}

const {
  acquireAdsCampaignCreationLock,
  markAdsCampaignReconciliationRequired,
  confirmAdsCampaignCreation,
} = service;


test("Erstellungssperre und Fehlerbehandlung", async () => {
  record = {
    customerId,
    googleAdsCustomerId,
    googleCampaignId: null,
    status: "pending",
    creationToken: null,
    creationStartedAt: null,
    creationError: null,
  };

  updateCalls = 0;

  const [first, second] = await Promise.all([
    acquireAdsCampaignCreationLock({
      customerId,
      googleAdsCustomerId,
    }),
    acquireAdsCampaignCreationLock({
      customerId,
      googleAdsCustomerId,
    }),
  ]);

  assert.equal(
    Number(first.acquired) + Number(second.acquired),
    1
  );

  const successful = first.acquired ? first : second;

  assert.equal(record.status, "creating");
  assert.equal(record.creationToken, successful.creationToken);
  assert.ok(record.creationStartedAt instanceof Date);

  const wrongToken = await markAdsCampaignReconciliationRequired({
    customerId,
    googleAdsCustomerId,
    creationToken: "00000000-0000-4000-8000-000000000000",
    errorMessage: "Test",
  });

  assert.equal(wrongToken.updated, false);
  assert.equal(record.status, "creating");

  const correctToken = await markAdsCampaignReconciliationRequired({
    customerId,
    googleAdsCustomerId,
    creationToken: successful.creationToken,
    errorMessage: "Google Ads Ergebnis unklar",
  });

  assert.equal(correctToken.updated, true);
  assert.equal(record.status, "reconciliation_required");
  assert.equal(record.creationToken, successful.creationToken);
  assert.equal(record.creationError, "Google Ads Ergebnis unklar");

  const retry = await acquireAdsCampaignCreationLock({
    customerId,
    googleAdsCustomerId,
  });

  assert.equal(retry.acquired, false);
  assert.equal(record.status, "reconciliation_required");

  assert.equal(updateCalls, 5);
});


test("Google Ads Kampagnenerstellung sicher bestätigen", async () => {
  const token = "12345678-1234-4234-8234-123456789012";
  const campaignId = "12345678901";

  const createRecord = () => ({
    customerId,
    googleAdsCustomerId,
    googleCampaignId: null,
    status: "creating",
    creationToken: token,
    creationStartedAt: new Date(),
    creationError: null,
  });

  // 1. Erfolgreiche Bestätigung
  record = createRecord();

  const success = await confirmAdsCampaignCreation({
    customerId,
    googleAdsCustomerId,
    creationToken: token,
    googleCampaignId: campaignId,
  });

  assert.equal(success.confirmed, true);
  assert.equal(record.googleCampaignId, campaignId);
  assert.equal(record.status, "paused");
  assert.equal(record.creationToken, token);

  // 2. Doppelte Bestätigung verhindern
  const duplicate = await confirmAdsCampaignCreation({
    customerId,
    googleAdsCustomerId,
    creationToken: token,
    googleCampaignId: campaignId,
  });

  assert.equal(duplicate.confirmed, false);
  assert.equal(record.status, "paused");

  // 3. Falscher Erstellungstoken
  record = createRecord();

  const wrongToken = await confirmAdsCampaignCreation({
    customerId,
    googleAdsCustomerId,
    creationToken: "00000000-0000-4000-8000-000000000000",
    googleCampaignId: campaignId,
  });

  assert.equal(wrongToken.confirmed, false);
  assert.equal(record.googleCampaignId, null);
  assert.equal(record.status, "creating");

  // 4. Ungültige Kampagnen-ID
  await assert.rejects(
    confirmAdsCampaignCreation({
      customerId,
      googleAdsCustomerId,
      creationToken: token,
      googleCampaignId: "invalid-id",
    }),
    /Ungültige Kampagnen-ID/
  );

  assert.equal(record.googleCampaignId, null);

  // 5. Falsches Google Ads-Konto
  await assert.rejects(
    confirmAdsCampaignCreation({
      customerId,
      googleAdsCustomerId: "6163027803",
      creationToken: token,
      googleCampaignId: campaignId,
    }),
    /Falsches Google Ads Konto/
  );

  assert.equal(record.status, "creating");
});


test("Doppelte Google Ads Kampagnen-ID wird abgewiesen", async () => {
  const token = "12345678-1234-4234-8234-123456789012";

  record = {
    customerId,
    googleAdsCustomerId,
    googleCampaignId: null,
    status: "creating",
    creationToken: token,
    creationStartedAt: new Date(),
    creationError: null,
  };

  simulateDuplicateCampaignId = true;

  try {
    await assert.rejects(
      confirmAdsCampaignCreation({
        customerId,
        googleAdsCustomerId,
        creationToken: token,
        googleCampaignId: "12345678901",
      }),
      (error) => error.code === "P2002"
    );

    assert.equal(record.googleCampaignId, null);
    assert.equal(record.status, "creating");
    assert.equal(record.creationToken, token);
  } finally {
    simulateDuplicateCampaignId = false;
  }
});
