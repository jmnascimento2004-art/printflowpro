import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

async function loadCatalogVisualSettings() {
  const source = await read('../src/lib/store/catalog-visual-settings.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', output)((name) => {
    if (name === '@/lib/dummy-data') return {};
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

test('catalog visual migration is additive, deterministic and contains no policy or destructive changes', async () => {
  const migration = await read('../supabase/migrations/20260818000953_catalog_visual_refinement_settings.sql');
  for (let slot = 1; slot <= 7; slot += 1) {
    assert.match(migration, new RegExp(`card_benefits_${slot}_icon\\s+text`, 'i'));
    assert.match(migration, new RegExp(`card_benefits_${slot}_sort_order\\s+smallint`, 'i'));
  }
  assert.match(migration, /catalog_bestsellers_section_enabled\s+boolean/i);
  assert.match(migration, /catalog_highlights_section_enabled\s+boolean/i);
  assert.match(migration, /catalog_highlights_section_enabled\s*=\s*coalesce\([\s\S]+catalog_promotions_section_enabled/i);
  assert.doesNotMatch(migration, /drop\s+(?:table|column|policy)|truncate|delete\s+from|create\s+policy|alter\s+policy/i);
});

test('catalog benefit-card completion migration restores only missing legacy presentation fields', async () => {
  const migration = await read('../supabase/migrations/20260818013100_complete_catalog_benefit_card_slots.sql');
  for (let slot = 5; slot <= 7; slot += 1) {
    assert.match(migration, new RegExp(`card_benefits_${slot}_title\\s+text`, 'i'));
    assert.match(migration, new RegExp(`card_benefits_${slot}_subtitle\\s+text`, 'i'));
    assert.match(migration, new RegExp(`card_benefits_${slot}_active\\s+boolean`, 'i'));
  }
  assert.doesNotMatch(migration, /drop\s+(?:table|column|policy)|truncate|delete\s+from|create\s+policy|alter\s+policy|grant\s|revoke\s/i);
});

test('seven benefit cards preserve slots while sorting, serializing and choosing readable contrast', async () => {
  const helper = await loadCatalogVisualSettings();
  const company = {
    card_benefits_1_title: 'Primeiro',
    card_benefits_1_sort_order: 3,
    card_benefits_2_title: 'Segundo',
    card_benefits_2_sort_order: 1,
    card_benefits_7_title: 'Sétimo',
    card_benefits_7_active: true,
    card_benefits_7_icon: 'clock',
    card_benefits_7_sort_order: 2
  };
  const cards = helper.getCatalogBenefitCards(company);
  assert.equal(cards.length, 7);
  assert.deepEqual(cards.slice(0, 3).map((card) => card.slot), [2, 7, 1]);
  assert.equal(cards.find((card) => card.slot === 7).icon, 'clock');
  const patch = helper.catalogBenefitCardsToCompanyPatch(cards);
  assert.equal(patch.card_benefits_2_sort_order, 1);
  assert.equal(patch.card_benefits_7_sort_order, 2);
  assert.equal(helper.getContrastingTextColor('#ffffff'), '#0f172a');
  assert.equal(helper.getContrastingTextColor('#111827'), '#ffffff');
});

test('Store uses a responsive vertical category rail and independently gated showcase tabs', async () => {
  const [page, navigation] = await Promise.all([
    read('../src/app/store/page.tsx'),
    read('../src/components/store/catalog-category-navigation.tsx')
  ]);
  assert.doesNotMatch(page + navigation, /Category Menu Bar|megaMenuOpen|Todos os Produtos button styled as hamburger menu/);
  assert.match(navigation, /aria-label="Categorias do catálogo"/);
  assert.match(navigation, /catalog-mobile-categories/);
  assert.match(navigation, /Todos os produtos/);
  assert.match(page, /getContrastingTextColor\(primary\)/);
  assert.match(page, /catalog_bestsellers_section_enabled/);
  assert.match(page, /catalog_promotions_section_enabled/);
  assert.match(page, /catalog_highlights_section_enabled/);
  assert.match(page, /showcaseTabs\.map/);
  assert.match(page, /getCatalogBenefitCards\(company\)/);
});

test('catalog settings expose seven editable, sortable cards and three independent toggles', async () => {
  const page = await read('../src/components/catalog/catalog-admin.tsx');
  assert.match(page, /testId="catalog-benefit-card-settings"/);
  assert.match(page, /benefitCards\.map/);
  assert.match(page, /moveBenefitCard/);
  assert.match(page, /CATALOG_BENEFIT_ICON_OPTIONS/);
  assert.match(page, /testId="catalog-showcase-toggles"/);
  assert.match(page, /catalog_bestsellers_section_enabled/);
  assert.match(page, /catalog_promotions_section_enabled/);
  assert.match(page, /catalog_highlights_section_enabled/);
});

test('system variable UI has no fake system sample and consumes authenticated server values', async () => {
  const [page, workspace, route, auth] = await Promise.all([
    read('../src/app/(dashboard)/whatsapp/page.tsx'),
    read('../src/components/whatsapp/system-message-workspace.tsx'),
    read('../src/app/api/whatsapp/system-message/resolve/route.ts'),
    read('../src/lib/whatsapp/system-message-auth.server.ts')
  ]);
  assert.doesNotMatch(page, /resolveWhatsAppPreviewVariables|sampleSystemPreview/);
  assert.match(page, /resolvedSystemContext\?\.variables/);
  assert.match(workspace, /whatsapp-system-variable-values/);
  assert.match(workspace, /Sem contexto selecionado/);
  assert.match(route, /resolveWhatsAppCompanyVariables/);
  assert.match(route, /resolvePixPreviewVariables/);
  assert.match(route, /renderedContent:\s*renderWhatsAppTemplate\(content, definition, variables\)/);
  assert.match(route, /variables: resolved\.variables/);
  assert.match(auth, /store_product_request: \['\/whatsapp'\]/);
  assert.doesNotMatch(page, /SUPABASE_SERVICE_ROLE|service_role/i);
});
