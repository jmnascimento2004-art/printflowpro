export const PDF_NBSP = '\u00A0';

export function normalizePdfCellText(value) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/^ +| +$/g, '');
}

export function keepPdfSizeTogether(value) {
  const normalized = normalizePdfCellText(value);
  if (!normalized || normalized === '—') return normalized || '—';
  return normalized.replace(/\s+/g, PDF_NBSP);
}

export function formatPdfCurrencyCell(value, options = {}) {
  const numeric = Number(value || 0);
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: options.maximumFractionDigits ?? 2
  }).format(Number.isFinite(numeric) ? numeric : 0);

  return normalizePdfCellText(formatted).replace(/^(-?R\$)\s*/u, `$1${PDF_NBSP}`);
}

export function getPdfDescriptionFontSize(value) {
  const text = normalizePdfCellText(value);
  const weightedLength = [...text].reduce((total, character) => {
    if (character === ' ') return total + 0.35;
    if (/[MWÁÉÍÓÚÃÕÂÊÔÇ]/u.test(character)) return total + 0.72;
    if (/[A-Z0-9]/u.test(character)) return total + 0.6;
    return total + 0.52;
  }, 0);

  if (weightedLength === 0) return 9;
  return Math.max(6.5, Math.min(9, Number((226 / weightedLength).toFixed(2))));
}
