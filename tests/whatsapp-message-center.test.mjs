import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('registry contains only the four audited real message events', async () => {
  const registry = await read('../src/lib/whatsapp/template-registry.ts');
  for (const key of ['quote_proposal', 'order_payment_pending', 'production_status_changed', 'store_product_request']) {
    assert.match(registry, new RegExp(`eventKey: '${key}'`));
  }
  assert.equal((registry.match(/^\s+eventKey:/gm) || []).length, 4);
  assert.equal((registry.match(/^\s+kind: 'system'/gm) || []).length, 4);
  assert.doesNotMatch(registry, /kind: 'custom'/);
});

test('service loads templates in one query and settings in one parallel query', async () => {
  const service = await read('../src/lib/whatsapp/service.ts');
  assert.match(service, /Promise\.all\(\[/);
  assert.match(service, /from\('whatsapp_message_templates'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.match(service, /from\('whatsapp_settings'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.doesNotMatch(service, /forEach[\s\S]{0,200}from\('whatsapp_message_templates'\)/);
});

test('service falls back to code defaults and supports inactive tenant overrides', async () => {
  const [service, model] = await Promise.all([
    read('../src/lib/whatsapp/service.ts'),
    read('../src/lib/whatsapp/message-model.ts')
  ]);
  assert.match(model, /override\?\.content \|\| definition\.defaultContent/);
  assert.match(model, /active: override \? override\.active : definition\.enabledByDefault/);
  assert.match(service, /usedFallback = true/);
});

test('admin page includes permissions-safe route UI, tabs, editor, chips and preview', async () => {
  const [page, workspace, sidebar, context] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/system-message-workspace.tsx'),
    read('../src/components/dashboard/sidebar.tsx'),
    read('../src/context/database-context.tsx')
  ]);
  assert.match(sidebar, /name: 'WhatsApp', path: '\/whatsapp'/);
  assert.match(context, /'\/whatsapp': \['admin', 'gerente'\]/);
  assert.match(page, /Mensagens do Sistema/);
  assert.match(page, /Configurações/);
  assert.match(page, /SystemMessageList/);
  assert.match(page, /MessageEditor/);
  assert.match(page, /MessagePreview/);
  assert.match(workspace, /Mensagens do Sistema/);
  assert.match(workspace, /textarea/);
  assert.match(page, /insertVariable/);
  assert.match(workspace, /Pré-visualização/);
  assert.match(workspace, /Testar mensagem/);
  assert.match(page, /WHATSAPP_TEMPLATE_MAX_LENGTH/);
  assert.match(page, /xl:grid-cols-\[270px_minmax\(0,1fr\)_320px\]/);
});

test('WhatsApp editor exposes 44px touch targets for variable chips and preview copy', async () => {
  const [page, workspace] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/system-message-workspace.tsx')
  ]);
  assert.match(workspace, /onInsertVariable\(variable\)[\s\S]{0,180}className="[^"]*min-h-11[^"]*focus-visible:ring-2/);
  assert.match(workspace, /aria-label="Copiar pré-visualização"[\s\S]{0,180}className="[^"]*min-h-11/);
  assert.doesNotMatch(workspace, /onInsertVariable\(variable\)[\s\S]{0,180}min-h-9/);
  assert.match(page, /navigator\.clipboard\.writeText\(preview\)/);
  assert.match(workspace, /type="button" onClick=\{\(\) => onInsertVariable\(variable\)\}/);
  assert.match(workspace, /flex flex-wrap gap-2/);
});

test('system and custom message contracts are structurally separated', async () => {
  const source = await read('../src/lib/whatsapp/types.ts');
  const sourceFile = ts.createSourceFile('types.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const interfaces = new Map(sourceFile.statements
    .filter(ts.isInterfaceDeclaration)
    .map((declaration) => [declaration.name.text, declaration]));
  const system = interfaces.get('WhatsAppSystemMessageDefinition');
  const custom = interfaces.get('WhatsAppCustomMessage');
  assert.ok(system);
  assert.ok(custom);
  assert.match(system.getText(sourceFile), /kind:\s*'system'/);
  assert.match(custom.getText(sourceFile), /kind:\s*'custom'/);
  assert.match(custom.getText(sourceFile), /eventKey\?:\s*never/);
  assert.match(custom.getText(sourceFile), /event_key\?:\s*never/);
  assert.doesNotMatch(custom.getText(sourceFile), /company_id/);
});

test('system message model preserves registry fallback and tenant overrides', async () => {
  const source = await read('../src/lib/whatsapp/message-model.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  Function('exports', 'module', output)(module.exports, module);
  const definition = {
    kind: 'system',
    eventKey: 'quote_proposal',
    name: 'Proposta',
    description: 'Descrição',
    category: 'Orçamentos',
    defaultContent: 'conteúdo padrão',
    allowedVariables: [],
    sampleVariables: {},
    enabledByDefault: true
  };
  const fallback = module.exports.resolveWhatsAppSystemMessage(definition);
  assert.equal(fallback.kind, 'system');
  assert.equal(fallback.content, 'conteúdo padrão');
  assert.equal(fallback.active, true);
  assert.equal(fallback.customized, false);
  assert.equal(fallback.override, null);

  const override = { event_key: 'quote_proposal', content: 'conteúdo do tenant', active: false };
  const customized = module.exports.resolveWhatsAppSystemMessage(definition, override);
  assert.equal(customized.content, 'conteúdo do tenant');
  assert.equal(customized.active, false);
  assert.equal(customized.customized, true);
  assert.equal(customized.override, override);
});

test('restore default deletes only the system override and never inserts a default row', async () => {
  const service = await read('../src/lib/whatsapp/service.ts');
  const restore = service.match(/export async function restoreWhatsAppTemplate[\s\S]+?(?=\nexport async function)/)?.[0] || '';
  assert.match(restore, /from\('whatsapp_message_templates'\)\.delete\(\)/);
  assert.match(restore, /\.eq\('company_id', companyId\)\.eq\('event_key', eventKey\)/);
  assert.doesNotMatch(restore, /insert|upsert/);
});

test('phase 4B contains no custom CRUD, custom persistence or payment confirmation', async () => {
  const sources = await Promise.all([
    read('../src/lib/whatsapp/types.ts'),
    read('../src/lib/whatsapp/message-model.ts'),
    read('../src/lib/whatsapp/service.ts'),
    read('../src/lib/whatsapp/template-registry.ts'),
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/system-message-workspace.tsx')
  ]);
  const combined = sources.join('\n');
  assert.doesNotMatch(combined, /whatsapp_custom_messages|saveWhatsAppCustom|deleteWhatsAppCustom|payment_confirmation/);
  assert.doesNotMatch(combined, /Nova mensagem|Criar mensagem personalizada|Mensagens Personalizadas/);
});

test('admin preview derives only the company name already loaded by the authenticated context', async () => {
  const [page, registry, engine] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/lib/whatsapp/template-registry.ts'),
    read('../src/lib/whatsapp/template-engine.ts')
  ]);
  assert.doesNotMatch(registry, /empresa_nome:\s*'CibelePRINT'/);
  assert.match(registry, /empresa_nome:\s*'Sua Empresa'/);
  assert.match(page, /resolveWhatsAppPreviewVariables\(selected\.definition, company\.name\)/);
  assert.match(page, /\[company\.name, selected\.definition\]/);
  assert.match(engine, /currentCompanyName\?\.trim\(\)/);
  assert.doesNotMatch(page, /from\(['"]companies['"]\)|select\([^)]*company_name/);
  assert.doesNotMatch(page, /useState[^;]*company.*name/i);
});

test('existing admin flows resolve templates and keep manual opening', async () => {
  const files = await Promise.all([
    read('../src/app/(dashboard)/quotes/page.tsx'),
    read('../src/app/(dashboard)/orders/page.tsx'),
    read('../src/app/(dashboard)/production/page.tsx')
  ]);
  for (const source of files) {
    assert.match(source, /resolveWhatsAppTemplate/);
    assert.match(source, /confirm_before_open/);
    assert.match(source, /openWhatsAppUrl/);
    assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE_ROLE/i);
  }
});

test('public store request resolves the effective template through a server-only boundary', async () => {
  const [route, resolver, storePage] = await Promise.all([
    read('../src/app/api/store/whatsapp/product-request/route.ts'),
    read('../src/lib/store/whatsapp-product-request.ts'),
    read('../src/app/store/page.tsx')
  ]);
  assert.match(resolver, /^import 'server-only';/);
  assert.match(route, /resolveStoreLookupHostname/);
  assert.match(route, /store_product_request/);
  assert.match(storePage, /\/api\/store\/whatsapp\/product-request/);
  assert.doesNotMatch(storePage, /whatsapp_message_templates|whatsapp_settings|service_role/i);
});

test('client files never import the server admin Supabase client', async () => {
  const files = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/lib/whatsapp/service.ts')
  ]);
  for (const source of files) assert.doesNotMatch(source, /server-admin|service_role|SUPABASE_SERVICE_ROLE/i);
});
