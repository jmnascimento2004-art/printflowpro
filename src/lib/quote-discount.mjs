export function sanitizePtBrDecimalInput(rawValue, options = {}) {
  const value = String(rawValue ?? '')
    .replace(/R\$/gi, '')
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .trim();

  if (value === '') return '';
  if (value.startsWith('-') || /[^\d.,]/.test(value)) return null;

  let normalized = value;
  if (value.includes(',') && value.includes('.')) {
    if (!/^\d{1,3}(?:\.\d{3})*,\d{0,2}$/.test(value)) return null;
    normalized = value.replace(/\./g, '');
  } else {
    if ((value.match(/[.,]/g) || []).length > 1) return null;
    normalized = value.replace('.', ',');
  }

  if (!/^\d*(?:,\d{0,2})?$/.test(normalized)) return null;
  const numeric = parsePtBrDecimal(normalized);
  if (options.max !== undefined && numeric > options.max) return null;
  return normalized;
}

export function parsePtBrDecimal(value) {
  const normalized = String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizePtBrDecimalOnBlur(value, options = {}) {
  const sanitized = sanitizePtBrDecimalInput(value, options);
  const numeric = sanitized === null ? 0 : parsePtBrDecimal(sanitized);
  return numeric.toFixed(2).replace('.', ',');
}

export function calculateQuoteDiscount(grossTotal, inputValue, mode) {
  const gross = Math.max(0, Number(grossTotal) || 0);
  const value = Math.max(0, parsePtBrDecimal(inputValue));
  const discount = mode === 'percentage'
    ? gross * Math.min(100, value) / 100
    : Math.min(gross, value);
  return Math.round(discount * 100) / 100;
}

export function calculateQuoteNetTotal(grossTotal, inputValue, mode) {
  const gross = Math.max(0, Number(grossTotal) || 0);
  return Math.max(0, Math.round((gross - calculateQuoteDiscount(gross, inputValue, mode)) * 100) / 100);
}
