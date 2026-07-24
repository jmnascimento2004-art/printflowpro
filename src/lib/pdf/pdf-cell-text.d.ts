export const PDF_NBSP: '\u00A0';

export function normalizePdfCellText(value: unknown): string;
export function keepPdfSizeTogether(value: unknown): string;
export function formatPdfCurrencyCell(
  value?: number | string | null,
  options?: { maximumFractionDigits?: number }
): string;
export function getPdfDescriptionFontSize(value: unknown): number;
