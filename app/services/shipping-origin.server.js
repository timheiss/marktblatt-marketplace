import worldCountries from "../../extensions/anbieterinformationen/src/world-countries.json";

const CONTINENTS = {
  EUROPE: "Europa",
  ASIA: "Asien",
  AFRICA: "Afrika",
  NORTH_AMERICA: "Nordamerika",
  SOUTH_AMERICA: "Südamerika",
  OCEANIA: "Ozeanien",
};

const COUNTRY_NAMES = new Map(
  worldCountries.map(({ value, label }) => [value, label])
);

export function getShippingOriginLabel(value) {
  const code = String(value ?? "").trim();

  if (!code) return "";

  return CONTINENTS[code] ?? COUNTRY_NAMES.get(code) ?? code;
}