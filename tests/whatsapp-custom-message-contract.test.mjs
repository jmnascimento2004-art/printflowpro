import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('require', 'exports', 'module', output)((specifier) => requireMap[specifier] || {}, module.exports, module);
  return module.exports;
}

const engine = await compile('../src/lib/whatsapp/template-engine.ts');
const contract = await compile('../src/lib/whatsapp/custom-message-contract.ts', { './template-engine': engine });

test('custom contexts and variable allowlists match the approved plan exactly', () => {
  assert.deepEqual(contract.WHATSAPP_CUSTOM_MESSAGE_CONTEXTS, ['generic', 'customer']);
  assert.deepEqual(contract.WHATSAPP_CUSTOM_VARIABLES_BY_CONTEXT.generic, [
    'empresa.nome', 'empresa.whatsapp', 'empresa.telefone', 'empresa.email'
  ]);
  assert.deepEqual(contract.WHATSAPP_CUSTOM_VARIABLES_BY_CONTEXT.customer, [
    'empresa.nome', 'empresa.whatsapp', 'empresa.telefone', 'empresa.email',
    'cliente.nome', 'cliente.nome_fantasia', 'cliente.whatsapp', 'cliente.email'
  ]);
});

test('custom validation normalizes outer whitespace and accepts approved placeholders', () => {
  const result = contract.validateWhatsAppCustomMessage({
    name: '  Boas-vindas  ',
    content: '  Olá {{cliente.nome}}, somos a {{empresa.nome}}.  ',
    contextType: 'customer'
  });
  assert.equal(result.valid, true);
  assert.equal(result.normalizedName, 'Boas-vindas');
  assert.equal(result.normalizedContent, 'Olá {{cliente.nome}}, somos a {{empresa.nome}}.');
});

test('generic context rejects customer variables and every unapproved context', () => {
  const unknown = contract.validateWhatsAppCustomMessage({
    name: 'Contato', content: 'Olá {{cliente.nome}}', contextType: 'generic'
  });
  assert.equal(unknown.valid, false);
  assert.deepEqual(unknown.unknownVariables, ['cliente.nome']);
  assert.match(unknown.errors.join(' '), /não permitidas/i);

  for (const contextType of ['order', 'quote', 'product', 'payment', '']) {
    const invalid = contract.validateWhatsAppCustomMessage({ name: 'Contato', content: 'Olá', contextType });
    assert.equal(invalid.valid, false);
    assert.match(invalid.errors.join(' '), /contexto.*inválido/i);
  }
});

test('unknown, malformed and unbalanced placeholders are never accepted silently', () => {
  for (const content of ['Olá {{empresa.segredo}}', 'Olá {{Empresa.nome}}', 'Olá {{empresa.nome', 'Olá empresa.nome}}', 'Olá {{sql(*)}}']) {
    const result = contract.validateWhatsAppCustomMessage({ name: 'Contato', content, contextType: 'generic' });
    assert.equal(result.valid, false, content);
    assert.ok(result.errors.length > 0, content);
  }
});

test('name and content boundaries reject empty and oversized values', () => {
  const empty = contract.validateWhatsAppCustomMessage({ name: '   ', content: '   ', contextType: 'generic' });
  assert.equal(empty.valid, false);
  assert.match(empty.errors.join(' '), /nome.*vazio/i);
  assert.match(empty.errors.join(' '), /mensagem.*vazia/i);

  const oversized = contract.validateWhatsAppCustomMessage({
    name: 'x'.repeat(121), content: 'x'.repeat(4001), contextType: 'generic'
  });
  assert.equal(oversized.valid, false);
  assert.match(oversized.errors.join(' '), /120/);
  assert.match(oversized.errors.join(' '), /4000/);
});

test('custom TypeScript contracts structurally forbid official event keys and v1 omitted fields', async () => {
  const source = await readFile(new URL('../src/lib/whatsapp/types.ts', import.meta.url), 'utf8');
  const custom = source.match(/export interface WhatsAppCustomMessage \{[\s\S]+?\n\}/)?.[0] || '';
  const row = source.match(/export interface WhatsAppCustomMessageRow \{[\s\S]+?\n\}/)?.[0] || '';
  for (const contractSource of [custom, row]) {
    assert.match(contractSource, /eventKey\?: never/);
    assert.match(contractSource, /event_key\?: never/);
    assert.doesNotMatch(contractSource, /\bactive\b|is_active|created_by|updated_by/);
  }
  assert.match(custom, /kind: 'custom'/);
  assert.match(custom, /contextType: WhatsAppCustomMessageContext/);
  assert.match(row, /context_type: WhatsAppCustomMessageContext/);
});

test('runtime validation rejects both system event key spellings instead of ignoring them', () => {
  for (const forbidden of [{ eventKey: 'quote_proposal' }, { event_key: 'quote_proposal' }]) {
    const result = contract.validateWhatsAppCustomMessage({
      name: 'Proposta',
      content: 'Olá',
      contextType: 'generic',
      ...forbidden
    });
    assert.equal(result.valid, false);
    assert.match(result.errors.join(' '), /eventos do sistema/i);
  }
});
