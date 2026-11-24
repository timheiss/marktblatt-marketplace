import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useRef, useState} from 'preact/hooks';

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


function normalizeProductUrl(input) {
  try {
    const url = new URL(input);

    for (const param of [
      "utm_source", "utm_medium", "utm_campaign",
      "utm_term", "utm_content", "fbclid", "gclid"
    ]) {
      url.searchParams.delete(param);
    }

    // Sprachvarianten derselben Produkt-URL zusammenführen
    url.pathname = url.pathname.replace(
      /^\/(?:en|de|fr|es|it|nl)\/(?=(?:products|collections)\/)/i,
      "/"
    );

    const match = url.pathname.match(
      /^\/collections\/[^/]+\/products\/([^/]+)\/?$/i
    );

    if (match) {
      url.pathname = `/products/${match[1]}`;
    }

    if (url.pathname.length > 1) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }

    url.hash = "";
    return url.href;
  } catch {
    return String(input || "");
  }
}
function Extension() {
  // Unabhängige Seitennavigation für Produktliste und Shop-Import.
  const [productsPageSize, setProductsPageSize] = useState(100);
  const [productsPage, setProductsPage] = useState(1);
  const [importPageSize, setImportPageSize] = useState(100);
  const [importPage, setImportPage] = useState(1);


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

  const productsPageCount = Math.max(1, Math.ceil(marketplaceProducts.length / productsPageSize));
  const currentProductsPage = Math.min(productsPage, productsPageCount);
  const visibleMarketplaceProducts = marketplaceProducts.slice(
    (currentProductsPage - 1) * productsPageSize,
    currentProductsPage * productsPageSize
  );


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
   * AUTOMATISCHER SHOP-IMPORT
   * =======================================================
   */

const [verifiedShopUrl, setVerifiedShopUrl] = useState('');

const [verificationStatus, setVerificationStatus] =
  useState(null);
  const [shopImportSearching, setShopImportSearching] =
    useState(false);

  const [shopImportProducts, setShopImportProducts] =
    useState([]);

  const importPageCount = Math.max(1, Math.ceil(shopImportProducts.length / importPageSize));
  const currentImportPage = Math.min(importPage, importPageCount);
  const visibleShopImportProducts = shopImportProducts.slice(
    (currentImportPage - 1) * importPageSize,
    currentImportPage * importPageSize
  );

  const [shopImportSelected, setShopImportSelected] =
    useState([]);

  const [shopImportMessage, setShopImportMessage] =
  useState(null);

const [shopImportPreview, setShopImportPreview] =
  useState(null);

const [shopImportPreviewLoading, setShopImportPreviewLoading] =
  useState(false);

const [shopImportPreviewLoadingUrl, setShopImportPreviewLoadingUrl] =
  useState(null);  

const [shopImportRemovedImages, setShopImportRemovedImages] =
  useState({});  

const [shopImportRunning, setShopImportRunning] =
  useState(false);

const [shopImportProgress, setShopImportProgress] =
  useState({
    total: 0,
    completed: 0,
    imported: 0,
    failed: 0,
  });

const [shopImportErrors, setShopImportErrors] =
  useState([]);  

  /*
   * =======================================================
   * PRODUKTE IM ONLINESHOP SUCHEN
   * =======================================================
   */

  async function searchShopProducts() {
    if (shopImportSearching) return;

    setShopImportMessage(null);
    setShopImportProducts([]);
    setImportPage(1);
    setShopImportSelected([]);

    try {
      setShopImportSearching(true);

      const token = await shopify.sessionToken.get();

      const response = await fetch(
        `${API_BASE_URL}/api/shop-discover`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
body: JSON.stringify({}),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || 'Die Produktsuche ist fehlgeschlagen.'
        );
      }

      const products = Array.isArray(data.products)
        ? data.products
        : [];

      setShopImportProducts(products);

      setShopImportMessage(
        `${products.length} Produktlinks gefunden.` +
          (data.truncated
            ? ' Die Suche hat das festgelegte Limit erreicht.'
            : '')
      );
    } catch (error) {
      setShopImportMessage(
        error.message || 'Die Produktsuche ist fehlgeschlagen.'
      );
    } finally {
      setShopImportSearching(false);
    }
  }
/*
 * =======================================================
 * PRODUKTVORSCHAU FÜR AUTOMATISCHEN SHOP-IMPORT
 * =======================================================
 */

