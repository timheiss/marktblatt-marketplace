import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';
import {
  CONTINENT_OPTIONS,
  SHIPPING_COUNTRY_OPTIONS,
  EUROPEAN_COUNTRY_OPTIONS,
} from './countries.js';

const API_BASE_URL =
  'https://marktblatt-marketplace.onrender.com';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
const [showSalesCountries, setShowSalesCountries] =
  useState(false);
const [vendorProfile, setVendorProfile] = useState({
  companyDescription: '',
  shippingOrigin: '',
  salesCountries: [],
  backgroundImageId: null,
  companyLogoWideId: null,
  companyLogoSquareId: null,
  brandLogoIds: [],
  companyLogoWideUrl: null,
  companyLogoSquareUrl: null,
  brandLogos: [],
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

  const [selectedLogos, setSelectedLogos] = useState({
    company_wide: null,
    company_square: null,
    brand: null,
  });
  const [logoBusy, setLogoBusy] = useState(false);

  function logoLimit(kind) {
    return kind === 'brand' ? 1024 * 1024 : 2 * 1024 * 1024;
  }

  function chooseLogo(kind, file) {
    setError(null);
    if (!file) {
      setSelectedLogos((current) => ({...current, [kind]: null}));
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Bitte JPG, PNG oder WebP auswählen.');
      return;
    }
    if (!file.size || file.size > logoLimit(kind)) {
      setError(kind === 'brand'
        ? 'Ein Markenlogo darf maximal 1 MB groß sein.'
        : 'Ein Firmenlogo darf maximal 2 MB groß sein.');
      return;
    }
    setSelectedLogos((current) => ({...current, [kind]: file}));
  }

  async function changeLogo(kind, operation, logoId = null) {
    if (logoBusy) return;
    const file = selectedLogos[kind];
    if (operation === 'upload' && !file) {
      setError('Bitte zuerst eine Bilddatei auswählen.');
      return;
    }
    try {
      setLogoBusy(true);
      setError(null);
      setSaveMessage(null);
      const token = await shopify.sessionToken.get();
      const form = new FormData();
      form.append('operation', operation);
      form.append('kind', kind);
      if (operation === 'upload') form.append('image', file);
      if (operation === 'delete' && logoId) form.append('logoId', logoId);
      const response = await fetch(`${API_BASE_URL}/api/vendor-logo`, {
        method: 'POST',
        headers: {Authorization: `Bearer ${token}`},
        body: form,
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Logo konnte nicht verarbeitet werden.');
      }
      setSelectedLogos((current) => ({...current, [kind]: null}));
      // Fresh Shopify file URLs may become available after processing.
      await loadVendorProfile(false);
      setSaveMessage(operation === 'upload'
        ? 'Logo wurde gespeichert. Die Vorschau kann kurz verzögert erscheinen.'
        : 'Logo wurde entfernt.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo konnte nicht verarbeitet werden.');
    } finally {
      setLogoBusy(false);
    }
  }

  useEffect(() => {
    loadVendorProfile();
  }, []);

  async function loadVendorProfile(showLoading = true) {
    try {
      if (showLoading) setLoadingVendorProfile(true);
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

if (!showLoading) {
        setVendorProfile((current) => ({
          ...current,
          companyLogoWideId: profile.companyLogoWideId || null,
          companyLogoSquareId: profile.companyLogoSquareId || null,
          brandLogoIds: Array.isArray(profile.brandLogoIds) ? profile.brandLogoIds : [],
          companyLogoWideUrl: profile.companyLogoWideUrl || null,
          companyLogoSquareUrl: profile.companyLogoSquareUrl || null,
          brandLogos: Array.isArray(profile.brandLogos) ? profile.brandLogos : [],
        }));
      } else setVendorProfile({
  companyDescription:
    profile.companyDescription || '',
  shippingOrigin:
    profile.shippingOrigin || '',
  salesCountries:
    Array.isArray(profile.salesCountries)
      ? profile.salesCountries
      : [],
  backgroundImageId:
    profile.backgroundImageId || null,
  companyLogoWideId: profile.companyLogoWideId || null,
  companyLogoSquareId: profile.companyLogoSquareId || null,
  brandLogoIds: Array.isArray(profile.brandLogoIds) ? profile.brandLogoIds : [],
  companyLogoWideUrl: profile.companyLogoWideUrl || null,
  companyLogoSquareUrl: profile.companyLogoSquareUrl || null,
  brandLogos: Array.isArray(profile.brandLogos) ? profile.brandLogos : [],
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
      if (showLoading) setLoadingVendorProfile(false);
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
    shippingOrigin:
      vendorProfile.shippingOrigin,
    salesCountries:
      vendorProfile.salesCountries,
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
  shippingOrigin:
    profile.shippingOrigin || '',
  salesCountries:
    Array.isArray(profile.salesCountries)
      ? profile.salesCountries
      : [],
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
<s-text-area
  label="Informationen über den Anbieter"
  rows={5}
  maxLength={800}
  value={vendorProfile.companyDescription}
  onInput={(event) =>
    setVendorProfile((current) => ({
      ...current,
      companyDescription:
        event.currentTarget.value.slice(0, 800),
    }))
  }
/>

<s-text>
  Beschreiben Sie Ihr Unternehmen und Ihre Angebote.
  Maximal 800 Zeichen.
</s-text>
<s-text>
  {vendorProfile.companyDescription.length} / 800 Zeichen
</s-text>


<s-box paddingBlockStart="base">
  <s-select
    label="Versand aus"
    value={vendorProfile.shippingOrigin}
    onChange={(event) =>
      setVendorProfile((current) => ({
        ...current,
        shippingOrigin: event.currentTarget.value,
      }))
    }
  >
    <s-option value="">
      Bitte auswählen
    </s-option>

{CONTINENT_OPTIONS.map((continent) => (
  <s-option
    key={continent.value}
    value={continent.value}
  >
    {continent.label}
  </s-option>
))}

{SHIPPING_COUNTRY_OPTIONS.map((country) => (
  <s-option
    key={country.value}
    value={country.value}
  >
    {country.label}
  </s-option>
))}
  </s-select>
</s-box>

<s-text>
  Wählen Sie das Land oder den Kontinent, aus dem
  die meisten Ihrer Produkte versendet werden.
</s-text>


<s-box paddingBlockStart="base">
  <s-text type="strong">
    Versand / Verkauf in
  </s-text>
</s-box>

<s-text>
  Wählen Sie alle europäischen Länder aus, in die
  Sie verkaufen und liefern.
</s-text>

<s-text>
  {vendorProfile.salesCountries.length} Länder ausgewählt
</s-text>

<s-button
  onClick={() => setShowSalesCountries((current) => !current)}
>
  {showSalesCountries
    ? 'Auswahl schließen'
    : 'Länder auswählen'}
</s-button>

{showSalesCountries && (

<s-stack direction="block" gap="small">
  {EUROPEAN_COUNTRY_OPTIONS.map((country) => (
<s-checkbox
  key={country.value}
  label={country.label}
  checked={vendorProfile.salesCountries.includes(
    country.value
  )}
  onChange={(event) => {
    const checked = event.currentTarget.checked;

    setVendorProfile((current) => ({
      ...current,
      salesCountries: checked
        ? [...new Set([
            ...current.salesCountries,
            country.value,
          ])]
        : current.salesCountries.filter(
            (value) => value !== country.value
          ),
    }));
  }}
/>
  ))}
</s-stack>
)}

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


              {/* Firmenlogos und Markenlogos */}
              <s-box paddingBlockStart="base">
                <s-text type="strong">Firmenlogo im Querformat (3:1)</s-text>
              </s-box>
              <s-text>JPG, PNG oder WebP · maximal 2 MB · empfohlen 1200 × 400 Pixel.</s-text>
              {vendorProfile.companyLogoWideUrl ? (
                <s-image src={vendorProfile.companyLogoWideUrl} alt="Firmenlogo Querformat" />
              ) : (
                <s-text>{vendorProfile.companyLogoWideId
                  ? 'Logo hinterlegt – Bildvorschau wird von Shopify verarbeitet.'
                  : 'Noch kein Firmenlogo im Querformat hinterlegt.'}</s-text>
              )}
              <s-drop-zone
                label="Firmenlogo Querformat auswählen"
                accessibilityLabel="Firmenlogo im Querformat auswählen"
                accept="image/jpeg,image/png,image/webp"
                disabled={logoBusy}
                onChange={(event) => chooseLogo('company_wide', event.currentTarget.files?.[0] ?? null)}
                onDropRejected={() => setError('Bitte JPG, PNG oder WebP auswählen.')}
              />
              {selectedLogos.company_wide && <s-text>Ausgewählt: {selectedLogos.company_wide.name}</s-text>}
              <s-button disabled={logoBusy || !selectedLogos.company_wide} onClick={() => changeLogo('company_wide', 'upload')}>
                {vendorProfile.companyLogoWideId ? 'Firmenlogo ersetzen' : 'Firmenlogo hochladen'}
              </s-button>
              {vendorProfile.companyLogoWideId && (
                <s-button disabled={logoBusy} onClick={() => changeLogo('company_wide', 'delete')}>
                  Firmenlogo Querformat entfernen
                </s-button>
              )}

              <s-box paddingBlockStart="base">
                <s-text type="strong">Firmenlogo im Quadrat (1:1)</s-text>
              </s-box>
              <s-text>JPG, PNG oder WebP · maximal 2 MB · empfohlen 600 × 600 Pixel.</s-text>
              {vendorProfile.companyLogoSquareUrl ? (
                <s-image src={vendorProfile.companyLogoSquareUrl} alt="Firmenlogo Quadrat" />
              ) : (
                <s-text>{vendorProfile.companyLogoSquareId
                  ? 'Logo hinterlegt – Bildvorschau wird von Shopify verarbeitet.'
                  : 'Noch kein quadratisches Firmenlogo hinterlegt.'}</s-text>
              )}
              <s-drop-zone
                label="Firmenlogo Quadrat auswählen"
                accessibilityLabel="Quadratisches Firmenlogo auswählen"
                accept="image/jpeg,image/png,image/webp"
                disabled={logoBusy}
                onChange={(event) => chooseLogo('company_square', event.currentTarget.files?.[0] ?? null)}
                onDropRejected={() => setError('Bitte JPG, PNG oder WebP auswählen.')}
              />
              {selectedLogos.company_square && <s-text>Ausgewählt: {selectedLogos.company_square.name}</s-text>}
              <s-button disabled={logoBusy || !selectedLogos.company_square} onClick={() => changeLogo('company_square', 'upload')}>
                {vendorProfile.companyLogoSquareId ? 'Firmenlogo ersetzen' : 'Firmenlogo hochladen'}
              </s-button>
              {vendorProfile.companyLogoSquareId && (
                <s-button disabled={logoBusy} onClick={() => changeLogo('company_square', 'delete')}>
                  Firmenlogo Quadrat entfernen
                </s-button>
              )}

              <s-box paddingBlockStart="base">
                <s-text type="strong">Markenlogos</s-text>
              </s-box>
              <s-text>{vendorProfile.brandLogoIds.length} / 15 Markenlogos hinterlegt</s-text>
              <s-text>JPG, PNG oder WebP · maximal 1 MB je Logo.</s-text>
              {vendorProfile.brandLogoIds.map((id, index) => {
                const logo = vendorProfile.brandLogos.find((item) => item.id === id);
                return (
                  <s-box key={id} paddingBlockStart="small">
                    <s-text>Markenlogo {index + 1}</s-text>
                    {logo?.url ? (
                      <s-image src={logo.url} alt={`Markenlogo ${index + 1}`} />
                    ) : (
                      <s-text>Bildvorschau wird von Shopify verarbeitet.</s-text>
                    )}
                    <s-button disabled={logoBusy} onClick={() => changeLogo('brand', 'delete', id)}>
                      Markenlogo {index + 1} entfernen
                    </s-button>
                  </s-box>
                );
              })}
              {vendorProfile.brandLogoIds.length < 15 && (
                <>
                  <s-drop-zone
                    label="Markenlogo auswählen"
                    accessibilityLabel="Markenlogo auswählen"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={logoBusy}
                    onChange={(event) => chooseLogo('brand', event.currentTarget.files?.[0] ?? null)}
                    onDropRejected={() => setError('Bitte JPG, PNG oder WebP auswählen.')}
                  />
                  {selectedLogos.brand && <s-text>Ausgewählt: {selectedLogos.brand.name}</s-text>}
                  <s-button disabled={logoBusy || !selectedLogos.brand} onClick={() => changeLogo('brand', 'upload')}>
                    Markenlogo hinzufügen
                  </s-button>
                </>
              )}
              {vendorProfile.brandLogoIds.length >= 15 && (
                <s-text>Die maximale Anzahl von 15 Markenlogos ist erreicht.</s-text>
              )}

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