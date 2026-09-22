import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};


/*
 * =========================================================
 * PRODUKTIONS-API
 * =========================================================
 */

const API_BASE_URL =
  'https://marktblatt-marketplace.onrender.com';


function Extension() {

  /*
   * =======================================================
   * PRODUKTE / PAKET
   * =======================================================
   */

  const [marketplaceProducts, setMarketplaceProducts] =
    useState([]);

const [packageData, setPackageData] = useState({
  name: 'Business',
  productLimit: 100,
  usedProducts: 0,
  availableProducts: 100,
  compareAtPricesEnabled: true,
});

  const [loadingProducts, setLoadingProducts] =
    useState(true);


  /*
   * =======================================================
   * PRODUKT HINZUFÜGEN
   * =======================================================
   */

  const [productUrl, setProductUrl] =
    useState('');

  const [checking, setChecking] =
    useState(false);

  const [productPreview, setProductPreview] =
    useState(null);

  const [savingProduct, setSavingProduct] =
    useState(false);


  /*
   * =======================================================
   * MELDUNGEN
   * =======================================================
   */

  const [error, setError] =
    useState(null);

  const [saveMessage, setSaveMessage] =
    useState(null);


  /*
   * =======================================================
   * STATUS / LÖSCHEN / ÜBERTRAGEN
   * =======================================================
   */

  const [changingStatusId, setChangingStatusId] =
    useState(null);

  const [deletingProductId, setDeletingProductId] =
    useState(null);

  const [publishingProductId, setPublishingProductId] =
    useState(null);

const [changingCompareAtPrices, setChangingCompareAtPrices] =
  useState(false);

const [bulkStatusAction, setBulkStatusAction] =
  useState(null);

  /*
   * =======================================================
   * START
   * =======================================================
   */

  useEffect(() => {
    loadProducts();
  }, []);


  /*
   * =======================================================
   * PRODUKTE LADEN
   * =======================================================
   */

  async function loadProducts() {
    try {
      setLoadingProducts(true);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-list`,
        {
          method: 'GET',

          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Produkte konnten nicht geladen werden.'
        );
      }

      setMarketplaceProducts(
        Array.isArray(data.products)
          ? data.products
          : []
      );

      if (data.package) {
        setPackageData({
          name:
            data.package.name ||
            'Business',

          productLimit:
            data.package.productLimit ??
            100,

          usedProducts:
            data.package.usedProducts ??
            0,

compareAtPricesEnabled:
  data.package.compareAtPricesEnabled ??
  true,
        });
      }

    } catch (err) {
      console.error(
        'PRODUCT LIST ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Produkte konnten nicht geladen werden.'
      );

    } finally {
      setLoadingProducts(false);
    }
  }


  /*
   * =======================================================
   * PRODUKT PRÜFEN
   * =======================================================
   */

  async function checkProduct() {
    setError(null);
    setSaveMessage(null);
    setProductPreview(null);

    if (!productUrl.trim()) {
      setError(
        'Bitte geben Sie eine Produkt-URL ein.'
      );

      return;
    }

    try {
      new URL(productUrl);
    } catch {
      setError(
        'Bitte geben Sie eine gültige URL ein.'
      );

      return;
    }

    try {
      setChecking(true);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-scrape`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            url: productUrl,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Das Produkt konnte nicht geprüft werden.'
        );
      }

      setProductPreview(
        data.product
      );

    } catch (err) {
      console.error(
        'PRODUCT SCRAPE ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Das Produkt konnte nicht geprüft werden.'
      );

    } finally {
      setChecking(false);
    }
  }


  /*
   * =======================================================
   * PRODUKT ÜBERNEHMEN
   * =======================================================
   */

  async function acceptProduct() {
    if (!productPreview) {
      return;
    }

    if (
      packageData.usedProducts >=
      packageData.productLimit
    ) {
      setError(
        `Ihr Produktlimit von ${packageData.productLimit} Produkten ist erreicht.`
      );

      return;
    }

    try {
      setSavingProduct(true);
      setError(null);
      setSaveMessage(null);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-save`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            product: productPreview,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Produkt konnte nicht übernommen werden.'
        );
      }

      setSaveMessage(
        data.message ||
          'Produkt wurde erfolgreich übernommen.'
      );

      setProductPreview(null);
      setProductUrl('');

      await loadProducts();

    } catch (err) {
      console.error(
        'PRODUCT SAVE ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Produkt konnte nicht übernommen werden.'
      );

    } finally {
      setSavingProduct(false);
    }
  }


  /*
   * =======================================================
   * PRODUKT AN MARKTBLATT ÜBERTRAGEN
   * =======================================================
   */

  async function publishProduct(product) {
    if (!product?.id) {
      return;
    }

    if (product.shopifyProductId) {
      setSaveMessage(
        'Dieses Produkt wurde bereits an Marktblatt übertragen.'
      );

      return;
    }

    try {
      setPublishingProductId(
        product.id
      );

      setError(null);
      setSaveMessage(null);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-publish`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

body: JSON.stringify({
  productId: product.id,
}),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Produkt konnte nicht an Marktblatt übertragen werden.'
        );
      }

      setSaveMessage(
        data.message ||
          'Produkt wurde erfolgreich an Marktblatt übertragen.'
      );

      /*
       * Produktliste neu laden.
       *
       * Wenn api.product-publish die Shopify-IDs
       * in MarketplaceProduct gespeichert hat,
       * erscheint anschließend automatisch
       * "Marktblatt: Übertragen".
       */

      await loadProducts();

    } catch (err) {
      console.error(
        'PRODUCT PUBLISH ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Produkt konnte nicht an Marktblatt übertragen werden.'
      );

    } finally {
      setPublishingProductId(null);
    }
  }


  /*
   * =======================================================
   * STATUS DAUERHAFT Ã„NDERN
   * =======================================================
   */

