import { keepPdfSizeTogether, normalizePdfCellText } from './pdf-cell-text.mjs';

function formatPtBrDecimal(value) {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  }).format(Number(value));
}

const LEGACY_DIMENSION_SUFFIX = /\s+[—-]\s+\d+(?:[.,]\d+)?\s*(?:m|cm)\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:m|cm)\s*-\s*\d+(?:[.,]\d+)?\s*un\s*-\s*\d+(?:[.,]\d+)?\s*m(?:²|2)\s*$/iu;
const LEGACY_LINEAR_SUFFIX = /\s+[—-]\s+\d+(?:[.,]\d+)?\s*(?:m|cm)\s*-\s*\d+(?:[.,]\d+)?\s*un\s*$/iu;

export function cleanLegacyGeneratedDescription(value) {
  const description = normalizePdfCellText(value);
  return description
    .replace(LEGACY_DIMENSION_SUFFIX, '')
    .replace(LEGACY_LINEAR_SUFFIX, '')
    .trim();
}

function normalizeStructuredSize(value) {
  const size = normalizePdfCellText(value);
  const match = /^(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*cm$/iu.exec(size);
  if (!match) return keepPdfSizeTogether(size);
  return keepPdfSizeTogether(`${formatPtBrDecimal(Number(match[1].replace(',', '.')))} × ${formatPtBrDecimal(Number(match[2].replace(',', '.')))} cm`);
}

export function formatPdfItemSizeValue(item) {
  const details = item?.details || {};
  const width = Number(details.width || 0);
  const height = Number(details.height || 0);
  if (width > 0 && height > 0) {
    return keepPdfSizeTogether(`${formatPtBrDecimal(width * 100)} × ${formatPtBrDecimal(height * 100)} cm`);
  }

  const length = Number(details.length || 0);
  if (length > 0) return keepPdfSizeTogether(`${formatPtBrDecimal(length * 100)} cm`);

  const pricingSnapshot = details.pricing_snapshot || {};
  const structuredSize = details.configuration_snapshot?.size ||
    (typeof pricingSnapshot.size === 'string' ? pricingSnapshot.size : '');
  return normalizeStructuredSize(structuredSize) || '—';
}

export function buildPdfItemViewModel(item) {
  const quantity = Math.max(0, Number(item?.quantity || 0));
  const totalPrice = Math.max(0, Number(item?.total_price || 0));
  const pricingSnapshot = item?.details?.pricing_snapshot || {};
  const structuredDescription = typeof pricingSnapshot.description === 'string'
    ? normalizePdfCellText(pricingSnapshot.description)
    : '';
  const savedDescription = cleanLegacyGeneratedDescription(item?.product_name);

  return {
    quantity,
    description: structuredDescription || savedDescription || 'Item sem descrição',
    size: formatPdfItemSizeValue(item),
    unitPrice: quantity > 0 ? totalPrice / quantity : Math.max(0, Number(item?.unit_price || 0)),
    totalPrice
  };
}
