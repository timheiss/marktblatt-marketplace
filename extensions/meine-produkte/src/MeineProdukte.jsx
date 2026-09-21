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
   * PRODUKT BEARBEITEN
   * =======================================================
   */

  const [editingProduct, setEditingProduct] =
    useState(null);

  const [editTitle, setEditTitle] =
    useState('');

  const [editDescription, setEditDescription] =
    useState('');

  const [editPrice, setEditPrice] =
    useState('');

  const [savingEdit, setSavingEdit] =
    useState(false);


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

          availableProducts:
            data.package.availableProducts ??
            0,
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
   * BEARBEITEN STARTEN
   * =======================================================
   */

  function startEditing(product) {
    setEditingProduct(product);

    setEditTitle(
      product.title || ''
    );

    setEditDescription(
      product.description || ''
    );

    setEditPrice(
      product.price || ''
    );

    setError(null);
    setSaveMessage(null);
  }


  /*
   * =======================================================
   * BEARBEITEN ABBRECHEN
   * =======================================================
   */

  function cancelEditing() {
    setEditingProduct(null);
    setEditTitle('');
    setEditDescription('');
    setEditPrice('');
  }


  /*
   * =======================================================
   * ÄNDERUNGEN SPEICHERN
   * =======================================================
   */

  async function saveEditing() {
    if (!editingProduct) {
      return;
    }

    if (!editTitle.trim()) {
      setError(
        'Bitte geben Sie einen Produkttitel ein.'
      );

      return;
    }

    try {
      setSavingEdit(true);
      setError(null);
      setSaveMessage(null);

      const token =
        await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/product-update`,
        {
          method: 'POST',

          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },

          body: JSON.stringify({
            productId:
              editingProduct.id,

            title:
              editTitle,

            description:
              editDescription,

            price:
              editPrice,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            'Änderungen konnten nicht gespeichert werden.'
        );
      }

      setSaveMessage(
        data.message ||
          'Änderungen wurden erfolgreich gespeichert.'
      );

      cancelEditing();

      await loadProducts();

    } catch (err) {
      console.error(
        'PRODUCT UPDATE ERROR:',
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : 'Änderungen konnten nicht gespeichert werden.'
      );

    } finally {
      setSavingEdit(false);
    }
  }


  /*
   * =======================================================
   * STATUS DAUERHAFT ÄNDERN
   * =======================================================
   */

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

      if (
        editingProduct?.id === product.id
      ) {
        cancelEditing();
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
   * OBERFLÄCHE
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

                  <s-stack
                    direction="block"
                    gap="large"
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

                        const isEditing =
                          editingProduct?.id ===
                          product.id;

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
                                    {product.description}
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

                                  <s-button
                                    onClick={() =>
                                      startEditing(
                                        product
                                      )
                                    }
                                    disabled={
                                      statusChanging ||
                                      productDeleting ||
                                      productPublishing
                                    }
                                  >
                                    Bearbeiten
                                  </s-button>

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

                                {/* PRODUKT DIREKT HIER BEARBEITEN */}

                                {isEditing && (

                                  <s-section heading="Produkt bearbeiten">

                                    <s-stack
                                      direction="block"
                                      gap="base"
                                    >

                                      <s-text>
                                        Sie bearbeiten:{' '}
                                        {editingProduct.title}
                                      </s-text>

                                      <s-text-field
                                        label="Produkttitel"
                                        value={editTitle}
                                        onInput={(event) => {
                                          setEditTitle(
                                            event.currentTarget.value
                                          );
                                        }}
                                      />

                                      <s-text-field
                                        label="Beschreibung"
                                        value={editDescription}
                                        onInput={(event) => {
                                          setEditDescription(
                                            event.currentTarget.value
                                          );
                                        }}
                                      />

                                      <s-text>
                                        Preis:{' '}
                                        {product.price
                                          ? `${product.price} ${
                                              product.currency ||
                                              ''
                                            }`
                                          : 'Kein Preis vorhanden'}
                                      </s-text>

                                      <s-text>
                                        Der Preis wird aus dem Onlineshop übernommen und kann hier nicht geändert werden.
                                      </s-text>

                                      <s-stack
                                        direction="inline"
                                        gap="small"
                                      >

                                        <s-button
                                          variant="primary"
                                          onClick={saveEditing}
                                          disabled={savingEdit}
                                        >
                                          {savingEdit
                                            ? 'Änderungen werden gespeichert...'
                                            : 'Änderungen speichern'}
                                        </s-button>

                                        <s-button
                                          onClick={cancelEditing}
                                          disabled={savingEdit}
                                        >
                                          Abbrechen
                                        </s-button>

                                      </s-stack>

                                    </s-stack>

                                  </s-section>

                                )}

                              </s-stack>

                            </s-section>

                          </s-box>

                        );
                      }
                    )}

                  </s-stack>

                )}

              </>

            )}

          </s-stack>

        </s-section>

      </s-stack>

    </s-page>
  );
}