/*
 * =======================================================
 * STREICHPREISE AKTIVIEREN / DEAKTIVIEREN
 * =======================================================
 */

async function changeCompareAtPrices(enabled) {
  if (changingCompareAtPrices) {
    return;
  }

  try {
    setChangingCompareAtPrices(true);
    setError(null);
    setSaveMessage(null);

    const token =
      await shopify.sessionToken.get();

    const response = await fetch(
      `${API_BASE_URL}/api/compare-at-price-setting`,
      {
        method: 'POST',

        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },

        body: JSON.stringify({
          enabled,
        }),
      }
    );

    const data =
      await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
          'Die Streichpreis-Einstellung konnte nicht geändert werden.'
      );
    }

    setPackageData((current) => ({
      ...current,

      compareAtPricesEnabled:
        data.compareAtPricesEnabled,
    }));

    setSaveMessage(
      data.compareAtPricesEnabled
        ? 'Streichpreise wurden aktiviert.'
        : 'Streichpreise wurden deaktiviert.'
    );

  } catch (error) {
    setError(
      error?.message ||
        'Die Streichpreis-Einstellung konnte nicht geändert werden.'
    );
  } finally {
    setChangingCompareAtPrices(false);
  }
}

/*
 * =======================================================
 * ALLE ÜBERTRAGENEN PRODUKTE AKTIVIEREN / DEAKTIVIEREN
 * =======================================================
 */

