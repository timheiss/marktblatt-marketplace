import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
const API_BASE_URL = 'https://marktblatt-marketplace.onrender.com';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const {data} = shopify;

  const customerId = data?.selected?.[0]?.id;
const [tokenAvailable, setTokenAvailable] = useState(false);
const [connectionError, setConnectionError] = useState('');
const [checking, setChecking] = useState(true);
const [verification, setVerification] = useState(null);
const [downloading, setDownloading] = useState(false);
const [downloadError, setDownloadError] = useState('');
const [documentDownloadUrl, setDocumentDownloadUrl] = useState('');
const [reviewNote, setReviewNote] = useState('');
const [reviewing, setReviewing] = useState(false);
const [reviewError, setReviewError] = useState('');
const [reviewSuccess, setReviewSuccess] = useState('');

useEffect(() => {
  let active = true;

  setDocumentDownloadUrl('');
  setDownloadError('');
  setReviewError('');
  setReviewSuccess('');
  setReviewNote('');
  setVerification(null);
  setTokenAvailable(false);
  setConnectionError('');
  setChecking(true);

  async function checkSession() {
    try {
      const token = await shopify.sessionToken.get();

      if (!token) {
        throw new Error(
          'Kein Shopify-Sitzungstoken verfügbar.'
        );
      }

if (!customerId) {
  throw new Error('Keine Shopify-Kunden-ID vorhanden.');
}

const response = await fetch(
  `${API_BASE_URL}/api/admin-vendor-verification?customerId=${encodeURIComponent(customerId)}`,
  {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  }
);

if (!response.ok) {
  throw new Error(
    `Die Admin-API antwortet mit HTTP ${response.status}.`
  );
}

const result = await response.json();

if (!result.success) {
  throw new Error(
    result.error || 'Verifizierungsdaten konnten nicht geladen werden.'
  );
}

if (active) {
  setTokenAvailable(true);
  setVerification(result.verification);
}
    } catch (error) {
      if (active) {
        setConnectionError(
          error.message ||
          'Die Shopify-Authentifizierung ist fehlgeschlagen.'
        );
      }
    } finally {
      if (active) {
        setChecking(false);
      }
    }
  }

  checkSession();

  return () => {
    active = false;
  };
}, [customerId]);

async function downloadDocument() {
  if (!customerId || downloading) return;

  setDownloading(true);
  setDownloadError('');
  setDocumentDownloadUrl('');

    try {
      const token = await shopify.sessionToken.get();

      if (!token) {
        throw new Error('Keine gültige Shopify-Admin-Sitzung.');
      }

      const response = await fetch(
        `${API_BASE_URL}/api/admin-vendor-document-token`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({customerId}),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success || !result.token) {
        throw new Error(
          result.error || 'Downloadberechtigung konnte nicht erstellt werden.'
        );
      }

      const downloadUrl =
        `${API_BASE_URL}/api/verification-document-download?token=${encodeURIComponent(result.token)}`;

      // Download über die von Shopify unterstützte Link-Navigation.
      // Der kurzlebige Token wird nur einmal verwendet.
      setDocumentDownloadUrl(downloadUrl);
    } catch (error) {
      setDownloadError(
        error.message || 'Der Download konnte nicht vorbereitet werden.'
      );
    } finally {
      setDownloading(false);
    }
  }

