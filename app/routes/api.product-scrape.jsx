import * as cheerio from "cheerio";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_HTML_SIZE = 5 * 1024 * 1024;
const FETCH_TIMEOUT = 10000;


/*
 * =========================================================
 * SICHERHEIT: PRIVATE / INTERNE IP-ADRESSEN BLOCKIEREN
 * =========================================================
 */

function isPrivateIp(ip) {
  if (!net.isIP(ip)) return true;

  // IPv4
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }

  // IPv6
  const normalized = ip.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}


/*
 * =========================================================
 * PRODUKT-URL PRÜFEN
 * =========================================================
 */

async function validatePublicUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Die Produkt-URL ist ungültig.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(
      "Es sind nur HTTP- und HTTPS-Adressen erlaubt."
    );
  }

  if (url.username || url.password) {
    throw new Error(
      "URLs mit Zugangsdaten sind nicht erlaubt."
    );
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(
      "Diese Adresse ist nicht erlaubt."
    );
  }

  const addresses = await dns.lookup(
    hostname,
    {all: true}
  );

  if (!addresses.length) {
    throw new Error(
      "Die Domain konnte nicht gefunden werden."
    );
  }

  for (const address of addresses) {
    if (isPrivateIp(address.address)) {
      throw new Error(
        "Private oder interne Netzwerkadressen sind nicht erlaubt."
      );
    }
  }

  return url;
}


/*
 * =========================================================
 * TEXT BEREINIGEN
 * =========================================================
 */

function cleanText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}


/*
 * =========================================================
 * RELATIVE URL IN ABSOLUTE URL UMWANDELN
 * =========================================================
 */

function absoluteUrl(value, baseUrl) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}


/*
 * =========================================================
 * JSON-LD PRODUKTE FINDEN
 * =========================================================
 */

function findProductsInJsonLd(
  value,
  products = []
) {
  if (!value) {
    return products;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      findProductsInJsonLd(
        item,
        products
      );
    }

    return products;
  }

  if (typeof value !== "object") {
    return products;
  }

  if (value["@graph"]) {
    findProductsInJsonLd(
      value["@graph"],
      products
    );
  }

  const type = value["@type"];

  const types = Array.isArray(type)
    ? type
    : [type];

  if (
    types.some(
      (item) =>
        typeof item === "string" &&
        item.toLowerCase() === "product"
    )
  ) {
    products.push(value);
  }

  return products;
}


/*
 * =========================================================
 * JSON-LD AUS HTML AUSLESEN
 * =========================================================
 */

function getJsonLdProducts($) {
  const products = [];

  $('script[type="application/ld+json"]').each(
    (_, element) => {
      const content = $(element).html();

      if (!content) {
        return;
      }

      try {
        const json = JSON.parse(content);

        findProductsInJsonLd(
          json,
          products
        );
      } catch {
        /*
         * Manche Shops enthalten fehlerhaftes JSON-LD.
         * Dann verwenden wir später Meta-Daten.
         */
      }
    }
  );

  return products;
}


/*
 * =========================================================
 * BILDER AUS JSON-LD AUSLESEN
 * =========================================================
 */

function getImagesFromProduct(
  product,
  baseUrl
) {
  const images = [];

  const add = (value) => {
    if (typeof value === "string") {
      const image = absoluteUrl(
        value,
        baseUrl
      );

      if (image) {
        images.push(image);
      }

      return;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      const candidate =
        value.url ||
        value.contentUrl ||
        value["@id"];

      if (candidate) {
        add(candidate);
      }
    }
  };

  if (Array.isArray(product?.image)) {
    product.image.forEach(add);
  } else {
    add(product?.image);
  }

  return images;
}


/*
 * =========================================================
 * BILDER BEREINIGEN UND DUPLIKATE ENTFERNEN
 * =========================================================
 */

