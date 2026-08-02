import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('registry contains only the four audited real message events', async () => {
  const registry = await read('../src/lib/whatsapp/template-registry.ts');
  for (const key of ['quote_proposal', 'order_payment_pending', 'production_status_changed', 'store_product_request']) {
    assert.match(registry, new RegExp(`eventKey: '${key}'`));
  }
  assert.equal((registry.match(/^\s+eventKey:/gm) || []).length, 4);
});

test('service loads templates in one query and settings in one parallel query', async () => {
  const service = await read('../src/lib/whatsapp/service.ts');
  assert.match(service, /Promise\.all\(\[/);
  assert.match(service, /from\('whatsapp_message_templates'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.match(service, /from\('whatsapp_settings'\)\.select\('\*'\)\.eq\('company_id', companyId\)/);
  assert.doesNotMatch(service, /forEach[\s\S]{0,200}from\('whatsapp_message_templates'\)/);
});

test('service falls back to code defaults and supports inactive custom models', async () => {
  const service = await read('../src/lib/whatsapp/service.ts');
  assert.match(service, /custom\?\.content \|\| definition\.defaultContent/);
  assert.match(service, /active: custom \? custom\.active : definition\.enabledByDefault/);
  assert.match(service, /usedFallback = true/);
});

test('admin page includes permissions-safe route UI, tabs, editor, chips and preview', async () => {
  const [page, sidebar, context] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/dashboard/sidebar.tsx'),
    read('../src/context/database-context.tsx')
  ]);
  assert.match(sidebar, /name: 'WhatsApp', path: '\/whatsapp'/);
  assert.match(context, /'\/whatsapp': \['admin', 'gerente'\]/);
  assert.match(page, /Modelos de mensagens/);
  assert.match(page, /Configurações/);
  assert.match(page, /textarea/);
  assert.match(page, /insertVariable/);
  assert.match(page, /Pré-visualização/);
  assert.match(page, /Testar mensagem/);
  assert.match(page, /WHATSAPP_TEMPLATE_MAX_LENGTH/);
  assert.match(page, /xl:grid-cols-\[270px_minmax\(0,1fr\)_320px\]/);
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

test('public store request uses the central default without reading administrative tables', async () => {
  const [orderHelper, storePage] = await Promise.all([
    read('../src/lib/whatsapp-order.ts'),
    read('../src/app/store/page.tsx')
  ]);
  assert.match(orderHelper, /getWhatsAppTemplateDefinition\('store_product_request'\)/);
  assert.match(storePage, /buildWhatsAppOrderMessage/);
  assert.doesNotMatch(storePage, /whatsapp_message_templates|whatsapp_settings/);
});

test('client files never import the server admin Supabase client', async () => {
  const files = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/lib/whatsapp/service.ts')
  ]);
  for (const source of files) assert.doesNotMatch(source, /server-admin|service_role|SUPABASE_SERVICE_ROLE/i);
});
