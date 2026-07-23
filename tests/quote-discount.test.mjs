import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateQuoteDiscount,
  calculateQuoteNetTotal,
  normalizePtBrDecimalOnBlur,
  parsePtBrDecimal,
  sanitizePtBrDecimalInput
} from '../src/lib/quote-discount.mjs';

for (const [input, expected] of [
  ['', 0], ['2', 2], ['2,', 2], ['2,5', 2.5], ['2,50', 2.5],
  ['0,50', 0.5], ['1250,75', 1250.75], ['1.250,75', 1250.75], ['1250.75', 1250.75]
]) {
  test(`parses ${JSON.stringify(input)} as ${expected}`, () => {
    assert.equal(parsePtBrDecimal(input), expected);
  });
}

test('preserves natural typing, backspace and paste', () => {
  assert.equal(sanitizePtBrDecimalInput('2'), '2');
  assert.equal(sanitizePtBrDecimalInput('2,5'), '2,5');
  assert.equal(sanitizePtBrDecimalInput('2,50'), '2,50');
  assert.equal(sanitizePtBrDecimalInput(''), '');
  assert.equal(sanitizePtBrDecimalInput('1.250,75'), '1250,75');
  assert.equal(sanitizePtBrDecimalInput('2,,5'), null);
  assert.equal(sanitizePtBrDecimalInput('-1'), null);
  assert.equal(sanitizePtBrDecimalInput('2,555'), null);
});

test('normalizes only on blur', () => {
  assert.equal(normalizePtBrDecimalOnBlur('2'), '2,00');
  assert.equal(normalizePtBrDecimalOnBlur('2,5'), '2,50');
  assert.equal(normalizePtBrDecimalOnBlur('0,5'), '0,50');
  assert.equal(normalizePtBrDecimalOnBlur(''), '0,00');
});

test('validates percentage and reinterprets the same text between modes', () => {
  assert.equal(sanitizePtBrDecimalInput('100', { max: 100 }), '100');
  assert.equal(sanitizePtBrDecimalInput('100,01', { max: 100 }), null);
  assert.equal(calculateQuoteDiscount(200, '2,50', 'fixed'), 2.5);
  assert.equal(calculateQuoteDiscount(200, '2,50', 'percentage'), 5);
});

test('caps discounts at the gross total and calculates the net total', () => {
  assert.equal(calculateQuoteDiscount(100, '100', 'fixed'), 100);
  assert.equal(calculateQuoteDiscount(100, '150', 'fixed'), 100);
  assert.equal(calculateQuoteNetTotal(100, '150', 'fixed'), 0);
  assert.equal(calculateQuoteNetTotal(100, '12,5', 'percentage'), 87.5);
});