function cleanProductImages(
  values,
  baseUrl
) {
  const result = [];
  const seen = new Set();

  for (const value of values) {
    if (
      !value ||
      typeof value !== "string"
    ) {
      continue;
    }

    try {
      const url = new URL(
        value,
        baseUrl
      );

      /*
       * Nur HTTP und HTTPS erlauben
       */
      if (
        !["http:", "https:"].includes(
          url.protocol
        )
      ) {
        continue;
      }

      /*
       * HTTP nach HTTPS normalisieren.
       */
      if (url.protocol === "http:") {
        url.protocol = "https:";
      }

      /*
       * Typische Größenparameter entfernen.
       *
       * Dadurch gelten beispielsweise:
       *
       * bild.jpg
       * bild.jpg?width=1920
       *
       * als dasselbe Produktbild.
       */
      const parametersToRemove = [
        "width",
        "height",
        "w",
        "h",
        "size",
        "crop",
      ];

      for (
        const parameter of parametersToRemove
      ) {
        url.searchParams.delete(
          parameter
        );
      }

      /*
       * Hash entfernen.
       */
      url.hash = "";

      /*
       * Vergleichs-URL erzeugen.
       *
       * Der Shopify-Versionsparameter ?v=
       * wird für die Erkennung von Duplikaten
       * ignoriert.
       */
      const comparisonUrl =
        new URL(url.href);

      comparisonUrl.searchParams.delete(
        "v"
      );

      comparisonUrl.hash = "";

      /*
       * Host + Pfad sind unser
       * Hauptschlüssel für Duplikate.
       */
      const key =
        comparisonUrl.hostname.toLowerCase() +
        comparisonUrl.pathname.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      /*
       * Die eigentliche URL behalten wir
       * inklusive eventuell vorhandenem
       * Versionsparameter.
       */
      result.push(url.href);

      /*
       * Maximal 5 Produktbilder.
       */
      if (result.length >= 5) {
        break;
      }
    } catch {
      /*
       * Ungültige Bild-URLs werden
       * einfach ignoriert.
       */
    }
  }

  return result;
}

/*
 * =========================================================
 * PRODUKTBILDER AUS HTML-GALERIE AUSLESEN
 * =========================================================
 *
 * Ergänzt JSON-LD und OpenGraph.
 *
 * Es werden bevorzugt Bilder aus typischen Produktgalerien
 * gesucht. Logos, Icons, Avatare, Zahlungsbilder usw.
 * werden soweit möglich ausgeschlossen.
 */

