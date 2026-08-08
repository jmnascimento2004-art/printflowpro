import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, requireMap = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in requireMap) return requireMap[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

const contract = await compile('../src/lib/whatsapp/variable-contract.ts');
const engine = await compile('../src/lib/whatsapp/template-engine.ts', { './variable-contract': contract });
const resolver = await compile('../src/lib/whatsapp/variable-resolver.server.ts', {
  './variable-contract': contract,
  './template-engine': engine,
  '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => { throw new Error('not used'); } }
});

const companyA = { id: 'company-a', name: 'Empresa A', phone: '1133334444', email: 'a@example.com' };
const settingsA = { company_id: 'company-a', catalog_whatsapp: '11999998888', pix_key: 'pix-real@example.com', pix_key_type: 'email', pix_beneficiary_name: 'Empresa A', bank_name: 'Banco A' };
const whatsappA = { company_id: 'company-a', country_code: '55', business_phone: null };

function dataSource({ company = companyA, settings = settingsA, whatsapp = whatsappA } = {}) {
  const counts = { company: 0, settings: 0, whatsappSettings: 0 };
  return { counts, source: {
    async getCompany() { counts.company += 1; return company; },
    async getSettings() { counts.settings += 1; return settings; },
    async getWhatsAppSettings() { counts.whatsappSettings += 1; return whatsapp; }
  } };
}

const context = (overrides = {}) => ({ companyId: 'company-a', trustedCompanyId: 'company-a', eventKey: 'order_payment_pending', ...overrides });

function recordingSupabase(rows = {}) {
  const selections = [];
  const fixtures = {
    companies: companyA,
    settings: settingsA,
    whatsapp_settings: whatsappA,
    ...rows
  };
  return {
    selections,
    client: {
      from(table) {
        return {
          select(columns) {
            selections.push({ table, columns });
            const builder = {
              eq() { return builder; },
              async maybeSingle() {
                const row = fixtures[table];
                if (!row) return { data: null, error: null };
                const projected = Object.fromEntries(columns.split(',').map((column) => [column, row[column]]));
                return { data: projected, error: null };
              }
            };
            return builder;
          }
        };
      }
    }
  };
}

async function resolveWithRecordedProjection(eventKey, rows) {
  const mock = recordingSupabase(rows);
  const source = resolver.createSupabaseWhatsAppVariableDataSource(mock.client);
  const result = await resolver.resolveWhatsAppCompanyVariables(context({ eventKey }), source);
  return { result, settingsProjection: mock.selections.find((entry) => entry.table === 'settings')?.columns };
}

test('resolves real company and PIX with aliases and no sensitive keys', async () => {
  const result = await resolver.resolveWhatsAppCompanyVariables(context(), dataSource().source);
  assert.equal(result.variables['empresa.nome'], 'Empresa A');
  assert.equal(result.variables.empresa_nome, 'Empresa A');
  assert.equal(result.variables['empresa.whatsapp'], '11999998888');
  assert.equal(result.variables['empresa.pix_chave'], 'pix-real@example.com');
  assert.equal(result.variables.chave_pix, 'pix-real@example.com');
  assert.deepEqual(result.missing, []);
  for (const key of ['company_id', 'auth_user_id', 'document', 'base_cost']) assert.equal(key in result.variables, false);
});

test('missing PIX and settings never use samples or invented fallbacks', async () => {
  const noPix = dataSource({ settings: { ...settingsA, pix_key: '', pix_key_type: null, pix_beneficiary_name: null, bank_name: null } });
  const result = await resolver.resolveWhatsAppCompanyVariables(context(), noPix.source);
  assert.equal('empresa.pix_chave' in result.variables, false);
  assert.equal('chave_pix' in result.variables, false);
  assert.equal(result.missing.includes('empresa.pix_chave'), true);
  assert.doesNotMatch(JSON.stringify(result), /financeiro@empresa|Sua Empresa|PrintFlowPRO|CibelePRINT/);
  const absent = await resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ settings: null, whatsapp: null }).source);
  assert.equal(absent.metadataSanitized.effectiveBusinessPhone, '');
  assert.equal(absent.metadataSanitized.businessPhoneSource, 'missing');
});

