import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPdfItemViewModel, cleanLegacyGeneratedDescription } from '../src/lib/pdf/pdf-item-view-model.mjs';

const NBSP = '\u00A0';

test('separates legacy description, quantity and size', () => {
  const result = buildPdfItemViewModel({
    product_name: 'RÓTULO TEMPERO ALHO FRITO — 0.07m x 0.07m - 150 un - 0.80 m²',
    quantity: 150,
    unit_price: 1,
    total_price: 150,
    details: { width: 0.073, height: 0.073 }
  });

  assert.deepEqual(result, {
    quantity: 150,
    description: 'RÓTULO TEMPERO ALHO FRITO',
    size: `7,3${NBSP}×${NBSP}7,3${NBSP}cm`,
    unitPrice: 1,
    totalPrice: 150
  });
});

test('prefers the structured manual snapshot description', () => {
  const result = buildPdfItemViewModel({
    product_name: 'Texto legado — 7.3cm x 7.3cm - 150 un - 0.80 m²',
    quantity: 150,
    unit_price: 2,
    total_price: 300,
    details: { pricing_snapshot: { description: 'RÓTULO TEMPERO ALHO FRITO' } }
  });
  assert.equal(result.description, 'RÓTULO TEMPERO ALHO FRITO');
});

test('does not remove meaningful numbers from commercial names', () => {
  for (const name of ['ADESIVO 3M', 'PAPEL A4', 'CARTÃO 4X4 CORES', 'BANNER 100 ANOS', 'PRODUTO MODELO 2026', 'RÓTULO Nº 10']) {
    assert.equal(cleanLegacyGeneratedDescription(name), name);
  }
});

test('uses line total divided by quantity for UNIT', () => {
  const result = buildPdfItemViewModel({ product_name: 'PAPEL A4', quantity: 4, unit_price: 999, total_price: 50 });
  assert.equal(result.unitPrice, 12.5);
  assert.equal(result.size, '—');
});

test('keeps supported sizes in one non-breaking string', () => {
  const fixtures = [
    [{ width: 1.8, height: 1.2 }, `180${NBSP}×${NBSP}120${NBSP}cm`],
    [{ width: 0.073, height: 0.073 }, `7,3${NBSP}×${NBSP}7,3${NBSP}cm`],
    [{ width: 0.1, height: 0.05 }, `10${NBSP}×${NBSP}5${NBSP}cm`],
    [{ width: 1, height: 1 }, `100${NBSP}×${NBSP}100${NBSP}cm`],
    [{ width: 10, height: 5 }, `1.000${NBSP}×${NBSP}500${NBSP}cm`]
  ];

  for (const [details, expected] of fixtures) {
    const result = buildPdfItemViewModel({ product_name: 'Produto', quantity: 1, total_price: 1, details });
    assert.equal(result.size, expected);
    assert.equal(result.size.includes('\n'), false);
  }
});

test('normalizes a structured size and uses an em dash when size is absent', () => {
  const structured = buildPdfItemViewModel({
    product_name: 'Produto',
    quantity: 1,
    total_price: 1,
    details: { configuration_snapshot: { size: '180 × 120\ncm' } }
  });
  const absent = buildPdfItemViewModel({ product_name: 'Produto', quantity: 1, total_price: 1 });

  assert.equal(structured.size, `180${NBSP}×${NBSP}120${NBSP}cm`);
  assert.equal(absent.size, '—');
});