function getImagesFromHtml($, pageUrl) {
  const images = [];

  /*
   * Bild hinzufügen
   */

  const addImage = (value) => {
    if (
      !value ||
      typeof value !== "string"
    ) {
      return;
    }

    const cleaned =
      value.trim();

    if (
      !cleaned ||
      cleaned.startsWith("data:") ||
      cleaned.startsWith("blob:")
    ) {
      return;
    }

    const absolute =
      absoluteUrl(
        cleaned,
        pageUrl
      );

    if (!absolute) {
      return;
    }

    /*
     * Typische Nicht-Produktbilder ausschließen.
     */

    const lower =
      absolute.toLowerCase();

    const blockedWords = [
      "logo",
      "icon",
      "favicon",
      "avatar",
      "payment",
      "paypal",
      "klarna",
      "visa",
      "mastercard",
      "amex",
      "apple-pay",
      "google-pay",
      "trust",
      "badge",
      "rating",
      "stars",
      "sprite",
      "placeholder",
    ];

    if (
      blockedWords.some(
        (word) =>
          lower.includes(word)
      )
    ) {
      return;
    }

    images.push(absolute);
  };


  /*
   * SRCSET AUSWERTEN
   *
   * Wenn mehrere Auflösungen vorhanden sind,
   * verwenden wir bevorzugt die größte.
   */

  const addSrcset = (value) => {
    if (
      !value ||
      typeof value !== "string"
    ) {
      return;
    }

    const candidates =
      value
        .split(",")
        .map((entry) => {
          const parts =
            entry
              .trim()
              .split(/\s+/);

          const url =
            parts[0];

          const descriptor =
            parts[1] || "";

          let size = 0;

          if (
            descriptor.endsWith("w")
          ) {
            size =
              Number(
                descriptor.slice(0, -1)
              ) || 0;
          }

          if (
            descriptor.endsWith("x")
          ) {
            size =
              (
                Number(
                  descriptor.slice(0, -1)
                ) || 0
              ) * 1000;
          }

          return {
            url,
            size,
          };
        })
        .filter(
          (item) =>
            item.url
        )
        .sort(
          (a, b) =>
            b.size - a.size
        );

    if (candidates[0]?.url) {
      addImage(
        candidates[0].url
      );
    }
  };


  /*
   * Typische Produktgalerien verschiedener
   * Shopsysteme.
   */

  const gallerySelectors = [
    /*
     * Allgemein
     */
    '[class*="product"] [class*="gallery"] img',
    '[class*="product"] [class*="media"] img',
    '[class*="product"] [class*="image"] img',
    '[class*="product"] [class*="slider"] img',
    '[class*="product"] [class*="carousel"] img',
    '[class*="product"] [class*="thumbnail"] img',

    '[id*="product"] [class*="gallery"] img',
    '[id*="product"] [class*="media"] img',
    '[id*="product"] [class*="image"] img',

    /*
     * Shopify
     */
    '.product__media img',
    '.product-media img',
    '.product__media-list img',
    '.product__media-item img',
    '[data-product-media] img',
    '[data-product-media-type] img',

    /*
     * WooCommerce
     */
    '.woocommerce-product-gallery img',
    '.woocommerce-product-gallery__image img',
    '.flex-control-thumbs img',

    /*
     * Weitere häufige Galeriebezeichnungen
     */
    '.product-gallery img',
    '.product-images img',
    '.product-image img',
    '.product-slider img',
    '.product-carousel img',
    '.product-thumbnails img',
    '.product-detail img',
  ];


  /*
   * Zuerst gezielt Produktgalerien durchsuchen.
   */

  for (
    const selector of gallerySelectors
  ) {
    $(selector).each(
      (_, element) => {
        const image =
          $(element);

        /*
         * Lazy-Loading Varianten
         */

        addImage(
          image.attr("data-zoom-image")
        );

        addImage(
          image.attr("data-large_image")
        );

        addImage(
          image.attr("data-large-image")
        );

        addImage(
          image.attr("data-original")
        );

        addImage(
          image.attr("data-src")
        );

        addImage(
          image.attr("data-lazy-src")
        );

        addImage(
          image.attr("data-lazy")
        );

        /*
         * Responsive Bilder
         */

        addSrcset(
          image.attr("srcset")
        );

        addSrcset(
          image.attr("data-srcset")
        );

        /*
         * Normales Bild
         */

        addImage(
          image.attr("src")
        );
      }
    );
  }


  /*
   * Links auf hochauflösende Produktbilder.
   *
   * Manche Galerien verwenden im <a>-Element
   * das große Bild und im <img> nur das Thumbnail.
   */

  const galleryLinkSelectors = [
    '.woocommerce-product-gallery a',
    '.product-gallery a',
    '.product-images a',
    '.product__media a',
    '[class*="product"] [class*="gallery"] a',
  ];

  for (
    const selector of galleryLinkSelectors
  ) {
    $(selector).each(
      (_, element) => {
        addImage(
          $(element).attr("href")
        );
      }
    );
  }


  /*
   * Als zusätzliche Absicherung:
   * Bilder mit product-bezogenen Attributen.
   */

  $("img").each(
    (_, element) => {
      const image =
        $(element);

      const context = [
        image.attr("class"),
        image.attr("id"),
        image.attr("alt"),
        image.attr("data-media-id"),
        image.parent().attr("class"),
        image.parent().attr("id"),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (
        !context.includes("product") &&
        !context.includes("gallery") &&
        !context.includes("media")
      ) {
        return;
      }

      addImage(
        image.attr("data-zoom-image")
      );

      addImage(
        image.attr("data-large_image")
      );

      addImage(
        image.attr("data-src")
      );

      addSrcset(
        image.attr("srcset")
      );

      addSrcset(
        image.attr("data-srcset")
      );

      addImage(
        image.attr("src")
      );
    }
  );


  return images;
}

/*
 * =========================================================
 * PREISANGEBOT AUS JSON-LD
 * =========================================================
 */

function getOffer(product) {
  if (!product?.offers) {
    return null;
  }

  if (Array.isArray(product.offers)) {
    return product.offers[0] ?? null;
  }

  if (
    product.offers["@type"] ===
    "AggregateOffer"
  ) {
    return product.offers;
  }

  return product.offers;
}


/*
 * =========================================================
 * HTML HERUNTERLADEN
 * =========================================================
 */

async function downloadHtml(startUrl) {
  let currentUrl =
    await validatePublicUrl(startUrl);

  for (
    let redirectCount = 0;
    redirectCount <= 5;
    redirectCount++
  ) {
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      FETCH_TIMEOUT
    );

    let response;

    try {
      response = await fetch(
        currentUrl.href,
        {
          redirect: "manual",

          signal:
            controller.signal,

          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; MarktblattProductImporter/1.0)",

            Accept:
              "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "de-DE,de;q=0.9,en;q=0.7",
          },
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    /*
     * WEITERLEITUNGEN
     */

    if (
      [
        301,
        302,
        303,
        307,
        308,
      ].includes(response.status)
    ) {
      const location =
        response.headers.get(
          "location"
        );

      if (!location) {
        throw new Error(
          "Ungültige Weiterleitung der Produktseite."
        );
      }

      const redirectedUrl =
        new URL(
          location,
          currentUrl
        );

      currentUrl =
        await validatePublicUrl(
          redirectedUrl.href
        );

      continue;
    }

    /*
     * HTTP FEHLER
     */

    if (!response.ok) {
      throw new Error(
        `Die Produktseite antwortet mit HTTP ${response.status}.`
      );
    }

    /*
     * NUR HTML
     */

    const contentType =
      response.headers.get(
        "content-type"
      ) || "";

    if (
      !contentType
        .toLowerCase()
        .includes("text/html")
    ) {
      throw new Error(
        "Die angegebene Adresse ist keine HTML-Produktseite."
      );
    }

    /*
     * DATEIGRÖSSE PRÜFEN
     */

    const declaredLength =
      Number(
        response.headers.get(
          "content-length"
        ) || 0
      );

    if (
      declaredLength >
      MAX_HTML_SIZE
    ) {
      throw new Error(
        "Die Produktseite ist zu groß."
      );
    }

    const reader =
      response.body?.getReader();

    if (!reader) {
      throw new Error(
        "Die Produktseite konnte nicht gelesen werden."
      );
    }

    const chunks = [];
    let received = 0;

    while (true) {
      const {
        done,
        value,
      } = await reader.read();

      if (done) {
        break;
      }

      received +=
        value.byteLength;

      if (
        received >
        MAX_HTML_SIZE
      ) {
        await reader.cancel();

        throw new Error(
          "Die Produktseite ist zu groß."
        );
      }

      chunks.push(value);
    }

    const bytes =
      new Uint8Array(received);

    let position = 0;

    for (const chunk of chunks) {
      bytes.set(
        chunk,
        position
      );

      position +=
        chunk.byteLength;
    }

    return {
      html:
        new TextDecoder().decode(
          bytes
        ),

      finalUrl:
        currentUrl.href,
    };
  }

  throw new Error(
    "Die Produktseite hat zu viele Weiterleitungen."
  );
}


/*
 * =========================================================
 * PRODUKTDATEN EXTRAHIEREN
 * =========================================================
 */

function extractProduct(
  html,
  pageUrl
) {
  const $ = cheerio.load(html);

  const jsonLdProducts =
    getJsonLdProducts($);

  const product =
    jsonLdProducts[0] ?? null;

  const offer =
    getOffer(product);

  const meta = (selector) =>
    cleanText(
      $(selector)
        .first()
        .attr("content")
    );

  /*
   * TITEL
   */

  const title =
    cleanText(product?.name) ||
    meta(
      'meta[property="og:title"]'
    ) ||
    meta(
      'meta[name="twitter:title"]'
    ) ||
    cleanText(
      $("h1").first().text()
    ) ||
    cleanText(
      $("title").first().text()
    );

  /*
   * BESCHREIBUNG
   */

  const description =
    cleanText(
      product?.description
    ) ||
    meta(
      'meta[property="og:description"]'
    ) ||
    meta(
      'meta[name="description"]'
    );

  /*
   * PREIS
   */

  let price =
    offer?.price ??
    offer?.lowPrice ??
    meta(
      'meta[property="product:price:amount"]'
    );

  if (
    price !== undefined &&
    price !== null
  ) {
    price =
      String(price).trim();
  } else {
    price = null;
  }

  /*
   * WÄHRUNG
   */

  const currency =
    offer?.priceCurrency ||
    meta(
      'meta[property="product:price:currency"]'
    ) ||
    null;

  /*
   * BILDER AUS JSON-LD
   */

  const jsonImages =
    getImagesFromProduct(
      product,
      pageUrl
    );

  /*
   * BILDER AUS META-TAGS
   */

  const metaImages = [
    meta(
      'meta[property="og:image"]'
    ),

    meta(
      'meta[property="og:image:secure_url"]'
    ),

    meta(
      'meta[name="twitter:image"]'
    ),
  ].map(
    (image) =>
      absoluteUrl(
        image,
        pageUrl
      )
  );

  /*
 * =========================================================
 * BILDER AUS HTML-PRODUKTGALERIE
 * =========================================================
 */

const htmlImages =
  getImagesFromHtml(
    $,
    pageUrl
  );


/*
 * =========================================================
 * ALLE PRODUKTBILDER ZUSAMMENFÜHREN
 * =========================================================
 *
 * Reihenfolge:
 *
 * 1. JSON-LD
 * 2. OpenGraph / Meta
 * 3. Produktgalerie der Webseite
 *
 * Anschließend werden Duplikate entfernt
 * und maximal 5 Bilder verwendet.
 */

const images =
  cleanProductImages(
    [
      ...jsonImages,
      ...metaImages,
      ...htmlImages,
    ],
    pageUrl
  );

  /*
   * MARKE
   */

  const brand =
    cleanText(
      typeof product?.brand ===
        "string"
        ? product.brand
        : product?.brand?.name
    ) || null;

/*
 * =========================================================
 * ZUSÄTZLICHE PRODUKTDATEN
 * =========================================================
 */

/*
 * SKU / ARTIKELNUMMER
 */

const sku =
  cleanText(
    product?.sku
  ) ||
  cleanText(
    offer?.sku
  ) ||
  null;


/*
 * GTIN / EAN / UPC
 *
 * Unterstützt die üblichen Schema.org-Felder.
 */

const gtin =
  cleanText(
    product?.gtin
  ) ||
  cleanText(
    product?.gtin13
  ) ||
  cleanText(
    product?.gtin14
  ) ||
  cleanText(
    product?.gtin12
  ) ||
  cleanText(
    product?.gtin8
  ) ||
  null;


/*
 * HERSTELLERNUMMER / MPN
 */

const mpn =
  cleanText(
    product?.mpn
  ) ||
  null;


/*
 * VERFÜGBARKEIT
 *
 * Schema.org liefert häufig beispielsweise:
 * https://schema.org/InStock
 *
 * Wir speichern nur den letzten Teil:
 * InStock
 */

let availability =
  cleanText(
    offer?.availability
  ) ||
  null;

if (availability) {
  availability =
    availability
      .split("/")
      .pop() ||
    availability;
}


/*
 * PRODUKTKATEGORIE
 */

const category =
  cleanText(
    typeof product?.category === "string"
      ? product.category
      : product?.category?.name
  ) ||
  null;


/*
 * VERGLEICHSPREIS / ALTER PREIS
 *
 * Einige Shops stellen bei AggregateOffer
 * einen hohen und niedrigen Preis bereit.
 *
 * highPrice wird nur übernommen, wenn er sich
 * vom normalen Preis unterscheidet.
 */

let compareAtPrice =
  offer?.highPrice ??
  null;

if (
  compareAtPrice !== null &&
  compareAtPrice !== undefined
) {
  compareAtPrice =
    String(compareAtPrice).trim();

  if (
    price !== null &&
    compareAtPrice === price
  ) {
    compareAtPrice = null;
  }
} else {
  compareAtPrice = null;
}

  /*
   * ANBIETER / SHOPNAME
   */

  let shopName = null;

  try {
    shopName =
      meta(
        'meta[property="og:site_name"]'
      ) ||
      new URL(pageUrl)
        .hostname
        .replace(
          /^www\./,
          ""
        );
  } catch {
    shopName = null;
  }

  /*
   * ERGEBNIS
   */

return {
  title,
  description,
  price,
  currency,
  images,
  brand,
  vendor: shopName,
  sourceUrl: pageUrl,

  sku,
  gtin,
  mpn,
  availability,
  category,
  compareAtPrice,

  detectionMethod:
    product
      ? "json-ld"
      : "meta",
};
}


/*
 * =========================================================
 * API ACTION
 * =========================================================
 */

export async function action({
  request,
}) {
  const corsHeaders = {
    "Access-Control-Allow-Origin":
      "*",

    "Access-Control-Allow-Headers":
      "Authorization, Content-Type",

    "Access-Control-Allow-Methods":
      "POST, OPTIONS",
  };

  try {
    const body =
      await request.json();

    const productUrl =
      body?.url;

    if (
      !productUrl ||
      typeof productUrl !==
        "string"
    ) {
      return Response.json(
        {
          success: false,

          error:
            "Bitte geben Sie eine Produkt-URL ein.",
        },
        {
          status: 400,
          headers:
            corsHeaders,
        }
      );
    }

    /*
     * PRODUKTSEITE LADEN
     */

    const {
      html,
      finalUrl,
    } =
      await downloadHtml(
        productUrl
      );

    /*
     * PRODUKT AUSLESEN
     */

    const product =
      extractProduct(
        html,
        finalUrl
      );

/*
 * TEMPORÄRE DEBUG-AUSGABE
 * Zusätzliche Produktdaten nur im Server-Log anzeigen.
 */

console.log("SCRAPER ADDITIONAL PRODUCT DATA:", {
  sourceUrl: product.sourceUrl,
  sku: product.sku,
  gtin: product.gtin,
  mpn: product.mpn,
  availability: product.availability,
  category: product.category,
  compareAtPrice: product.compareAtPrice,
});

    if (!product.title) {
      return Response.json(
        {
          success: false,

          error:
            "Auf dieser Seite konnten keine eindeutigen Produktdaten gefunden werden.",
        },
        {
          status: 422,

          headers:
            corsHeaders,
        }
      );
    }

    /*
     * ERFOLGREICHE ANTWORT
     */

    return Response.json(
      {
        success: true,
        product,
      },
      {
        headers:
          corsHeaders,
      }
    );
  } catch (error) {
    console.error(
      "PRODUCT SCRAPE ERROR:",
      error
    );

    const message =
      error?.name ===
      "AbortError"
        ? "Die Produktseite hat nicht rechtzeitig geantwortet."
        : error instanceof Error
          ? error.message
          : "Das Produkt konnte nicht geprüft werden.";

    return Response.json(
      {
        success: false,
        error: message,
      },
      {
        status: 400,

        headers:
          corsHeaders,
      }
    );
  }
}


/*
 * =========================================================
 * GET-AUFRUF
 * =========================================================
 */

export async function loader({ request }) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  return Response.json(
    {
      success: false,
      error: "Diese Schnittstelle erwartet eine POST-Anfrage.",
    },
    {
      status: 405,
      headers: corsHeaders,
    }
  );
}
