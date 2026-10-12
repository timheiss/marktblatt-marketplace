import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

const API_BASE_URL =
  'https://marktblatt-marketplace.onrender.com';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [companyName, setCompanyName] = useState('');
  const [shopUrl, setShopUrl] = useState('');

  const [status, setStatus] = useState('not_submitted');
  const [reviewNote, setReviewNote] = useState('');

const [loading, setLoading] = useState(true);
const [error, setError] = useState('');

const [saving, setSaving] = useState(false);
const [saveSuccess, setSaveSuccess] = useState('');
const [saveError, setSaveError] = useState('');

const [documentFile, setDocumentFile] = useState(null);
const [documentUploaded, setDocumentUploaded] = useState(false);
const [uploading, setUploading] = useState(false);
const [uploadSuccess, setUploadSuccess] = useState('');
const [uploadError, setUploadError] = useState('');

const [submitting, setSubmitting] = useState(false);
const [submitSuccess, setSubmitSuccess] = useState('');
const [submitError, setSubmitError] = useState('');
const [companyDataSaved, setCompanyDataSaved] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadVerification() {
      try {
        const token = await shopify.sessionToken.get();

        const response = await fetch(
          `${API_BASE_URL}/api/vendor-verification`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(
            data.error ||
            'Verifizierungsstatus konnte nicht geladen werden.'
          );
        }

        if (!active) return;

        const verification = data.verification || {};

        setStatus(
          verification.status || 'not_submitted'
        );

        setCompanyName(
          verification.companyName || ''
        );

        setShopUrl(
          verification.shopUrl || ''
        );

        setReviewNote(
          verification.reviewNote || ''
        );
setDocumentUploaded(
  Boolean(verification.documentUploaded)
);

setCompanyDataSaved(
  Boolean(
    verification.companyName &&
    verification.shopUrl
  )
);

      } catch (err) {
        if (active) {
          setError(
            err.message ||
            'Verifizierungsstatus konnte nicht geladen werden.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadVerification();

    return () => {
      active = false;
    };
  }, []);

  async function saveCompanyData() {
    if (saving || loading || error) return;

    setSaving(true);
    setSaveSuccess('');
    setSaveError('');

    try {
      const token = await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/vendor-verification`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            companyName: companyName.trim(),
            shopUrl: shopUrl.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Unternehmensdaten konnten nicht gespeichert werden.'
        );
      }

      setCompanyName(data.verification.companyName);
      setShopUrl(data.verification.shopUrl);
setCompanyDataSaved(true);


      setSaveSuccess(
        'Ihre Unternehmensdaten wurden erfolgreich gespeichert.'
      );
    } catch (err) {
      setSaveError(
        err.message ||
        'Unternehmensdaten konnten nicht gespeichert werden.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function uploadDocument() {
    if (
      !documentFile ||
      uploading ||
      loading ||
      error ||
      status === 'pending' ||
      status === 'verified'
    ) {
      return;
    }

    setUploading(true);
    setUploadSuccess('');
    setUploadError('');

    try {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
      ];

      if (!allowedTypes.includes(documentFile.type)) {
        throw new Error(
          'Bitte wählen Sie eine PDF-, JPG- oder PNG-Datei.'
        );
      }

      if (
        documentFile.size === 0 ||
        documentFile.size > 10 * 1024 * 1024
      ) {
        throw new Error(
          'Die Datei darf maximal 10 MB groß sein.'
        );
      }

      const token = await shopify.sessionToken.get();

      const formData = new FormData();
      formData.append('document', documentFile);

      const response = await fetch(
        `${API_BASE_URL}/api/vendor-verification-upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Das Dokument konnte nicht hochgeladen werden.'
        );
      }

      setDocumentUploaded(true);
      setDocumentFile(null);

      setUploadSuccess(
        'Ihr Unternehmensnachweis wurde erfolgreich hochgeladen.'
      );
    } catch (err) {
      setUploadError(
        err.message ||
        'Das Dokument konnte nicht hochgeladen werden.'
      );
    } finally {
      setUploading(false);
    }
  }

  async function submitVerification() {
    if (
      submitting ||
      saving ||
      uploading ||
      loading ||
      error ||
      !companyDataSaved ||
      !documentUploaded ||
      !['not_submitted', 'rejected'].includes(status)
    ) {
      return;
    }

    setSubmitting(true);
    setSubmitSuccess('');
    setSubmitError('');

    try {
      const token = await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/vendor-verification`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'submit',
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Der Verifizierungsantrag konnte nicht eingereicht werden.'
        );
      }

      setStatus('pending');
      setReviewNote('');

      setSubmitSuccess(
        'Ihr Verifizierungsantrag wurde erfolgreich eingereicht und wird von Marktblatt geprüft.'
      );
    } catch (err) {
      setSubmitError(
        err.message ||
        'Der Verifizierungsantrag konnte nicht eingereicht werden.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function getStatusText() {
    switch (status) {
      case 'pending':
        return 'Ihre Verifizierung wird derzeit von Marktblatt geprüft.';

      case 'verified':
        return 'Ihr Unternehmen wurde erfolgreich verifiziert.';

      case 'rejected':
        return 'Ihre Verifizierung wurde abgelehnt. Bitte beachten Sie die Rückmeldung von Marktblatt.';

      default:
        return 'Ihr Anbieterprofil ist noch nicht verifiziert.';
    }
  }

  function getStatusTone() {
    switch (status) {
      case 'verified':
        return 'success';

      case 'rejected':
        return 'critical';

      default:
        return 'warning';
    }
  }

  return (
    <s-page heading="Anbieter-Verifizierung">
      <s-stack direction="block" gap="base">

        <s-section heading="Verifizierungsstatus">
          <s-stack direction="block" gap="small">

            {loading && (
              <s-text>
                Verifizierungsstatus wird geladen ...
              </s-text>
            )}

            {error && (
              <s-banner tone="critical">
                {error}
              </s-banner>
            )}

            {!loading && !error && (
              <s-banner tone={getStatusTone()}>
                {getStatusText()}
              </s-banner>
            )}

            {status === 'rejected' && reviewNote && !error && (
              <s-banner tone="warning">
                Rückmeldung von Marktblatt: {reviewNote}
              </s-banner>
            )}

            {status !== 'verified' && (
              <s-text>
                Vor der Veröffentlichung Ihrer Produkte
                muss Ihr Unternehmen erfolgreich
                verifiziert werden. Produkte können
                bereits vorbereitet werden.
              </s-text>
            )}

          </s-stack>
        </s-section>

        <s-section heading="Unternehmensdaten">
          <s-stack direction="block" gap="base">

            <s-text-field
              label="Unternehmensname"
              value={companyName}
              disabled={loading || saving || !!error || status === 'pending' || status === 'verified'}
onInput={(event) => {
  setCompanyName(event.currentTarget.value);
  setCompanyDataSaved(false);
}}
            />

            <s-text-field
              label="URL Ihres Onlineshops"
              type="url"
              placeholder="https://www.ihr-shop.de"
              value={shopUrl}
              disabled={loading || saving || !!error || status === 'pending' || status === 'verified'}
onInput={(event) => {
  setShopUrl(event.currentTarget.value);
  setCompanyDataSaved(false);
}}
            />

            <s-text>
              Bitte geben Sie die Internetadresse
              Ihres eigenen Onlineshops an.
            </s-text>

            {saveSuccess && (
              <s-banner tone="success">
                {saveSuccess}
              </s-banner>
            )}

            {saveError && (
              <s-banner tone="critical">
                {saveError}
              </s-banner>
            )}

            {status !== 'pending' && status !== 'verified' && (
              <s-button
                variant="primary"
                disabled={loading || saving || !!error}
                onClick={saveCompanyData}
              >
                {saving
                  ? 'Wird gespeichert ...'
                  : 'Unternehmensdaten speichern'}
              </s-button>
            )}

          </s-stack>
        </s-section>

        <s-section heading="Nachweis der Geschäftstätigkeit">
          <s-stack direction="block" gap="base">

            <s-text>
              Bitte laden Sie Ihre Gewerbeanmeldung,
              einen Handelsregisterauszug oder einen
              vergleichbaren Unternehmensnachweis hoch.
            </s-text>

            {documentUploaded && (
              <s-banner tone="success">
                Ein Unternehmensnachweis wurde hinterlegt.
              </s-banner>
            )}

            {status !== 'pending' && status !== 'verified' && (
              <>
                <s-drop-zone
                  label="Unternehmensnachweis auswählen"
                  accept=".pdf,.jpg,.jpeg,.png"
                  disabled={loading || uploading || !!error}
                  onChange={(event) => {
                    const file =
                      event.currentTarget.files?.[0] ?? null;

                    setDocumentFile(file);
                    setUploadSuccess('');
                    setUploadError('');
                  }}
                />

                {documentFile && (
                  <s-text>
                    Ausgewählte Datei: {documentFile.name}
                  </s-text>
                )}

                {uploadSuccess && (
                  <s-banner tone="success">
                    {uploadSuccess}
                  </s-banner>
                )}

                {uploadError && (
                  <s-banner tone="critical">
                    {uploadError}
                  </s-banner>
                )}

                <s-button
                  variant="primary"
                  disabled={
                    loading ||
                    uploading ||
                    !!error ||
                    !documentFile
                  }
                  onClick={uploadDocument}
                >
                  {uploading
                    ? 'Dokument wird hochgeladen ...'
                    : 'Dokument hochladen'}
                </s-button>
              </>
            )}

            {(status === 'pending' || status === 'verified') && (
              <s-text>
                Während der Prüfung oder nach erfolgreicher
                Verifizierung können Dokumente nicht
                ausgetauscht werden.
              </s-text>
            )}

          </s-stack>
        </s-section>

        <s-section heading="Verifizierung einreichen">
          <s-stack direction="block" gap="base">

            {status === 'not_submitted' ||
            status === 'rejected' ? (
              <>
                <s-text>
                  Sobald Ihre Unternehmensdaten gespeichert
                  und Ihr Unternehmensnachweis hochgeladen
                  wurden, können Sie die Verifizierung
                  beantragen.
                </s-text>

                {submitSuccess && (
                  <s-banner tone="success">
                    {submitSuccess}
                  </s-banner>
                )}

                {submitError && (
                  <s-banner tone="critical">
                    {submitError}
                  </s-banner>
                )}

                <s-button
                  variant="primary"
                  disabled={
                    loading ||
                    saving ||
                    uploading ||
                    submitting ||
                    !!error ||
                    !companyDataSaved ||
                    !documentUploaded
                  }
                  onClick={submitVerification}
                >
                  {submitting
                    ? 'Antrag wird eingereicht ...'
                    : 'Verifizierung einreichen'}
                </s-button>
              </>
            ) : (
              <s-banner
                tone={
                  status === 'verified'
                    ? 'success'
                    : 'info'
                }
              >
                {status === 'verified'
                  ? 'Ihr Unternehmen ist verifiziert.'
                  : 'Ihr Verifizierungsantrag wurde eingereicht und wird geprüft.'}
              </s-banner>
            )}

          </s-stack>
        </s-section>

      </s-stack>
    </s-page>
  );
}