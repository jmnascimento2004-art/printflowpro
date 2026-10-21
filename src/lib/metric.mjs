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

/** Upgrade a configuration only on explicit dimension edits. Untouched fields retain
 * their previous effective Store measurement, including the legacy rounding rule. */
export function metricConfigurationForSave(original, draft, changedFields) {
  const keys = ['min_width', 'min_height', 'max_width', 'max_height', 'min_length'];
  if (original && changedFields.length === 0) {
    return { dimension_unit: original.dimension_unit, ...Object.fromEntries(keys.map(key => [key, original[key]])) };
  }
  return {
    dimension_unit: /** @type {'m'} */ ('m'),
    ...Object.fromEntries(keys.map(key => [key,
      original && !changedFields.includes(key)
        ? (legacyStoreConfiguredMeters(original[key], original.dimension_unit, 0) || undefined)
        : (draft[key] || undefined)
    ]))
  };
}
