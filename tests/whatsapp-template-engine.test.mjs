import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const engineUrl = new URL('../src/lib/whatsapp/template-engine.ts', import.meta.url);
const source = await readFile(engineUrl, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', compiled)(module.exports, module);

const {
  WHATSAPP_TEMPLATE_MAX_LENGTH,
  buildWhatsAppUrl,
  extractWhatsAppTemplateVariables,
  normalizeWhatsAppPhone,
  normalizeWhatsAppTemplateContent,
  renderConfiguredWhatsAppTemplate,
  renderWhatsAppTemplate,
  validateWhatsAppTemplate
} = module.exports;

const definition = {
  eventKey: 'test_event',
  name: 'Teste',
  description: 'Teste',
  category: 'Atendimento',
  defaultContent: 'Olá, {{cliente_nome}}!',
  allowedVariables: ['cliente_nome', 'empresa_nome'],
  sampleVariables: { cliente_nome: 'Maria', empresa_nome: 'CibelePRINT' },
  enabledByDefault: true
};

test('extracts unique variables in declaration order', () => {
  assert.deepEqual(extractWhatsAppTemplateVariables('{{cliente_nome}} {{empresa_nome}} {{cliente_nome}}'), ['cliente_nome', 'empresa_nome']);
});

test('validates known variables', () => {
  assert.equal(validateWhatsAppTemplate('Olá {{cliente_nome}}', definition).valid, true);
});

test('rejects unknown variables', () => {
  const result = validateWhatsAppTemplate('Olá {{segredo}}', definition);
  assert.equal(result.valid, false);
  assert.deepEqual(result.unknownVariables, ['segredo']);
});

test('rejects malformed, empty and oversized content', () => {
  assert.equal(validateWhatsAppTemplate('{{Cliente.Nome}}', definition).valid, false);
  assert.equal(validateWhatsAppTemplate('   ', definition).valid, false);
  assert.equal(validateWhatsAppTemplate('a'.repeat(WHATSAPP_TEMPLATE_MAX_LENGTH + 1), definition).valid, false);
});

test('renders only allowlisted variables and preserves emojis and newlines', () => {
  const rendered = renderWhatsAppTemplate('Oi {{cliente_nome}} 👋\r\n{{empresa_nome}}', definition, { cliente_nome: 'Maria', empresa_nome: 'CibelePRINT' });
  assert.equal(rendered, 'Oi Maria 👋\nCibelePRINT');
});

test('uses an empty string for absent values without evaluating code', () => {
  assert.equal(renderWhatsAppTemplate('{{cliente_nome}} {{constructor}}', definition, {}), ' {{constructor}}');
});

test('normalizes Brazilian phones and +55', () => {
  assert.equal(normalizeWhatsAppPhone('(51) 99999-9999'), '5551999999999');
  assert.equal(normalizeWhatsAppPhone('+55 51 99999-9999'), '5551999999999');
  assert.equal(normalizeWhatsAppPhone('0 51 3333-4444'), '555133334444');
});

test('rejects malformed phones and protocol injection', () => {
  assert.equal(normalizeWhatsAppPhone('123'), '');
  assert.equal(normalizeWhatsAppPhone('https://wa.me/5551999999999'), '');
  assert.equal(normalizeWhatsAppPhone('javascript:5551999999999'), '');
});

test('builds encoded wa.me URLs without query injection', () => {
  const url = buildWhatsAppUrl('(51) 99999-9999', 'Olá & total=R$ 10,00 👋');
  assert.equal(url, 'https://wa.me/5551999999999?text=Ol%C3%A1%20%26%20total%3DR%24%2010%2C00%20%F0%9F%91%8B');
});

test('builds WhatsApp Web URLs when configured', () => {
  assert.match(buildWhatsAppUrl('(51) 99999-9999', 'Olá', { country_code: '55', open_mode: 'web' }), /^https:\/\/web\.whatsapp\.com\/send\?phone=5551999999999&text=/);
});

test('normalizes CRLF and trims surrounding whitespace', () => {
  assert.equal(normalizeWhatsAppTemplateContent('  linha 1\r\nlinha 2  '), 'linha 1\nlinha 2');
});

test('applies company-name preference and signature in one configured render', () => {
  const rendered = renderConfiguredWhatsAppTemplate(
    'Olá, {{cliente_nome}}.\n{{empresa_nome}}',
    definition,
    { cliente_nome: 'Maria', empresa_nome: 'Empresa Exemplo' },
    { include_company_name: false, signature: 'Equipe comercial' }
  );
  assert.equal(rendered, 'Olá, Maria.\n\nEquipe comercial');
});