async function importSelectedShopProducts() {
  if (shopImportRunning || shopImportSelected.length === 0) {
    return;
  }

  const importedUrls = new Set(
    marketplaceProducts
      .filter((product) => product.status !== 'deleted')
      .map((product) => normalizeProductUrl(product.sourceUrl))
      .filter(Boolean)
  );

  const urls = [...new Set(shopImportSelected)].filter(
    (url) => !importedUrls.has(normalizeProductUrl(url))
  );

  if (urls.length === 0) {
    setShopImportSelected([]);
    setShopImportMessage({
      type: 'warning',
      text: 'Alle ausgewählten Produkte wurden bereits importiert.',
    });
    return;
  }

    setShopImportRunning(true);
  setShopImportMessage(null);
  setShopImportErrors([]);
  setShopImportProgress({
    total: urls.length,
    completed: 0,
    imported: 0,
    failed: 0,
  });

  let imported = 0;
  let failed = 0;
  const errors = [];

  try {
    for (const url of urls) {
      try {
        const token = await shopify.sessionToken.get();

        const scrapeResponse = await fetch(
          `${API_BASE_URL}/api/product-scrape`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url }),
          }
        );

        const scrapeData = await scrapeResponse.json();

        if (
          !scrapeResponse.ok ||
          !scrapeData.success ||
          !scrapeData.product
        ) {
          throw new Error(
            scrapeData.error || 'Produkt konnte nicht ausgelesen werden.'
          );
        }

        const removedImages = shopImportRemovedImages[url] || [];

        const product = {
          ...scrapeData.product,
          sourceUrl: url,
          images: Array.isArray(scrapeData.product.images)
            ? scrapeData.product.images.filter(
                imageUrl => !removedImages.includes(imageUrl)
              )
            : [],
        };

        const saveResponse = await fetch(`${API_BASE_URL}/api/shop-import`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ product }),
          }
        );

        const saveData = await saveResponse.json();

        if (!saveResponse.ok || !saveData.success) {
          throw new Error(
            saveData.error || 'Produkt konnte nicht gespeichert werden.'
          );
        }

        imported += 1;
      } catch (error) {
        failed += 1;

        errors.push({
          url,
          message:
            error instanceof Error
              ? error.message
              : 'Unbekannter Importfehler.',
        });
      }

      setShopImportProgress({
        total: urls.length,
        completed: imported + failed,
        imported,
        failed,
      });
    }

setShopImportErrors(errors);

if (imported > 0) {
  await loadProducts();
}

// Erfolgreich importierte Produkte aus der Auswahl entfernen.
// Fehlgeschlagene Produkte bleiben für einen erneuten Versuch auswählbar.
const failedUrls = new Set(errors.map((error) => error.url));

setShopImportSelected(
  urls.filter((url) => failedUrls.has(url))
);

setShopImportMessage({
  type: failed > 0 ? 'warning' : 'success',
  text: `${imported} Produkte importiert, ${failed} fehlgeschlagen.`,
});
  } catch (error) {
    setShopImportMessage({
      type: 'error',
      text:
        error instanceof Error
          ? error.message
          : 'Der Import konnte nicht abgeschlossen werden.',
    });
  } finally {
    setShopImportRunning(false);
  }
}

async function previewShopImportProduct(url) {
  if (shopImportPreviewLoading) return;

setShopImportPreview(null);
setShopImportPreviewLoadingUrl(url);
setShopImportPreviewLoading(true);

  try {
    const token = await shopify.sessionToken.get();

    const response = await fetch(
      `${API_BASE_URL}/api/product-scrape`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success || !data.product) {
      throw new Error(
        data.error || 'Die Produktvorschau konnte nicht geladen werden.'
      );
    }

    setShopImportPreview({
      url,
      product: data.product,
      error: null,
    });
  } catch (error) {
    setShopImportPreview({
      url,
      product: null,
      error:
        error.message ||
        'Die Produktvorschau konnte nicht geladen werden.',
    });
} finally {
  setShopImportPreviewLoading(false);
  setShopImportPreviewLoadingUrl(null);
}
}

  /*
   * =======================================================
   * MELDUNGEN
   * =======================================================
   */

  const [error, setError] =
    useState(null);

  const [saveMessage, setSaveMessage] =
    useState(null);

  const [bulkActionMessage, setBulkActionMessage] =
    useState(null);

  const [bulkActionError, setBulkActionError] =
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

  // Separate Statuswerte verhindern, dass parallele Übertragungen sich überschreiben.
  const [publishingProductIds, setPublishingProductIds] = useState({});
  const publishingIdsRef = useRef(new Set());
  const [bulkPublishing, setBulkPublishing] = useState(false);
  const bulkPublishingRef = useRef(false);
  const [bulkPublishProgress, setBulkPublishProgress] = useState({done: 0, total: 0});

  // Sammelaktualisierung bestehender Anbieterprodukte
  const [bulkRefreshing, setBulkRefreshing] = useState(false);
  const bulkRefreshingRef = useRef(false);
  const [bulkRefreshProgress, setBulkRefreshProgress] = useState({
    done: 0,
    total: 0,
    succeeded: 0,
    failed: 0,
  });
  const [bulkRefreshErrors, setBulkRefreshErrors] = useState([]);

const [changingCompareAtPrices, setChangingCompareAtPrices] =
  useState(false);

const [bulkStatusAction, setBulkStatusAction] =
  useState(null);

const bulkStatusActionRef = useRef(false);

async function loadVerifiedShopUrl() {
  try {
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
        data.error || 'Anbieterprofil konnte nicht geladen werden.'
      );
    }

    const profile = data.profile;

    setVerificationStatus(
      profile?.verificationStatus ?? null
    );

    setVerifiedShopUrl(
      profile?.verificationStatus === 'verified'
        ? profile?.verificationShopUrl || ''
        : ''
    );
  } catch (error) {
    console.error('VERIFIED SHOP LOAD ERROR:', error);
    setVerifiedShopUrl('');
    setVerificationStatus(null);
  }
}

  /*
   * =======================================================
   * START
   * =======================================================
   */

