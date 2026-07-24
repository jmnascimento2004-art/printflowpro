import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PDF_NBSP,
  formatPdfCurrencyCell,
  getPdfDescriptionFontSize,
  keepPdfSizeTogether,
  normalizePdfCellText
} from '../src/lib/pdf/pdf-cell-text.mjs';

test('normalizes presentation-only cell text without losing commercial content', () => {
  assert.equal(normalizePdfCellText('BANNER\r\n\tPERSONALIZADO   2026'), 'BANNER PERSONALIZADO 2026');
  assert.equal(normalizePdfCellText('ADESIVO 3M'), 'ADESIVO 3M');
  assert.equal(normalizePdfCellText('PAPEL A4'), 'PAPEL A4');
  assert.equal(normalizePdfCellText(`180${PDF_NBSP}×${PDF_NBSP}120${PDF_NBSP}cm`), `180${PDF_NBSP}×${PDF_NBSP}120${PDF_NBSP}cm`);
});

test('keeps a complete size together with non-breaking spaces', () => {
  assert.equal(keepPdfSizeTogether('180 × 120\ncm'), `180${PDF_NBSP}×${PDF_NBSP}120${PDF_NBSP}cm`);
  assert.equal(keepPdfSizeTogether('7,3 × 7,3 cm'), `7,3${PDF_NBSP}×${PDF_NBSP}7,3${PDF_NBSP}cm`);
  assert.equal(keepPdfSizeTogether('10 × 5 cm'), `10${PDF_NBSP}×${PDF_NBSP}5${PDF_NBSP}cm`);
  assert.equal(keepPdfSizeTogether(''), '—');
});

test('keeps BRL symbol and value in one currency string', () => {
  const unit = formatPdfCurrencyCell(194.4);
  const total = formatPdfCurrencyCell(123456.78);

  assert.equal(unit, `R$${PDF_NBSP}194,40`);
  assert.equal(total, `R$${PDF_NBSP}123.456,78`);
  assert.equal(unit.includes('\n'), false);
  assert.equal(total.includes('\n'), false);
});

test('only compacts long description font and never truncates its text', () => {
  const shortName = 'BANNER PERSONALIZADO';
  const longName = 'CARTÃO DE VISITA COUCHÊ 250G VERNIZ TOTAL FRENTE';
  const veryLongName = 'ADESIVO VINIL IMPRESSO E RECORTADO PERSONALIZADO';

  assert.equal(normalizePdfCellText(longName), longName);
  assert.equal(normalizePdfCellText(veryLongName), veryLongName);
  assert.equal(getPdfDescriptionFontSize(shortName), 9);
  assert.ok(getPdfDescriptionFontSize(longName) >= 6.5);
  assert.ok(getPdfDescriptionFontSize(veryLongName) >= 6.5);
});