async function changeAllProductStatuses(status) {
  if (bulkStatusAction) {
    return;
  }

  try {
    setBulkStatusAction(status);
    setError(null);
    setSaveMessage(null);

    /*
     * Nur Produkte berücksichtigen, die bereits
     * an Marktblatt übertragen wurden.
     */
    const publishedProducts =
      marketplaceProducts.filter(
        (product) => product.shopifyProductId
      );

    if (publishedProducts.length === 0) {
      setSaveMessage(
        'Es wurden noch keine Produkte an Marktblatt übertragen.'
      );
      return;
    }

    /*
     * Produkte überspringen, die bereits den
     * gewünschten Status besitzen.
     */
    const productsToChange =
      publishedProducts.filter(
        (product) => product.status !== status
      );

    if (productsToChange.length === 0) {
      setSaveMessage(
        status === 'active'
          ? 'Alle übertragenen Produkte sind bereits aktiviert.'
          : 'Alle übertragenen Produkte sind bereits deaktiviert.'
      );
      return;
    }

    const token =
      await shopify.sessionToken.get();

    /*
     * Bewusst nacheinander ausführen.
     * Dadurch wird die Shopify Admin API nicht gleichzeitig
     * mit sehr vielen Statusänderungen belastet.
     */
    for (const product of productsToChange) {
      const response = await fetch(
        `${API_BASE_URL}/api/product-status`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            productId: product.id,
            status,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            `Produkt "${product.title}" konnte nicht geändert werden.`
        );
      }
    }

    await loadProducts();

    setSaveMessage(
      status === 'active'
        ? `${productsToChange.length} Produkte wurden aktiviert.`
        : `${productsToChange.length} Produkte wurden deaktiviert.`
    );

  } catch (err) {
    console.error(
      'BULK PRODUCT STATUS ERROR:',
      err
    );

    /*
     * Liste neu laden, weil vor einem möglichen Fehler
     * bereits einige Produkte geändert worden sein können.
     */
    await loadProducts();

    setError(
      err instanceof Error
        ? err.message
        : 'Die Produktstatus konnten nicht geändert werden.'
    );

  } finally {
    setBulkStatusAction(null);
  }
}

  async function toggleProductStatus(product) {
    if (!product?.id) {
      return;
    }

    const newStatus =
      product.status === 'active'
        ? 'inactive'
        : 'active';

    try {
      setChangingStatusId(
        product.id
      );

      setError(null);
      setSaveMessage(null);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-status`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            productId:
              product.id,

            status:
              newStatus,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Produktstatus konnte nicht geändert werden.'
        );
      }

      setSaveMessage(
        data.message ||
          (
            newStatus === 'active'
              ? 'Produkt wurde aktiviert.'
              : 'Produkt wurde deaktiviert.'
          )
      );

      await loadProducts();

    } catch (err) {
      console.error(
        'PRODUCT STATUS ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Produktstatus konnte nicht geändert werden.'
      );

    } finally {
      setChangingStatusId(null);
    }
  }


  /*
   * =======================================================
   * PRODUKT LÖSCHEN
   * =======================================================
   */

  async function deleteProduct(product) {
    if (!product?.id) {
      return;
    }

    try {
      setDeletingProductId(
        product.id
      );

      setError(null);
      setSaveMessage(null);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-delete`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            productId:
              product.id,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Produkt konnte nicht gelöscht werden.'
        );
      }

      setSaveMessage(
        data.message ||
          'Produkt wurde erfolgreich gelöscht.'
      );

      await loadProducts();

    } catch (err) {
      console.error(
        'PRODUCT DELETE ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Produkt konnte nicht gelöscht werden.'
      );

    } finally {
      setDeletingProductId(null);
    }
  }


  /*
   * =======================================================
   * OBERFLÃ„CHE
   * =======================================================
   */

  return (
    <s-page heading="Meine Produkte">

      <s-stack
        direction="block"
        gap="base"
      >

        {/* PAKET */}

<s-section heading="Ihr Paket">

  <s-stack
    direction="block"
    gap="small"
  >

    <s-text>
      {packageData.name}
    </s-text>

    <s-text>
      {packageData.productLimit} Produkte
    </s-text>

    <s-text>
      {packageData.usedProducts} von{' '}
      {packageData.productLimit}{' '}
      Produkten verwendet
    </s-text>

    <s-text>
      {packageData.availableProducts}{' '}
      Produkte verfügbar
    </s-text>


<s-box paddingBlockStart="base">
  <s-text type="strong">
    So funktioniert es:
  </s-text>
</s-box>

    <s-text>
      1. Fügen Sie die URL eines Produkts aus Ihrem
      Onlineshop hinzu.
    </s-text>

    <s-text>
      2. Prüfen Sie die Produktdaten und übertragen Sie
      das Produkt anschließend an Marktblatt.
    </s-text>

    <s-text>
      3. Aktivieren Sie das Produkt, damit es auf
      Marktblatt veröffentlicht wird.
    </s-text>

    <s-text>
      4. Deaktivierte Produkte bleiben gespeichert und
      können jederzeit wieder aktiviert werden.
    </s-text>


    <s-stack
      direction="inline"
      gap="small"
    >

<s-button
  variant="primary"
  onClick={() =>
    changeAllProductStatuses('active')
  }
  disabled={bulkStatusAction !== null}
>
  {bulkStatusAction === 'active'
    ? 'Alle werden aktiviert...'
    : 'Alle aktivieren'}
</s-button>

<s-button
  onClick={() =>
    changeAllProductStatuses('inactive')
  }
  disabled={bulkStatusAction !== null}
>
  {bulkStatusAction === 'inactive'
    ? 'Alle werden deaktiviert...'
    : 'Alle deaktivieren'}
</s-button>

    </s-stack>

<s-stack
  direction="block"
  gap="small"
>
  <s-text>
    <strong>Streichpreisprüfung</strong>
  </s-text>

  <s-text>
    Streichpreis / Vergleichspreis korrekt? Wenn Sie keine
    Streichpreise auf Marktblatt anzeigen möchten, können Sie
    diese hier deaktivieren.
  </s-text>

  <s-button
    onClick={() =>
      changeCompareAtPrices(
        !packageData.compareAtPricesEnabled
      )
    }
    disabled={changingCompareAtPrices}
  >
    {changingCompareAtPrices
      ? 'Streichpreise werden geändert...'
      : packageData.compareAtPricesEnabled
        ? 'Streichpreise deaktivieren'
        : 'Streichpreise aktivieren'}
  </s-button>
</s-stack>

  </s-stack>

</s-section>


        {/* NEUES PRODUKT */}

        <s-section heading="Neues Produkt hinzufügen">

          <s-stack
            direction="block"
            gap="base"
          >

            <s-text>
              Fügen Sie den Link zu einem Produkt aus Ihrem
              Onlineshop ein.
            </s-text>

            <s-text-field
              label="Produkt-URL"
              placeholder="https://www.ihr-shop.de/produkt/..."
              type="url"
              value={productUrl}

              onInput={(event) => {
                setProductUrl(
                  event.currentTarget.value
                );
              }}
            />

            <s-button
              variant="primary"
              onClick={checkProduct}
              disabled={checking}
            >
              {checking
                ? 'Produkt wird geprüft...'
                : 'Produkt prüfen'}
            </s-button>

            {error && (
              <s-text>
                {error}
              </s-text>
            )}

          </s-stack>

        </s-section>


        {/* PRODUKTVORSCHAU */}

        {productPreview && (

          <s-section heading="Produktvorschau">

            <s-stack
              direction="block"
              gap="base"
            >

              {productPreview.images?.length > 0 ? (

                <s-stack
                  direction="block"
                  gap="base"
                >

                  <s-text>
                    Produktbilder: {productPreview.images.length} von maximal 5
                  </s-text>

                  <s-stack
                    direction="inline"
                    gap="small"
                    wrap
                  >

                    {productPreview.images.map(
                      (image, index) => (

                        <s-stack
                          key={`${image}-${index}`}
                          direction="block"
                          gap="small"
                        >

                          <s-image
                            src={image}
                            alt={`${
                              productPreview.title ||
                              'Produktbild'
                            } ${index + 1}`}
                          />

                          <s-button
                            variant="secondary"
                            onClick={() => {
                              setProductPreview(
                                (currentProduct) => {

                                  if (!currentProduct) {
                                    return currentProduct;
                                  }

                                  const currentImages =
                                    Array.isArray(
                                      currentProduct.images
                                    )
                                      ? currentProduct.images
                                      : [];

                                  return {
                                    ...currentProduct,

                                    images:
                                      currentImages.filter(
                                        (_, imageIndex) =>
                                          imageIndex !== index
                                      ),
                                  };
                                }
                              );
                            }}
                          >
                            Bild entfernen
                          </s-button>

                        </s-stack>

                      )
                    )}

                  </s-stack>

                </s-stack>

              ) : (

                <s-text>
                  Keine Produktbilder vorhanden.
                </s-text>

              )}

              <s-text>
                {productPreview.title}
              </s-text>

              {productPreview.description && (
                <s-text>
                  {productPreview.description}
                </s-text>
              )}

              {productPreview.price && (
                <s-text>
                  Preis: {productPreview.price}
                  {productPreview.currency
                    ? ` ${productPreview.currency}`
                    : ''}
                </s-text>
              )}

              <s-text>
                Anbieter:{' '}
                {productPreview.vendor ||
                  'Unbekannt'}
              </s-text>

              {productPreview.brand && (
                <s-text>
                  Marke:{' '}
                  {productPreview.brand}
                </s-text>
              )}

              <s-button
                variant="primary"
                onClick={acceptProduct}
                disabled={savingProduct}
              >
                {savingProduct
                  ? 'Produkt wird übernommen...'
                  : 'Produkt übernehmen'}
              </s-button>

            </s-stack>

          </s-section>

        )}

        {/* ERFOLGSMELDUNG */}

        {saveMessage && (

          <s-section heading="Erfolgreich">
            <s-text>
              {saveMessage}
            </s-text>
          </s-section>

        )}


        {/* PRODUKTLISTE */}

        <s-section heading="Ihre Produkte">

          <s-stack
            direction="block"
            gap="base"
          >

            {loadingProducts ? (

              <s-text>
                Produkte werden geladen...
              </s-text>

            ) : (

              <>

                <s-text>
                  {marketplaceProducts.length}{' '}
                  Produkt
                  {marketplaceProducts.length === 1
                    ? ''
                    : 'e'}
                </s-text>

                {marketplaceProducts.length === 0 ? (

                  <s-text>
                    Noch keine Produkte vorhanden.
                  </s-text>

                ) : (

                  <s-grid
                    gridTemplateColumns="repeat(4, minmax(0, 1fr))"
                    gap="base"
                  >

                    {marketplaceProducts.map(
                      (product) => {

                        const statusChanging =
                          changingStatusId ===
                          product.id;

                        const productDeleting =
                          deletingProductId ===
                          product.id;

                        const productPublishing =
                          publishingProductId ===
                          product.id;

                        const alreadyPublished =
                          Boolean(
                            product.shopifyProductId
                          );

                        return (

                          <s-box
                            key={product.id}
                            border="base strong solid"
                            borderRadius="base"
                            padding="base"
                          >

                            <s-section
                              heading={product.title}
                            >

                              <s-stack
                                direction="block"
                                gap="small"
                              >

                                {product.image && (
                                  <s-image
                                    src={product.image}
                                    alt={product.title}
                                  />
                                )}

                                {product.description && (
                                  <s-text>
                                  {product.description.length > 120
                                    ? `${product.description.slice(0, 120)}...`
                                    : product.description}
                                  </s-text>
                                )}

                                <s-text>
                                  {product.price
                                    ? `${product.price} ${
                                        product.currency ||
                                        ''
                                      }`
                                    : 'Kein Preis vorhanden'}
                                </s-text>

                                <s-text>
                                  Anbieter:{' '}
                                  {product.vendor ||
                                    'Unbekannt'}
                                </s-text>

                                <s-text>
                                  Status:{' '}
                                  {product.status ===
                                  'active'
                                    ? 'Aktiv'
                                    : product.status ===
                                        'draft'
                                      ? 'Entwurf'
                                      : 'Inaktiv'}
                                </s-text>

                                <s-text>
                                  Marktblatt:{' '}
                                  {alreadyPublished
                                    ? 'Übertragen'
                                    : 'Noch nicht übertragen'}
                                </s-text>

                                <s-stack
                                  direction="inline"
                                  gap="small"
                                >



{alreadyPublished && (
  <s-button
    onClick={() =>
      toggleProductStatus(
        product
      )
    }
    disabled={
      statusChanging ||
      productDeleting ||
      productPublishing
    }
  >
    {statusChanging
      ? 'Status wird gespeichert...'
      : product.status ===
          'active'
        ? 'Deaktivieren'
        : 'Aktivieren'}
  </s-button>
)}

                                  {!alreadyPublished && (

                                    <s-button
                                      variant="primary"
                                      onClick={() =>
                                        publishProduct(
                                          product
                                        )
                                      }
                                      disabled={
                                        statusChanging ||
                                        productDeleting ||
                                        productPublishing
                                      }
                                    >
                                      {productPublishing
                                        ? 'Wird übertragen...'
                                        : 'An Marktblatt übertragen'}
                                    </s-button>

                                  )}

                                  <s-button
                                    onClick={() =>
                                      deleteProduct(
                                        product
                                      )
                                    }
                                    disabled={
                                      statusChanging ||
                                      productDeleting ||
                                      productPublishing
                                    }
                                  >
                                    {productDeleting
                                      ? 'Produkt wird gelöscht...'
                                      : 'Löschen'}
                                  </s-button>

                                </s-stack>


                              </s-stack>

                            </s-section>

                          </s-box>

                        );
                      }
                    )}

                  </s-grid>

                )}

              </>

            )}

          </s-stack>

        </s-section>

      </s-stack>

    </s-page>
  );
}