useEffect(() => {
  loadProducts();
  loadVerifiedShopUrl();
}, []);

  /*
   * =======================================================
   * PRODUKTE LADEN
   * =======================================================
   */

  async function loadProducts({bulk = false} = {}) {
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
    Math.max(
      (data.package.productLimit ?? 100) -
      (data.package.usedProducts ?? 0),
      0
    ),

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

      const message =
        err instanceof Error
          ? err.message
          : 'Produkte konnten nicht geladen werden.';

      if (bulk) {
        setBulkActionError(
          'Die Produktliste konnte nicht neu geladen werden: ' + message
        );
      } else {
        setError(message);
      }

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

  async function publishProduct(product, {bulk = false} = {}) {
    if (!product?.id || product.shopifyProductId ||
        publishingIdsRef.current.has(product.id) ||
        (!bulk && bulkPublishingRef.current)) {
      return false;
    }

    // Ref wird synchron aktualisiert: auch schnelle Doppelklicks werden abgefangen.
    publishingIdsRef.current.add(product.id);
    setPublishingProductIds((current) => ({...current, [product.id]: true}));
    if (!bulk) {
      setError(null);
      setSaveMessage(null);
    }

    try {
      const token = await shopify.sessionToken.get();
      const response = await fetch(`${API_BASE_URL}/api/product-publish`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({productId: product.id}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Produkt konnte nicht an Marktblatt übertragen werden.');
      }
      if (!bulk) {
        await loadProducts();
        setSaveMessage(data.message || 'Produkt wurde erfolgreich an Marktblatt übertragen.');
      }
      return true;
    } catch (err) {
      console.error('PRODUCT PUBLISH ERROR:', err);
      if (!bulk) {
        setError(err instanceof Error ? err.message :
          'Produkt konnte nicht an Marktblatt übertragen werden.');
      }
      return false;
    } finally {
      publishingIdsRef.current.delete(product.id);
      setPublishingProductIds((current) => {
        const next = {...current};
        delete next[product.id];
        return next;
      });
    }
  }

  async function refreshAllProducts() {
    if (
      bulkStatusActionRef.current ||
      bulkRefreshingRef.current ||
      bulkPublishingRef.current ||
      publishingIdsRef.current.size > 0
    ) return;

    const products = marketplaceProducts.filter(
      (product) =>
        product.id &&
        product.status !== 'deleted' &&
        product.sourceUrl
    );

    if (!products.length) {
      setBulkActionError(null);
      setBulkRefreshErrors([]);
      setBulkActionMessage('Keine Produkte mit einer Quelladresse zur Aktualisierung vorhanden.');
      return;
    }

    bulkRefreshingRef.current = true;
    setBulkRefreshing(true);
    setBulkRefreshProgress({
      done: 0,
      total: products.length,
      succeeded: 0,
      failed: 0,
    });
    setBulkRefreshErrors([]);
    setBulkActionError(null);
    setBulkActionMessage(null);

    let succeeded = 0;
    let failed = 0;
    const errors = [];

    try {
      for (const product of products) {
        try {
          const token = await shopify.sessionToken.get();

          const response = await fetch(
            `${API_BASE_URL}/api/product-refresh`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({productId: product.id}),
            }
          );

          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(
              data.error || 'Produkt konnte nicht aktualisiert werden.'
            );
          }

          succeeded += 1;
        } catch (err) {
          failed += 1;
          errors.push({
            productId: product.id,
            title: product.title || product.id,
            message: err?.message || 'Unbekannter Fehler',
          });
          console.error('PRODUCT REFRESH ERROR:', product.id, err);
        }

        setBulkRefreshProgress({
          done: succeeded + failed,
          total: products.length,
          succeeded,
          failed,
        });
      }

      setBulkRefreshErrors(errors);
      setBulkActionMessage(
        `${succeeded} Produkte aktualisiert, ${failed} fehlgeschlagen.`
      );
    } catch (err) {
      setBulkActionError(
        err?.message || 'Die Sammelaktualisierung ist fehlgeschlagen.'
      );
    } finally {
      try {
        await loadProducts({bulk: true});
      } catch (err) {
        setBulkActionError(
          err?.message || 'Die Produktliste konnte nicht neu geladen werden.'
        );
      } finally {
        bulkRefreshingRef.current = false;
        setBulkRefreshing(false);
      }
    }
  }
  async function publishAllProducts() {
    if (bulkPublishingRef.current || publishingIdsRef.current.size > 0) return;
    const pending = marketplaceProducts.filter((product) =>
      product.id && !product.shopifyProductId && product.status !== 'deleted'
    );
    if (!pending.length) {
      setSaveMessage('Alle Produkte wurden bereits an Marktblatt übertragen.');
      return;
    }

    bulkPublishingRef.current = true;
    setBulkPublishing(true);
    setBulkPublishProgress({done: 0, total: pending.length});
    setError(null);
    setSaveMessage(null);
    let succeeded = 0;
    let failed = 0;
    try {
      // Nacheinander übertragen, um API-Last und doppelte Anfragen zu vermeiden.
      for (const product of pending) {
        const ok = await publishProduct(product, {bulk: true});
        if (ok) succeeded += 1;
        else failed += 1;
        setBulkPublishProgress({done: succeeded + failed, total: pending.length});
      }
      setSaveMessage(`${succeeded} Produkte an Marktblatt übertragen, ${failed} fehlgeschlagen.`);
    } finally {
      try {
        await loadProducts();
      } finally {
        bulkPublishingRef.current = false;
        setBulkPublishing(false);
      }
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
  if (
    bulkStatusActionRef.current ||
    bulkRefreshingRef.current ||
    bulkPublishingRef.current ||
    publishingIdsRef.current.size > 0 ||
    loadingProducts
  ) {
    return;
  }

  bulkStatusActionRef.current = true;

  try {
    setBulkStatusAction(status);
    setBulkRefreshErrors([]);
    setBulkActionError(null);
    setBulkActionMessage(null);

    /*
     * Nur Produkte berücksichtigen, die bereits
     * an Marktblatt übertragen wurden.
     */
    const publishedProducts =
      marketplaceProducts.filter(
        (product) => product.shopifyProductId
      );

    if (publishedProducts.length === 0) {
      setBulkActionMessage(
        'Es wurden noch keine Produkte an Marktblatt übertragen.'
      );
      return;
    }

/*
 * Produkte überspringen, die bereits den
 * gewünschten Status besitzen.
 *
 * Beim Aktivieren zusätzlich alle Produkte
 * überspringen, die durch Marktblatt gesperrt wurden.
 */
const productsToChange =
  publishedProducts.filter(
    (product) =>
      product.status !== status &&
      !(
        status === 'active' &&
        product.adminLocked
      )
  );

/*
 * Anzahl der durch Marktblatt gesperrten Produkte,
 * die bei "Alle aktivieren" übersprungen werden.
 */
const adminLockedProducts =
  status === 'active'
    ? publishedProducts.filter(
        (product) =>
          product.status !== 'active' &&
          product.adminLocked
      )
    : [];

if (productsToChange.length === 0) {
  if (
    status === 'active' &&
    adminLockedProducts.length > 0
  ) {
    setBulkActionMessage(
      `${adminLockedProducts.length} ${
        adminLockedProducts.length === 1
          ? 'Produkt wurde'
          : 'Produkte wurden'
      } durch Marktblatt deaktiviert und ${
        adminLockedProducts.length === 1
          ? 'kann'
          : 'können'
      } nur durch Marktblatt wieder aktiviert werden.`
    );
  } else {
    setBulkActionMessage(
      status === 'active'
        ? 'Alle übertragenen Produkte sind bereits aktiviert.'
        : 'Alle übertragenen Produkte sind bereits deaktiviert.'
    );
  }

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

    await loadProducts({bulk: true});

if (
  status === 'active' &&
  adminLockedProducts.length > 0
) {
  setBulkActionMessage(
    `${productsToChange.length} ${
      productsToChange.length === 1
        ? 'Produkt wurde'
        : 'Produkte wurden'
    } aktiviert. ${adminLockedProducts.length} ${
      adminLockedProducts.length === 1
        ? 'Produkt wurde'
        : 'Produkte wurden'
    } übersprungen, da ${
      adminLockedProducts.length === 1
        ? 'es'
        : 'sie'
    } durch Marktblatt deaktiviert ${
      adminLockedProducts.length === 1
        ? 'wurde'
        : 'wurden'
    }.`
  );
} else {
  setBulkActionMessage(
    status === 'active'
      ? `${productsToChange.length} Produkte wurden aktiviert.`
      : `${productsToChange.length} Produkte wurden deaktiviert.`
  );
}

  } catch (err) {
    console.error(
      'BULK PRODUCT STATUS ERROR:',
      err
    );

    /*
     * Liste neu laden, weil vor einem möglichen Fehler
     * bereits einige Produkte geändert worden sein können.
     */
    await loadProducts({bulk: true});

    setBulkActionError(
      err instanceof Error
        ? err.message
        : 'Die Produktstatus konnten nicht geändert werden.'
    );

  } finally {
    bulkStatusActionRef.current = false;
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

  /*
   * Durch Marktblatt gesperrte Produkte dürfen
   * vom Anbieter nicht wieder aktiviert werden.
   */
  if (
    newStatus === 'active' &&
    product.adminLocked
  ) {
    setError(
      'Dieses Produkt kann nur durch Marktblatt wieder aktiviert werden. Bitte Support kontaktieren.'
    );

    return;
  }

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

        {/* ANBIETER-VERIFIZIERUNGSSTATUS */}

{verificationStatus === 'unverified' && (
  <s-banner tone="critical">
    Ihre Anbieter-Verifizierung wurde aufgehoben.
    Bitte reichen Sie Ihre Verifizierung erneut ein.
  </s-banner>
)}

{verificationStatus === 'rejected' && (
  <s-banner tone="critical">
    Ihre Verifizierung wurde abgelehnt.
    Bitte beachten Sie die Rückmeldung von Marktblatt.
  </s-banner>
)}

{verificationStatus === 'pending' && (
  <s-banner tone="warning">
    Ihre Verifizierung wird derzeit von Marktblatt geprüft.
  </s-banner>
)}

{verificationStatus === 'not_submitted' && (
  <s-banner tone="warning">
    Ihr Anbieterprofil ist noch nicht verifiziert.
  </s-banner>
)}

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

<s-banner
  tone={
    packageData.availableProducts > 0
      ? 'success'
      : 'critical'
  }
>
  {packageData.availableProducts}{' '}
  Produkte verfügbar
</s-banner>


<s-box paddingBlockStart="base">
  <s-text type="strong">
    So funktioniert es:
  </s-text>
</s-box>

    <s-text>
      1. Produkte finden: Durchsuchen Sie Ihren verifizierten Onlineshop
      automatisch oder fügen Sie einzelne Produkt-URLs hinzu.
    </s-text>

    <s-text>
      2. Produkte übernehmen: Wählen Sie Produkte aus, prüfen Sie die
      Vorschau und speichern Sie die gewünschten Produkte bei Marktblatt.
    </s-text>

    <s-text>
      3. Produkte übertragen und aktivieren: Übertragen Sie gespeicherte
      Produkte einzeln oder gemeinsam an Marktblatt und aktivieren Sie sie
      anschließend zur Veröffentlichung.
    </s-text>

    <s-text>
      4. Produkte aktualisieren: Mit „Alle aktualisieren“ übernehmen Sie
      aktuelle Produktinformationen und Preise aus Ihrem Onlineshop.
      Bestehende Produktbilder bleiben dabei unverändert.
    </s-text>

    <s-text>
      5. Produkte verwalten: Aktivieren oder deaktivieren Sie Ihre
      übertragenen Produkte einzeln oder gemeinsam. Durch Marktblatt
      gesperrte Produkte können nur vom Marktblatt-Support wieder
      aktiviert werden.
    </s-text>


    <s-stack
      direction="inline"
      gap="small"
    >

<s-button
  variant="primary"
  onClick={refreshAllProducts}
  disabled={
    bulkRefreshing ||
    bulkPublishing ||
    bulkStatusAction !== null ||
    loadingProducts ||
    !marketplaceProducts.some(
      (product) =>
        product.id &&
        product.status !== 'deleted' &&
        product.sourceUrl
    )
  }
>
  {bulkRefreshing
    ? `Aktualisiere ${bulkRefreshProgress.done} von ${bulkRefreshProgress.total}...`
    : 'Alle aktualisieren'}
</s-button>

<s-button
  variant="primary"
  onClick={() =>
    changeAllProductStatuses('active')
  }
  disabled={
    bulkStatusAction !== null ||
    bulkRefreshing ||
    bulkPublishing ||
    Object.keys(publishingProductIds).length > 0 ||
    loadingProducts
  }
>
  {bulkStatusAction === 'active'
    ? 'Alle werden aktiviert...'
    : 'Alle aktivieren'}
</s-button>

<s-button
  onClick={() =>
    changeAllProductStatuses('inactive')
  }
  disabled={
    bulkStatusAction !== null ||
    bulkRefreshing ||
    bulkPublishing ||
    Object.keys(publishingProductIds).length > 0 ||
    loadingProducts
  }
>
  {bulkStatusAction === 'inactive'
    ? 'Alle werden deaktiviert...'
    : 'Alle deaktivieren'}
</s-button>

    </s-stack>

    {bulkActionMessage && (
      <s-banner
        tone={bulkRefreshErrors.length > 0 ? 'warning' : 'success'}
        heading={bulkRefreshErrors.length > 0 ? 'Teilweise aktualisiert' : 'Erfolgreich'}
      >
        {bulkActionMessage}
      </s-banner>
    )}

    {bulkActionError && (
      <s-banner tone="critical" heading="Fehler">
        {bulkActionError}
      </s-banner>
    )}

{/* FEHLERÜBERSICHT SAMMELAKTUALISIERUNG */}

{bulkRefreshErrors.length > 0 && (
  <s-banner
    tone="critical"
    heading={`${bulkRefreshErrors.length} Produkte konnten nicht aktualisiert werden`}
  >
    <s-stack direction="block" gap="small">
      {bulkRefreshErrors.map((item) => (
        <s-text key={item.productId}>
          {item.title}: {item.message}
        </s-text>
      ))}
    </s-stack>
  </s-banner>
)}


<s-stack
  direction="block"
  gap="small"
>
<s-box paddingBlockStart="base">
  <s-text type="strong">
    Funktion Streichpreis
  </s-text>
</s-box>

<s-text>
  Bei falscher Ausgabe, können Sie den Streichpreis deaktivieren.
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

          {/* AUTOMATISCHER SHOP-IMPORT */}

          {['business', 'professional', 'enterprise'].includes(
            String(packageData.name || '').toLowerCase()
          ) && (
            <s-section heading="Automatischer Shop-Import">
              <s-stack direction="block" gap="base">

<s-text>
  Marktblatt durchsucht automatisch Ihren
  verifizierten Onlineshop nach verfügbaren
  Produktlinks.
</s-text>

{verifiedShopUrl ? (
  <s-stack direction="block" gap="small">
    <s-text type="strong">
      Verifizierter Onlineshop:
    </s-text>

<s-banner tone="success">
  {verifiedShopUrl}
</s-banner>
  </s-stack>
) : (
<s-banner tone="critical">
  Keine verifizierte Shop-Adresse verfügbar.
  Bitte reichen Sie Ihre Anbieter-Verifizierung erneut ein.
</s-banner>
)}

                <s-button
                  variant="primary"
                  onClick={searchShopProducts}
                  disabled={shopImportSearching || !verifiedShopUrl}
                >
                  {shopImportSearching
                    ? 'Produkte werden gesucht...'
                    : 'Produkte suchen'}
                </s-button>

                                {shopImportMessage && (
                  <s-text>
                    {typeof shopImportMessage === 'string'
                      ? shopImportMessage
                      : shopImportMessage.text}
                  </s-text>
                )}

                {shopImportErrors.length > 0 && (
                  <s-box
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-stack direction="block" gap="base">
                      <s-text type="strong">
                        Fehlgeschlagene Produktimporte:
                        {' '}{shopImportErrors.length}
                      </s-text>

                      {shopImportErrors.map((error, index) => (
                        <s-stack
                          key={`${error.url}-${index}`}
                          direction="block"
                          gap="small"
                        >
                          <s-text>
                            Produkt: {error.url}
                          </s-text>

                          <s-text>
                            Fehler: {error.message}
                          </s-text>
                        </s-stack>
                      ))}
                    </s-stack>
                  </s-box>
                )}

                
                  {shopImportProducts.length > 0 && (
                    <s-stack direction="block" gap="base">

                      <s-text type="strong">
                        Gefundene Produkte: {shopImportProducts.length}
                      </s-text>

                      <s-stack direction="inline" gap="small" wrap>
                        <s-text>Pro Seite:</s-text>
                        <s-button disabled={importPageSize === 100} onClick={() => { setImportPageSize(100); setImportPage(1); }}>100</s-button>
                        <s-button disabled={importPageSize === 200} onClick={() => { setImportPageSize(200); setImportPage(1); }}>200</s-button>
                        <s-button disabled={currentImportPage <= 1} onClick={() => setImportPage(currentImportPage - 1)}>Zurück</s-button>
                        <s-text>Seite {currentImportPage} von {importPageCount}</s-text>
                        <s-button disabled={currentImportPage >= importPageCount} onClick={() => setImportPage(currentImportPage + 1)}>Weiter</s-button>
                      </s-stack>

                      <s-text>
                        Ausgewählt: {shopImportSelected.length} von maximal{' '}
                        {packageData.availableProducts} verfügbaren
                        Produktplätzen
                      </s-text>

                      <s-checkbox
                        label="Alle auswählen"
                        checked={
                          shopImportProducts.some(
                            (url) => !marketplaceProducts.some(
                              (product) =>
                                product.status !== 'deleted' &&
                                normalizeProductUrl(product.sourceUrl) === normalizeProductUrl(url)
                            )
                          ) &&
                          shopImportSelected.length ===
                            Math.min(
                              shopImportProducts.filter(
                                (url) => !marketplaceProducts.some(
                                  (product) =>
                                    product.status !== 'deleted' &&
                                    normalizeProductUrl(product.sourceUrl) === normalizeProductUrl(url)
                                )
                              ).length,
                              packageData.availableProducts
                            )
                        }
                        onChange={(event) => {
                          if (event.currentTarget.checked) {
                            setShopImportSelected(
                              shopImportProducts.filter(
                                (url) => !marketplaceProducts.some(
                                  (product) =>
                                    product.status !== 'deleted' &&
                                    normalizeProductUrl(product.sourceUrl) === normalizeProductUrl(url)
                                )
                              ).slice(0, packageData.availableProducts)
                            );
                          } else {
                            setShopImportSelected([]);
                          }
                        }}
                      />

                      <s-box
                        border="base solid"
                        borderRadius="base"
                        padding="base"
                      >
                        <s-stack direction="block" gap="small">

                          {visibleShopImportProducts.map((url, index) => {
const alreadyImported = marketplaceProducts.some(
  (product) =>
    normalizeProductUrl(product.sourceUrl) === normalizeProductUrl(url) &&
    product.status !== 'deleted'
);
                            const selected =
                              shopImportSelected.includes(url);

                            const limitReached =
                              !selected &&
                              shopImportSelected.length >=
                                packageData.availableProducts;

                            return (
  <s-stack key={url} direction="block" gap="small">
<s-checkbox
  key={url}
label={`${(currentImportPage - 1) * importPageSize + index + 1}. ${decodeURIComponent(
    new URL(url).pathname.split('/').filter(Boolean).pop() || url
  ).replace(/-/g, ' ')}`}
  checked={selected && !alreadyImported}
  disabled={alreadyImported || limitReached}
                                onChange={(event) => {
                                  if (event.currentTarget.checked) {
                                    setShopImportSelected((previous) =>
                                      previous.includes(url) ||
                                      previous.length >=
                                        packageData.availableProducts
                                        ? previous
                                        : [...previous, url]
                                    );
                                  } else {
                                    setShopImportSelected((previous) =>
                                      previous.filter(
                                        (item) => item !== url
                                      )
                                    );
                                  }
                                  }}
                                />
{alreadyImported && (
  <s-banner tone="success">
    ✓ Bereits importiert
  </s-banner>
)}

<s-button
  variant="secondary"
  disabled={
    shopImportPreviewLoadingUrl === url ||
    (!shopImportPreviewLoading &&
      shopImportPreview?.url === url)
  }
  onClick={() => previewShopImportProduct(url)}
>
  {shopImportPreviewLoadingUrl === url
    ? 'Vorschau wird geladen...'
    : 'Vorschau'}
</s-button>

                                  {shopImportPreview?.url === url && (
                                    <s-box
                                      border="base solid"
                                      borderRadius="base"
                                      padding="base"
                                    >
                                      <s-stack direction="block" gap="base">
                                        <s-heading>Produktvorschau</s-heading>

                                        {shopImportPreview.error ? (
                                          <s-text>
                                            {shopImportPreview.error}
                                          </s-text>
                                        ) : (
                                          <>
                                            <s-text type="strong">
                                              {shopImportPreview.product.title}
                                            </s-text>

{Array.isArray(shopImportPreview.product.images) && (
  <s-grid
    gridTemplateColumns="repeat(3, minmax(0, 1fr))"
    gap="base"
  >
    {shopImportPreview.product.images
      .filter(
        (imageUrl) =>
          !(shopImportRemovedImages[url] || []).includes(imageUrl)
      )
      .map((imageUrl, imageIndex) => (
        <s-box
          key={`${imageIndex}-${imageUrl}`}
          padding="small"
          border="base solid"
          borderRadius="base"
        >
          <s-stack direction="block" gap="small">
            <s-image
              src={imageUrl}
              alt={`Produktbild ${imageIndex + 1}`}
              inlineSize="80px"
              aspectRatio="1"
              objectFit="contain"
            />

            <s-button
              variant="secondary"
              onClick={() => {
                setShopImportRemovedImages((previous) => ({
                  ...previous,
                  [url]: [
                    ...(previous[url] || []),
                    imageUrl,
                  ],
                }));
              }}
            >
              Bild entfernen
            </s-button>
          </s-stack>
        </s-box>
      ))}
  </s-grid>
)}

                                            <s-text>
                                              Preis: {shopImportPreview.product.price ?? 'Nicht verfügbar'}
                                            </s-text>

                                            <s-text>
                                              Artikelnummer: {shopImportPreview.product.sku || 'Nicht vorhanden'}
                                            </s-text>

                                            {shopImportPreview.product.description && (
                                              <s-text>
                                                {shopImportPreview.product.description}
                                              </s-text>
                                            )}

                                            {Array.isArray(shopImportPreview.product.variants) &&
                                              shopImportPreview.product.variants.map(
                                                (variant, variantIndex) => (
                                                  <s-text key={variant.id || variantIndex}>
                                                    {variant.title || `Variante ${variantIndex + 1}`}
                                                    {' – Art.-Nr.: '}
                                                    {variant.sku || 'Nicht vorhanden'}
                                                    {' – Preis: '}
                                                    {variant.price ?? 'Nicht verfügbar'}
                                                  </s-text>
                                                )
                                              )}
                                          </>
                                        )}

                                        <s-button
                                          variant="secondary"
                                          onClick={() => setShopImportPreview(null)}
                                        >
                                          Vorschau schließen
                                        </s-button>
                                      </s-stack>
                                    </s-box>
                                  )}

                                </s-stack>
                                );
                          })}

                        </s-stack>
                      </s-box>

                                            <s-text>
                        {shopImportSelected.length} Produkte für den
                        Import ausgewählt.
                      </s-text>

                      {shopImportSelected.length > 0 && (
                        <s-button
                          variant="primary"
                          disabled={shopImportRunning}
                          onClick={importSelectedShopProducts}
                        >
                          {shopImportRunning
                            ? `Import läuft (${shopImportProgress.completed} von ${shopImportProgress.total})`
                            : `${shopImportSelected.length} Produkte importieren`}
                        </s-button>
                      )}

                      <s-stack direction="inline" gap="small" wrap>
                        <s-text>Pro Seite:</s-text>
                        <s-button disabled={importPageSize === 100} onClick={() => { setImportPageSize(100); setImportPage(1); }}>100</s-button>
                        <s-button disabled={importPageSize === 200} onClick={() => { setImportPageSize(200); setImportPage(1); }}>200</s-button>
                        <s-button disabled={currentImportPage <= 1} onClick={() => setImportPage(currentImportPage - 1)}>Zurück</s-button>
                        <s-text>Seite {currentImportPage} von {importPageCount}</s-text>
                        <s-button disabled={currentImportPage >= importPageCount} onClick={() => setImportPage(currentImportPage + 1)}>Weiter</s-button>
                      </s-stack>

                      {shopImportRunning && (
                        <s-banner tone="warning">
                          Bitte lassen Sie diese Seite während des Imports geöffnet und aktualisieren Sie diese nicht.
                        </s-banner>
                      )}



                      {shopImportRunning && (
                        <s-text>
                          Importiert: {shopImportProgress.imported} |
                          Fehlgeschlagen: {shopImportProgress.failed}
                        </s-text>
                      )}


{!shopImportRunning &&
  shopImportProgress.total > 0 && (
    <s-banner
      tone={shopImportProgress.failed > 0 ? 'warning' : 'success'}
    >
      Import abgeschlossen: {shopImportProgress.imported} erfolgreich,
      {' '}{shopImportProgress.failed} fehlgeschlagen.
    </s-banner>
  )}


                    </s-stack>
                  )}

              </s-stack>
            </s-section>
          )}


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
  <s-banner
    tone="critical"
    heading="Fehler"
  >
    {error}
  </s-banner>
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

{productPreview.compareAtPrice && (
  <s-text>
    Streichpreis: {productPreview.compareAtPrice}
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

{/* ERFOLGS- UND STATUSMELDUNG */}

{saveMessage && (
  <s-banner
    tone="success"
    heading="Erfolgreich"
  >
    {saveMessage}
  </s-banner>
)}




        {/* PRODUKTLISTE */}

        <s-section heading="Ihre Produkte">

          <s-box paddingBlockEnd="base">
          <s-button
            variant="primary"
            onClick={publishAllProducts}
            disabled={
              bulkPublishing ||
              Object.keys(publishingProductIds).length > 0 ||
              !marketplaceProducts.some(
                (product) =>
                  product.id &&
                  !product.shopifyProductId &&
                  product.status !== 'deleted'
              )
            }
          >
            {bulkPublishing
              ? `Wird übertragen (${bulkPublishProgress.done} von ${bulkPublishProgress.total})...`
              : 'Alle an Marktblatt übertragen'}
          </s-button>
          </s-box>

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

                  <>
                  <s-stack direction="inline" gap="small" wrap>
                    <s-text>Pro Seite:</s-text>
                    <s-button disabled={productsPageSize === 100} onClick={() => { setProductsPageSize(100); setProductsPage(1); }}>100</s-button>
                    <s-button disabled={productsPageSize === 200} onClick={() => { setProductsPageSize(200); setProductsPage(1); }}>200</s-button>
                    <s-button disabled={currentProductsPage <= 1} onClick={() => setProductsPage(currentProductsPage - 1)}>Zurück</s-button>
                    <s-text>Seite {currentProductsPage} von {productsPageCount}</s-text>
                    <s-button disabled={currentProductsPage >= productsPageCount} onClick={() => setProductsPage(currentProductsPage + 1)}>Weiter</s-button>
                  </s-stack>

                  <s-grid
                    gridTemplateColumns="repeat(4, minmax(0, 1fr))"
                    gap="base"
                  >

                    {visibleMarketplaceProducts.map(
                      (product) => {

                        const statusChanging =
                          changingStatusId ===
                          product.id;

                        const productDeleting =
                          deletingProductId ===
                          product.id;

                        const productPublishing =
                          Boolean(publishingProductIds[product.id]);

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

                                <s-stack direction="inline" gap="small">
                                   <s-text>Status:</s-text>



{product.status === 'active' ? (
  <s-banner tone="success">
    Aktiv
  </s-banner>
) : product.status === 'inactive' ? (
  <s-banner tone="critical">
    Inaktiv
  </s-banner>
) : (
  <s-banner tone="warning">
    Entwurf
  </s-banner>
)}



                                 </s-stack>

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
  <>
    {product.adminLocked &&
      product.status !== 'active' && (
        <s-stack
          direction="block"
          gap="small"
        >
          <s-text tone="critical">
            <strong>
              Durch Marktblatt deaktiviert
            </strong>
          </s-text>

          <s-text tone="critical">
            Dieses Produkt kann nur durch Marktblatt wieder aktiviert werden. Bitte Support kontaktieren.
          </s-text>
        </s-stack>
      )}

    <s-button
      onClick={() =>
        toggleProductStatus(
          product
        )
      }
      disabled={
        statusChanging ||
        productDeleting ||
        productPublishing ||
        bulkPublishing ||
        (
          product.adminLocked &&
          product.status !== 'active'
        )
      }
    >
      {statusChanging
        ? 'Status wird gespeichert...'
        : product.status ===
            'active'
          ? 'Deaktivieren'
          : product.adminLocked
            ? 'Durch Marktblatt deaktiviert'
            : 'Aktivieren'}
    </s-button>
  </>
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
                                        productPublishing ||
                                        bulkPublishing
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

                  <s-stack direction="inline" gap="small" wrap>
                    <s-text>Pro Seite:</s-text>
                    <s-button disabled={productsPageSize === 100} onClick={() => { setProductsPageSize(100); setProductsPage(1); }}>100</s-button>
                    <s-button disabled={productsPageSize === 200} onClick={() => { setProductsPageSize(200); setProductsPage(1); }}>200</s-button>
                    <s-button disabled={currentProductsPage <= 1} onClick={() => setProductsPage(currentProductsPage - 1)}>Zurück</s-button>
                    <s-text>Seite {currentProductsPage} von {productsPageCount}</s-text>
                    <s-button disabled={currentProductsPage >= productsPageCount} onClick={() => setProductsPage(currentProductsPage + 1)}>Weiter</s-button>
                  </s-stack>

                  </>
                )}

              </>

            )}

          </s-stack>

        </s-section>

      </s-stack>

    </s-page>
  );
}
