import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  formatPtBrMoneyInput,
  normalizePtBrMoneyInput,
  parsePtBrMoneyInput,
  sanitizePtBrMoneyInput
} from '../src/lib/editable-money.mjs';
import * as editableMoney from '../src/lib/editable-money.mjs';

const productsPage = await readFile(new URL('../src/app/(dashboard)/products/page.tsx', import.meta.url), 'utf8');

test('formats editable monetary values in pt-BR without changing integer quantities', () => {
  assert.equal(formatPtBrMoneyInput(35), '35,00');
  assert.equal(formatPtBrMoneyInput(35.5), '35,50');
  assert.equal(formatPtBrMoneyInput(166.67), '166,67');
  assert.equal(String(10), '10');
});

test('parses Brazilian comma and grouping separators safely', () => {
  assert.equal(parsePtBrMoneyInput('25,00'), 25);
  assert.equal(parsePtBrMoneyInput('1.234,56'), 1234.56);
  assert.equal(parsePtBrMoneyInput(' 1.234,56 '), 1234.56);
  assert.equal(parsePtBrMoneyInput('1.234,5678'), 1234.5678);
  assert.equal(parsePtBrMoneyInput('0,125'), 0.125);
});

test('treats dot-only pt-BR groups as thousands instead of decimal fractions', () => {
  assert.equal(parsePtBrMoneyInput('1.234'), 1234);
  assert.equal(parsePtBrMoneyInput('25.000'), 25000);
  assert.equal(parsePtBrMoneyInput('1.000'), 1000);
  assert.equal(parsePtBrMoneyInput('10.000'), 10000);
  assert.equal(parsePtBrMoneyInput('100.000'), 100000);
  assert.equal(parsePtBrMoneyInput('1.000.000'), 1000000);
  assert.equal(parsePtBrMoneyInput('1.000.000,50'), 1000000.5);
});

test('keeps canonical numbers separate from pt-BR user text', () => {
  for (const value of [35.5, 166.67, 0.125, 1234, 25000, 1.2345]) {
    assert.equal(parsePtBrMoneyInput(value), value);
  }
  assert.equal(parsePtBrMoneyInput('35.5'), 0);
  assert.equal(parsePtBrMoneyInput('0.125'), 0);
  assert.equal(parsePtBrMoneyInput('1.2345'), 0);
});

test('fails safely for invalid pt-BR text without producing NaN or Infinity', () => {
  for (const value of ['abc', '..', ',,', '1.2.3', '1,2,3', 'NaN', 'Infinity', '--25', 'R$ foo']) {
    const parsed = parsePtBrMoneyInput(value);
    assert.equal(parsed, 0);
    assert.equal(Number.isFinite(parsed), true);
  }
});

test('preserves zero and the existing negative-value validation contract', () => {
  assert.equal(parsePtBrMoneyInput('0'), 0);
  assert.equal(parsePtBrMoneyInput('0,00'), 0);
  assert.equal(parsePtBrMoneyInput('0,0000'), 0);
  assert.equal(parsePtBrMoneyInput('-25,00'), -25);
  assert.equal(sanitizePtBrMoneyInput('-25,00', 2), '25,00');
});

test('preserves the stored value across formatting and blur normalization', () => {
  for (const value of [35, 35.5, 166.67, 1234, 1234.56, 25000, 0.125, 1.2345]) {
    assert.equal(parsePtBrMoneyInput(formatPtBrMoneyInput(value, 4)), value);
  }
  assert.equal(parsePtBrMoneyInput(formatPtBrMoneyInput(0.067, 4)), 0.067);
});

test('sanitizes an editable value while preserving a Brazilian decimal comma', () => {
  assert.equal(sanitizePtBrMoneyInput('R$ 1.234,56', 2), '1234,56');
  assert.equal(sanitizePtBrMoneyInput('25,0099', 2), '25,00');
  assert.equal(sanitizePtBrMoneyInput('1.234', 2), '1.234');
  assert.equal(sanitizePtBrMoneyInput('25.000', 2), '25.000');
  assert.equal(sanitizePtBrMoneyInput('35.5', 4), '');
  assert.equal(normalizePtBrMoneyInput('1.234', 2), '1.234,00');
  assert.equal(normalizePtBrMoneyInput('0,125', 4), '0,125');
});

