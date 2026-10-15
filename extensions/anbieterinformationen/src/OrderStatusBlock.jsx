import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

const API_BASE_URL =
  'https://marktblatt-marketplace.onrender.com';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [vendorProfile, setVendorProfile] = useState({
    companyDescription: '',
    backgroundImageId: null,
    discountCode: '',
    discountPercent: '',
    discountMinimumOrderValue: '',
    deliveryTimeInfo: '',
    homepageUrl: '',
    imprintUrl: '',
    withdrawalUrl: '',
    facebookUrl: '',
    instagramUrl: '',
    tiktokUrl: '',
    youtubeUrl: '',
  });

  const [loadingVendorProfile, setLoadingVendorProfile] =
    useState(true);

  const [error, setError] = useState(null);

const [saveMessage, setSaveMessage] = useState(null);

const [savingVendorProfile, setSavingVendorProfile] =
  useState(false);

const [vendorBackgroundImage, setVendorBackgroundImage] =
  useState(null);

const [
  uploadingVendorBackgroundImage,
  setUploadingVendorBackgroundImage,
] = useState(false);

  useEffect(() => {
    loadVendorProfile();
  }, []);

  async function loadVendorProfile() {
    try {
      setLoadingVendorProfile(true);
      setError(null);

      const token = await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/vendor-profile`,
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
          'Anbieterinformationen konnten nicht geladen werden.'
        );
      }

      const profile = data.profile || {};

      setVendorProfile({
        companyDescription:
          profile.companyDescription || '',
        backgroundImageId:
          profile.backgroundImageId || null,
        discountCode:
          profile.discountCode || '',
        discountPercent:
          profile.discountPercent ?? '',
        discountMinimumOrderValue:
          profile.discountMinimumOrderValue || '',
        deliveryTimeInfo:
          profile.deliveryTimeInfo || '',
        homepageUrl:
          profile.homepageUrl || '',
        imprintUrl:
          profile.imprintUrl || '',
        withdrawalUrl:
          profile.withdrawalUrl || '',
        facebookUrl:
          profile.facebookUrl || '',
        instagramUrl:
          profile.instagramUrl || '',
        tiktokUrl:
          profile.tiktokUrl || '',
        youtubeUrl:
          profile.youtubeUrl || '',
      });

    } catch (err) {
      console.error('VENDOR PROFILE LOAD ERROR:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Anbieterinformationen konnten nicht geladen werden.'
      );
    } finally {
      setLoadingVendorProfile(false);
    }
  }

  /*
   * =======================================================
   * ANBIETER-HINTERGRUNDBILD HOCHLADEN
   * =======================================================
   */

  async function uploadVendorBackgroundImage() {
    try {
      setUploadingVendorBackgroundImage(true);
      setError(null);
      setSaveMessage(null);

      if (!vendorBackgroundImage) {
        throw new Error(
          'Bitte wählen Sie zuerst ein Hintergrundbild aus.'
        );
      }

      const token = await shopify.sessionToken.get();

      const formData = new FormData();

      formData.append(
        'image',
        vendorBackgroundImage
      );

      const response = await fetch(
        `${API_BASE_URL}/api/vendor-background-image`,
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
          'Das Hintergrundbild konnte nicht hochgeladen werden.'
        );
      }

      setVendorProfile((current) => ({
        ...current,
        backgroundImageId:
          data.backgroundImageId ??
          current.backgroundImageId,
      }));

      setVendorBackgroundImage(null);

      setSaveMessage(
        'Hintergrundbild wurde erfolgreich gespeichert.'
      );

    } catch (err) {
      console.error(
        'VENDOR BACKGROUND IMAGE UPLOAD ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Das Hintergrundbild konnte nicht hochgeladen werden.'
      );

    } finally {
      setUploadingVendorBackgroundImage(false);
    }
  }

  /*
   * =======================================================
   * ANBIETERINFORMATIONEN SPEICHERN
   * =======================================================
   */

  async function saveVendorProfile() {
    try {
      setError(null);
      setSaveMessage(null);

      if (
        !vendorProfile.deliveryTimeInfo ||
        !String(vendorProfile.deliveryTimeInfo).trim()
      ) {
        setError('Bitte wählen Sie eine Lieferzeit aus.');
        return;
      }

      setSavingVendorProfile(true);

      const token = await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/vendor-profile`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            profile: {
              companyDescription:
                vendorProfile.companyDescription,
              discountCode:
                vendorProfile.discountCode,
              discountPercent:
                vendorProfile.discountPercent,
              discountMinimumOrderValue:
                vendorProfile.discountMinimumOrderValue,
              deliveryTimeInfo:
                vendorProfile.deliveryTimeInfo,
            },
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
          'Anbieterinformationen konnten nicht gespeichert werden.'
        );
      }

      const profile = data.profile || {};

      setVendorProfile((current) => ({
        ...current,
        companyDescription:
          profile.companyDescription || '',
        backgroundImageId:
          profile.backgroundImageId || null,
        discountCode:
          profile.discountCode || '',
        discountPercent:
          profile.discountPercent ?? '',
        discountMinimumOrderValue:
          profile.discountMinimumOrderValue || '',
        deliveryTimeInfo:
          profile.deliveryTimeInfo || '',
        homepageUrl:
          profile.homepageUrl || '',
        imprintUrl:
          profile.imprintUrl || '',
        withdrawalUrl:
          profile.withdrawalUrl || '',
        facebookUrl:
          profile.facebookUrl || '',
        instagramUrl:
          profile.instagramUrl || '',
        tiktokUrl:
          profile.tiktokUrl || '',
        youtubeUrl:
          profile.youtubeUrl || '',
      }));

      setSaveMessage(
        'Anbieterinformationen wurden gespeichert.'
      );

    } catch (err) {
      console.error('VENDOR PROFILE SAVE ERROR:', err);

      setError(
        err instanceof Error
          ? err.message
          : 'Anbieterinformationen konnten nicht gespeichert werden.'
      );
    } finally {
      setSavingVendorProfile(false);
    }
  }

  return (
    <s-page heading="Anbieterinformationen">
      <s-section heading="Anbieterinformationen">
        <s-stack direction="block" gap="base">
          <s-text>
            Diese Angaben gelten für alle Ihre Produkte
            auf Marktblatt.
          </s-text>

          {error && (
            <s-banner tone="critical">
              {error}
            </s-banner>
          )}

          {saveMessage && (
            <s-banner tone="success">
              {saveMessage}
            </s-banner>
          )}

          {loadingVendorProfile ? (
            <s-text>
              Anbieterinformationen werden geladen...
            </s-text>
          ) : (
            <>
              <s-text-field
                label="Informationen über den Anbieter"
                value={vendorProfile.companyDescription}
                onInput={(event) =>
                  setVendorProfile((current) => ({
                    ...current,
                    companyDescription: event.currentTarget.value,
                  }))
                }
              />

              <s-text>
                Beschreiben Sie Ihr Unternehmen und Ihre Angebote.
              </s-text>

              <s-box paddingBlockStart="base">
                <s-text type="strong">
                  Hintergrundbild für „Über den Anbieter“
                </s-text>
              </s-box>

              <s-text>
                Dieses Hintergrundbild wird im Bereich
                „Über den Anbieter“ angezeigt.
              </s-text>

              <s-drop-zone
                label="Hintergrundbild auswählen"
                accessibilityLabel="Hintergrundbild für Über den Anbieter auswählen"
                accept="image/jpeg,image/png,image/webp"
                disabled={uploadingVendorBackgroundImage}
                onChange={(event) => {
                  const file =
                    event.currentTarget.files?.[0] ?? null;

                  if (!file) {
                    setVendorBackgroundImage(null);
                    return;
                  }

                  if (file.size > 10 * 1024 * 1024) {
                    setVendorBackgroundImage(null);
                    setError(
                      'Das Bild darf maximal 10 MB groß sein.'
                    );
                    return;
                  }

                    setError(null);
                    setVendorBackgroundImage(file);
                }}
                onDropRejected={() => {
                  setVendorBackgroundImage(null);
                  setError(
                    'Bitte verwenden Sie ausschließlich ein JPG-, PNG- oder WebP-Bild.'
                  );
                }}
              />

<s-text>
  Erlaubt sind JPG, PNG und WebP mit maximal 10 MB.
  Das Bild muss im Format 3:1 vorliegen.
  Empfohlene Auflösung min.: 1800 × 600 Pixel.
</s-text>

              {vendorBackgroundImage && (
                <s-text>
                  Ausgewählt: {vendorBackgroundImage.name}
                </s-text>
              )}

              {vendorProfile.backgroundImageId && (
                <s-text>
                  ✓ Ein Hintergrundbild ist bereits hinterlegt.
                </s-text>
              )}

              <s-button
                onClick={uploadVendorBackgroundImage}
                disabled={
                  uploadingVendorBackgroundImage ||
                  !vendorBackgroundImage
                }
              >
                {uploadingVendorBackgroundImage
                  ? 'Bild wird hochgeladen...'
                  : vendorProfile.backgroundImageId
                    ? 'Hintergrundbild ersetzen'
                    : 'Hintergrundbild hochladen'}
              </s-button>

              <s-text-field
                label="Rabattcode"
                value={vendorProfile.discountCode}
                onInput={(event) =>
                  setVendorProfile((current) => ({
                    ...current,
                    discountCode: event.currentTarget.value,
                  }))
                }
              />

              <s-text-field
                label="Rabatt in %"
                type="number"
                value={vendorProfile.discountPercent}
                onInput={(event) =>
                  setVendorProfile((current) => ({
                    ...current,
                    discountPercent: event.currentTarget.value,
                  }))
                }
              />

              <s-text-field
                label="Mindestbestellwert für Rabattcode"
                type="number"
                value={vendorProfile.discountMinimumOrderValue}
                onInput={(event) =>
                  setVendorProfile((current) => ({
                    ...current,
                    discountMinimumOrderValue: event.currentTarget.value,
                  }))
                }
              />

              <s-select
                label="Lieferzeit"
                value={vendorProfile.deliveryTimeInfo}
                onChange={(event) =>
                  setVendorProfile((current) => ({
                    ...current,
                    deliveryTimeInfo: event.currentTarget.value,
                  }))
                }
              >
                <s-option value="">Bitte auswählen</s-option>
                <s-option value="1–2 Werktage">1–2 Werktage</s-option>
                <s-option value="2–3 Werktage">2–3 Werktage</s-option>
                <s-option value="3–5 Werktage">3–5 Werktage</s-option>
                <s-option value="5–7 Werktage">5–7 Werktage</s-option>
                <s-option value="1–2 Wochen">1–2 Wochen</s-option>
                <s-option value="2–4 Wochen">2–4 Wochen</s-option>
                <s-option value="Auf Anfrage">Auf Anfrage</s-option>
              </s-select>

              <s-button
                variant="primary"
                onClick={saveVendorProfile}
                disabled={savingVendorProfile}
              >
                {savingVendorProfile
                  ? 'Wird gespeichert...'
                  : 'Anbieterinformationen speichern'}
              </s-button>
            </>
          )}
        </s-stack>
      </s-section>
    </s-page>
  );
}