test('business phone override wins and catalog WhatsApp is the default', async () => {
  const overridden = await resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ whatsapp: { ...whatsappA, business_phone: '21988887777' } }).source);
  assert.equal(overridden.metadataSanitized.effectiveBusinessPhone, '5521988887777');
  assert.equal(overridden.metadataSanitized.businessPhoneSource, 'business_phone');
  const fallback = await resolver.resolveWhatsAppCompanyVariables(context(), dataSource().source);
  assert.equal(fallback.metadataSanitized.effectiveBusinessPhone, '5511999998888');
  assert.equal(fallback.metadataSanitized.businessPhoneSource, 'catalog_whatsapp');

  const invalidOverride = await resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ whatsapp: { ...whatsappA, business_phone: '123' } }).source);
  assert.equal(invalidOverride.metadataSanitized.effectiveBusinessPhone, '5511999998888');
  assert.equal(invalidOverride.metadataSanitized.businessPhoneSource, 'catalog_whatsapp');
});

test('quote projection requests only common settings fields and never PIX', async () => {
  const { result, settingsProjection } = await resolveWithRecordedProjection('quote_proposal');
  assert.equal(settingsProjection, 'company_id,catalog_whatsapp');
  assert.equal(Object.keys(result.variables).some((key) => key.includes('pix')), false);
});

test('production projection requests only common settings fields and never PIX', async () => {
  const { result, settingsProjection } = await resolveWithRecordedProjection('production_status_changed');
  assert.equal(settingsProjection, 'company_id,catalog_whatsapp');
  assert.equal(Object.keys(result.variables).some((key) => key.includes('pix')), false);
});

test('payment projection requests the four official PIX fields and resolves their values', async () => {
  const { result, settingsProjection } = await resolveWithRecordedProjection('order_payment_pending');
  assert.equal(settingsProjection, 'company_id,catalog_whatsapp,pix_key,pix_key_type,pix_beneficiary_name,bank_name');
  assert.equal(result.variables['empresa.pix_chave'], settingsA.pix_key);
  assert.equal(result.variables['empresa.pix_tipo'], settingsA.pix_key_type);
  assert.equal(result.variables['empresa.pix_titular'], settingsA.pix_beneficiary_name);
  assert.equal(result.variables['empresa.banco'], settingsA.bank_name);
});

test('company not found and tenant mismatches fail closed', async () => {
  await assert.rejects(resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ company: null }).source), /COMPANY_NOT_FOUND/);
  const preQuery = dataSource();
  await assert.rejects(resolver.resolveWhatsAppCompanyVariables(context({ trustedCompanyId: 'company-b' }), preQuery.source), /TENANT_MISMATCH/);
  assert.deepEqual(preQuery.counts, { company: 0, settings: 0, whatsappSettings: 0 });
  await assert.rejects(resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ company: { ...companyA, id: 'company-b' } }).source), /TENANT_MISMATCH/);
  await assert.rejects(resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ settings: { ...settingsA, company_id: 'company-b' } }).source), /TENANT_MISMATCH/);
  await assert.rejects(resolver.resolveWhatsAppCompanyVariables(context(), dataSource({ whatsapp: { ...whatsappA, company_id: 'company-b' } }).source), /TENANT_MISMATCH/);
});

test('two tenants stay isolated and Store receives no PIX variables', async () => {
  const companyB = { id: 'company-b', name: 'Empresa B', phone: null, email: null };
  const settingsB = { ...settingsA, company_id: 'company-b', catalog_whatsapp: '21977776666', pix_key: 'b@example.com' };
  const resultA = await resolver.resolveWhatsAppCompanyVariables(context(), dataSource().source);
  const resultB = await resolver.resolveWhatsAppCompanyVariables(
    context({ companyId: 'company-b', trustedCompanyId: 'company-b', eventKey: 'store_product_request' }),
    dataSource({ company: companyB, settings: settingsB, whatsapp: { ...whatsappA, company_id: 'company-b' } }).source
  );
  assert.equal(resultA.variables['empresa.nome'], 'Empresa A');
  assert.equal(resultB.variables['empresa.nome'], 'Empresa B');
  assert.equal(Object.keys(resultB.variables).some((key) => key.includes('pix')), false);
});

test('one resolution performs at most one query per source and none per token', async () => {
  const mock = dataSource();
  const result = await resolver.resolveWhatsAppCompanyVariables(context(), mock.source);
  assert.deepEqual(mock.counts, { company: 1, settings: 1, whatsappSettings: 1 });
  assert.deepEqual(result.metadataSanitized.queryCounts, { company: 1, settings: 1, whatsappSettings: 1 });
  const preloaded = await resolver.resolveWhatsAppCompanyVariables(context({ existingCompany: companyA, existingSettings: settingsA, existingWhatsAppSettings: whatsappA }), mock.source);
  assert.deepEqual(preloaded.metadataSanitized.queryCounts, { company: 0, settings: 0, whatsappSettings: 0 });
  assert.deepEqual(mock.counts, { company: 1, settings: 1, whatsappSettings: 1 });
});
