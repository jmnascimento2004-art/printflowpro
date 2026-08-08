import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', code)(module.exports, module);
  return module.exports;
}

const contract = await compile('../src/lib/whatsapp/variable-contract.ts');
const registry = await compile('../src/lib/whatsapp/template-registry.ts');

test('preserves all 21 legacy registry tokens and defines eight canonical contract tokens', () => {
  const registryTokens = new Set(registry.WHATSAPP_TEMPLATE_REGISTRY.flatMap((item) => item.allowedVariables));
  assert.equal(contract.LEGACY_WHATSAPP_TOKENS.length, 21);
  assert.equal(new Set(contract.LEGACY_WHATSAPP_TOKENS).size, 21);
  assert.equal(contract.COMPANY_CANONICAL_TOKENS.length, 8);
  for (const token of contract.LEGACY_WHATSAPP_TOKENS) assert.equal(registryTokens.has(token), true, token);
  assert.equal(registryTokens.size, 21);
  assert.equal(new Set([...contract.LEGACY_WHATSAPP_TOKENS, ...contract.COMPANY_CANONICAL_TOKENS]).size, 29);
});

test('legacy aliases are explicit, one-way and non-circular', () => {
  assert.deepEqual(contract.LEGACY_TOKEN_ALIASES, { empresa_nome: 'empresa.nome', chave_pix: 'empresa.pix_chave' });
  for (const [legacy, canonical] of Object.entries(contract.LEGACY_TOKEN_ALIASES)) {
    assert.notEqual(legacy, canonical);
    assert.equal(contract.COMPANY_CANONICAL_TOKENS.includes(canonical), true);
    assert.equal(contract.resolveCanonicalWhatsAppToken(legacy), canonical);
    assert.equal(contract.resolveCanonicalWhatsAppToken(canonical), canonical);
  }
});

test('unknown tokens are rejected and sensitive/internal keys are not registered', () => {
  for (const token of ['company_id', 'auth_user_id', 'document', 'base_cost', 'profit_margin', 'empresa.segredo']) {
    assert.equal(contract.isRegisteredWhatsAppToken(token), false, token);
  }
  assert.equal(contract.isRegisteredWhatsAppToken('empresa.nome'), true);
  assert.equal(contract.isRegisteredWhatsAppToken('empresa_nome'), true);
});

test('event allowlists expose PIX only to the payment event', () => {
  assert.equal(contract.COMPANY_TOKENS_BY_EVENT.order_payment_pending.includes('empresa.pix_chave'), true);
  for (const event of ['quote_proposal', 'production_status_changed', 'store_product_request']) {
    assert.equal(contract.COMPANY_TOKENS_BY_EVENT[event].some((token) => token.startsWith('empresa.pix_')), false, event);
  }
});

test('canonical allowlists remain concrete and are not exposed as an unrestricted wildcard', () => {
  for (const tokens of Object.values(contract.COMPANY_TOKENS_BY_EVENT)) {
    assert.equal(tokens.includes('empresa.*'), false);
    assert.equal(tokens.every((token) => contract.COMPANY_CANONICAL_TOKENS.includes(token)), true);
  }
});