async function reviewVendor(decision) {
  if (
    !customerId ||
    reviewing ||
    verification?.status !== 'pending'
  ) {
    return;
  }

  const note = reviewNote.trim();

  if (decision === 'rejected' && !note) {
    setReviewError('Bitte eine Begründung für die Ablehnung eingeben.');
    return;
  }

  setReviewing(true);
  setReviewError('');
  setReviewSuccess('');

  try {
    const token = await shopify.sessionToken.get();

    if (!token) {
      throw new Error('Keine gültige Shopify-Admin-Sitzung.');
    }

    const response = await fetch(
      `${API_BASE_URL}/api/admin-vendor-verification`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          customerId,
          decision,
          reviewNote: note,
        }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || 'Die Entscheidung konnte nicht gespeichert werden.'
      );
    }

    setVerification((previous) => ({
      ...previous,
      status: result.status,
      reviewNote: result.reviewNote || '',
      reviewedAt: new Date().toISOString(),
    }));

    setReviewSuccess(
      decision === 'verified'
        ? 'Der Anbieter wurde erfolgreich freigegeben.'
        : 'Der Anbieter wurde abgelehnt.'
    );

    setReviewNote('');
  } catch (error) {
    setReviewError(
      error.message || 'Die Entscheidung konnte nicht gespeichert werden.'
    );
  } finally {
    setReviewing(false);
  }
}

  return (
    <s-admin-block heading="Marktblatt – Anbieter-Prüfung">
      <s-stack direction="block" gap="base">

        <s-text type="strong">
          Anbieter-Verifizierung
        </s-text>

        {customerId ? (
          <>
            <s-text>
              Ausgewählter Kunde:
            </s-text>

            <s-text>
              {customerId}
            </s-text>

{checking && (
  <s-banner tone="info">
    Shopify-Authentifizierung wird geprüft ...
  </s-banner>
)}

{connectionError && (
  <s-banner tone="critical">
    {connectionError}
  </s-banner>
)}

{tokenAvailable && verification && (
  <>
    <s-banner tone="success">
      Verbindung zur Marktblatt-Admin-API erfolgreich.
    </s-banner>

    <s-text type="strong">
      Verifizierungsstatus: {verification.status}
    </s-text>

    <s-text>
      Firmenname: {verification.companyName || 'Nicht angegeben'}
    </s-text>

    <s-text>
      Onlineshop: {verification.shopUrl || 'Nicht angegeben'}
    </s-text>

    <s-text>
      Gewerbenachweis: {verification.documentUploaded ? 'Hochgeladen' : 'Nicht vorhanden'}
    </s-text>
    {verification.documentUploaded && (
      <>
        <s-button
          onClick={downloadDocument}
          disabled={downloading}
        >
          {downloading
            ? 'Download wird vorbereitet ...'
            : 'Gewerbenachweis herunterladen'}
        </s-button>

        {documentDownloadUrl && (
          <s-link
            href={documentDownloadUrl}
            target="_blank"
          >
            Download starten
          </s-link>
        )}

        {downloadError && (
          <s-banner tone="critical">
            {downloadError}
          </s-banner>
        )}
      </>
    )}
    {verification.status === 'pending' && (
      <>
        <s-text type="strong">
          Anbieterprüfung
        </s-text>

        <s-text>
          Bitte die Unternehmensangaben und den
          Gewerbenachweis vor der Freigabe prüfen.
        </s-text>

        <s-text-field
          label="Begründung / Anmerkung"
          value={reviewNote}
          onInput={(event) =>
            setReviewNote(event.currentTarget.value)
          }
        />

        <s-stack direction="inline" gap="base">
          <s-button
            variant="primary"
            disabled={reviewing}
            onClick={() => reviewVendor('verified')}
          >
            Anbieter freigeben
          </s-button>

          <s-button
            disabled={reviewing}
            onClick={() => reviewVendor('rejected')}
          >
            Anbieter ablehnen
          </s-button>
        </s-stack>
      </>
    )}

    {reviewError && (
      <s-banner tone="critical">
        {reviewError}
      </s-banner>
    )}

    {reviewSuccess && (
      <s-banner tone="success">
        {reviewSuccess}
      </s-banner>
    )}
  </>
)}
          </>
        ) : (
          <s-banner tone="warning">
            Die Kunden-ID konnte nicht ermittelt werden.
          </s-banner>
        )}

      </s-stack>
    </s-admin-block>
  );
}