test('formats canonical numbers without reparsing them as pt-BR text', () => {
  assert.equal(formatPtBrMoneyInput(1234), '1.234,00');
  assert.equal(formatPtBrMoneyInput(25000), '25.000,00');
  assert.equal(formatPtBrMoneyInput(0.125, 4), '0,125');
  assert.equal(formatPtBrMoneyInput(1.2345, 4), '1,2345');
});

test('product editor keeps quantities and production time outside money formatting', () => {
  assert.match(productsPage, /value=\{tierDraft\.quantity\}/);
  assert.match(productsPage, /value=\{tierDraft\.productionTime\}/);
  assert.doesNotMatch(productsPage, /formatPtBrMoneyInput\(tierDraft\.quantity/);
  assert.doesNotMatch(productsPage, /formatPtBrMoneyInput\(tierDraft\.productionTime/);
});

test('matrix edit fields use normal weight and normalize money only on blur', () => {
  assert.match(productsPage, /normalizeMatrixEditTierMoney\(tierIndex, 'unitPrice'\)/);
  assert.match(productsPage, /normalizeMatrixEditTierMoney\(tierIndex, 'totalPrice'\)/);
  assert.match(productsPage, /value=\{tierDraft\.unitPrice\}[\s\S]*?font-normal/);
  assert.match(productsPage, /value=\{tierDraft\.productionTime\}[\s\S]*?font-normal/);
});

test('product money inputs use the strict pt-BR parser while quantities remain unchanged', () => {
  assert.doesNotMatch(productsPage, /parseUnitCurrencyInputToNumber/);
  assert.match(productsPage, /const tempUnitPriceDraft = parsePtBrMoneyDraft\(tempUnitPriceInput, 4\)/);
  assert.match(productsPage, /const matrixUnitPriceDraft = parsePtBrMoneyDraft\(matrixUnitPriceInput, 4\)/);
  assert.match(productsPage, /serializePtBrMoneyTierDrafts\(matrixEditDraft\.tiers\)/);
  assert.match(productsPage, /disabled=\{hasInvalidMoneyDraft\}/);
  assert.match(productsPage, /if \(hasInvalidMoneyDraft\) return;/);
  assert.match(productsPage, /aria-invalid=\{Boolean\(matrixEditErrors\.get\(tierDraft\.draftId\)\?\.unitPrice\)\}/);
  assert.match(productsPage, /disabled=\{!matrixEditSerialization\?\.saveAllowed\}/);
  assert.match(productsPage, /setBaseCostInput\(value\)/);
  assert.match(productsPage, /setSalesPriceInput\(value\)/);
  assert.match(productsPage, /value=\{tierDraft\.quantity\}/);
});

const originalMatrixTierDraft = {
  draftId: 'tier-10',
  quantity: '10',
  unitPrice: '25,00',
  totalPrice: '250,00',
  productionTime: '3 dias úteis',
  unitPriceValid: true,
  totalPriceValid: true
};

test('invalid matrix money is explicit, preserves the tier, and blocks save', () => {
  assert.equal(typeof editableMoney.parsePtBrMoneyDraft, 'function');
  assert.equal(typeof editableMoney.serializePtBrMoneyTierDrafts, 'function');

  const invalidDraft = { ...originalMatrixTierDraft, unitPrice: 'abc', unitPriceValid: false };
  const result = editableMoney.serializePtBrMoneyTierDrafts([invalidDraft]);

  assert.equal(editableMoney.parsePtBrMoneyDraft('abc', 4).valid, false);
  assert.equal(result.saveAllowed, false);
  assert.equal(result.serializationAllowed, false);
  assert.equal(result.tiers, null);
  assert.deepEqual(result.drafts, [invalidDraft]);
});

test('invalid matrix money never produces a mutilated serialized payload', () => {
  const invalidDraft = { ...originalMatrixTierDraft, totalPrice: 'abc', totalPriceValid: false };
  const result = editableMoney.serializePtBrMoneyTierDrafts([invalidDraft]);

  assert.equal(result.valid, false);
  assert.equal(result.silentTierDrop, false);
  assert.equal(result.tiers, null);
  assert.equal(result.drafts.length, 1);
});

test('correcting invalid money to 25,00 restores a valid serializable tier', () => {
  const invalid = editableMoney.parsePtBrMoneyDraft('abc', 4);
  const corrected = editableMoney.parsePtBrMoneyDraft('25,00', 4);
  const result = editableMoney.serializePtBrMoneyTierDrafts([originalMatrixTierDraft]);

  assert.equal(invalid.valid, false);
  assert.deepEqual({ valid: corrected.valid, value: corrected.value }, { valid: true, value: 25 });
  assert.equal(result.saveAllowed, true);
  assert.equal(result.serializationAllowed, true);
  assert.deepEqual(result.tiers, [{ quantity: 10, unit_price: 25, total_price: 250, production_time: '3 dias úteis' }]);
});

test('intentional zero is valid numeric input but remains subject to tier business rules', () => {
  for (const input of ['0', '0,00', '0,0000']) {
    assert.deepEqual(
      { valid: editableMoney.parsePtBrMoneyDraft(input, 4).valid, value: editableMoney.parsePtBrMoneyDraft(input, 4).value },
      { valid: true, value: 0 }
    );
  }

  const zeroTier = editableMoney.serializePtBrMoneyTierDrafts([
    { ...originalMatrixTierDraft, unitPrice: '0', totalPrice: '0' }
  ]);
  assert.equal(zeroTier.valid, false);
  assert.equal(zeroTier.errors[0].unitPrice, 'Informe um valor maior que zero.');
});

test('corrected pt-BR thousands and four-decimal values remain valid drafts', () => {
  for (const [input, expected] of [['1.234', 1234], ['25.000', 25000], ['1.234,56', 1234.56], ['0,125', 0.125], ['1,2345', 1.2345]]) {
    const parsed = editableMoney.parsePtBrMoneyDraft(input, 4);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.value, expected);
  }
});

test('all required invalid texts block serialization and preserve the draft', () => {
  for (const input of ['abc', '..', ',,', '1.2.3', '1,2,3', 'NaN', 'Infinity', '--25', 'R$ foo']) {
    const draft = { ...originalMatrixTierDraft, unitPrice: input, unitPriceValid: false };
    const result = editableMoney.serializePtBrMoneyTierDrafts([draft]);
    assert.equal(editableMoney.parsePtBrMoneyDraft(input, 4).valid, false, input);
    assert.equal(result.saveAllowed, false, input);
    assert.equal(result.serializationAllowed, false, input);
    assert.equal(result.drafts[0].unitPrice, input, input);
    assert.equal(result.silentTierDrop, false, input);
  }
});

test('an empty required unit price blocks save while an auto-derived total may be empty', () => {
  const missingUnit = editableMoney.serializePtBrMoneyTierDrafts([
    { ...originalMatrixTierDraft, unitPrice: '', totalPrice: '' }
  ]);
  const derivedTotal = editableMoney.serializePtBrMoneyTierDrafts([
    { ...originalMatrixTierDraft, totalPrice: '', totalPriceValid: true }
  ]);

  assert.equal(missingUnit.saveAllowed, false);
  assert.equal(derivedTotal.saveAllowed, true);
  assert.equal(derivedTotal.tiers[0].total_price, 250);
});

test('cancelling an invalid edit leaves the original persisted tier untouched', () => {
  const persistedTier = { quantity: 10, unit_price: 25, total_price: 250, production_time: '3 dias úteis' };
  const before = structuredClone(persistedTier);
  const invalidDraft = { ...originalMatrixTierDraft, unitPrice: 'abc', unitPriceValid: false };

  editableMoney.serializePtBrMoneyTierDrafts([invalidDraft]);
  assert.deepEqual(persistedTier, before);
});

test('one invalid tier blocks the whole matrix serialization without removing siblings', () => {
  const secondTier = {
    ...originalMatrixTierDraft,
    draftId: 'tier-20',
    quantity: '20',
    unitPrice: '20,00',
    totalPrice: '400,00'
  };
  const firstInvalid = { ...originalMatrixTierDraft, unitPrice: 'abc', unitPriceValid: false };
  const result = editableMoney.serializePtBrMoneyTierDrafts([firstInvalid, secondTier]);

  assert.equal(result.serializationAllowed, false);
  assert.equal(result.tiers, null);
  assert.equal(result.drafts.length, 2);
  assert.equal(result.drafts[1].draftId, 'tier-20');
});

test('draft validation is pure and performs no write before a valid submit', () => {
  let writes = 0;
  const draft = { ...originalMatrixTierDraft, unitPrice: 'abc', unitPriceValid: false };
  const result = editableMoney.serializePtBrMoneyTierDrafts([draft]);
  if (result.serializationAllowed) writes += 1;

  assert.equal(writes, 0);
  assert.equal(result.drafts[0].quantity, '10');
});
