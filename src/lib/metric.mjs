/** Metric input has no thousands separators: both decimal comma and dot are accepted. */
export function parseMetricInput(value) {
  const text = String(value ?? '').trim();
  if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return null;
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function formatMetricNumber(value) {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8, useGrouping: false }).format(Number(value) || 0);
}
export const formatMeters = value => `${formatMetricNumber(value)} m`;
export const formatSquareMeters = value => `${formatMetricNumber(value)} m²`;
export const centimetersToMeters = value => Number(value) / 100;

/** Only unversioned product configuration used this historical mixed-unit convention.
 * Never apply it to item details or pricing inputs: those have always been meters. */
export function configuredMeters(value, unit, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  if (unit === 'm') return number;
  return number <= 20 ? number : centimetersToMeters(number);
}

/** Preserve the defaults seen in the legacy Store, without rounding saved product data. */
export function legacyStoreConfiguredMeters(value, unit, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  if (unit === 'm') return number;
  return number <= 20 ? Math.round(number * 100) / 100 : centimetersToMeters(Math.round(number));
}
