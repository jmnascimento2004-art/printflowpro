import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('catalog sidebar migration is additive and preserves legacy hero banners', async () => {
  const migration = await read('../supabase/migrations/20260818182958_catalog_sidebar_megamenu_banners.sql');
  assert.match(migration, /catalog_featured\s+boolean\s+not\s+null\s+default\s+false/i);
  assert.match(migration, /catalog_mega_menu_enabled\s+boolean\s+not\s+null\s+default\s+false/i);
  assert.match(migration, /placement\s+text\s+not\s+null\s+default\s+'hero'/i);
  assert.match(migration, /check\s*\(placement\s+in\s*\('hero',\s*'catalog'\)\)/i);
  assert.match(migration, /idx_categories_company_catalog_featured/i);
  assert.match(migration, /idx_store_banners_company_placement_active_sort/i);
  assert.doesNotMatch(migration, /drop\s+(?:table|column|policy)|truncate|delete\s+from|insert\s+into|update\s+public\./i);
});

test('public Store aggregates tenant-scoped catalog presentation in the existing parallel load', async () => {
  const route = await read('../src/app/api/store/public-data/route.ts');
  assert.match(route, /getSupabaseAdminClient/);
  assert.match(route, /resolveStoreLookupHostname/);
  assert.match(route, /Promise\.all/);
  assert.match(route, /catalog_featured_title/);
  assert.match(route, /catalog_mega_menu_banner_image_url/);
  assert.match(route, /mobile_image_url/);
  assert.match(route, /\.eq\('company_id', companyId\)/);
  assert.match(route, /\.eq\('active', true\)/);
});

test('Store renders featured categories, collapsed accordions, mega menu and responsive commercial banners', async () => {
  const [page, navigation] = await Promise.all([
    read('../src/app/store/page.tsx'),
    read('../src/components/store/catalog-category-navigation.tsx')
  ]);
  assert.match(page, /CatalogCategoryNavigation/);
  assert.match(page, /data-testid="catalog-commercial-banners"/);
  assert.match(page, /md:grid-cols-2/);
  assert.match(page, /sm:hidden/);
  assert.match(page, /sm:block/);
  assert.match(page, /banner\.mobile_image_url \|\| banner\.image_url/);
  assert.match(page, /\(banner\.placement \|\| 'hero'\) === 'hero'/);
  assert.match(navigation, /featuredCategories\.map/);
  assert.doesNotMatch(navigation, /Todos os produtos/);
  assert.match(navigation, /expandedCategoryIds/);
  assert.match(navigation, /aria-expanded/);
  assert.match(navigation, /event\.key === 'Escape'/);
  assert.match(navigation, /document\.addEventListener\('pointerdown'/);
  assert.match(navigation, /onOpenProduct\(product\)/);
  assert.match(navigation, /min-h-11/);
  assert.doesNotMatch(navigation, />Categorias<\/h2>/);
});

test('ADMIN exposes complete tenant presentation controls and reuses the product image bucket', async () => {
  const [page, banners, navigation, uploader] = await Promise.all([
    read('../src/components/catalog/catalog-admin.tsx'),
    read('../src/components/catalog/catalog-banner-manager.tsx'),
    read('../src/components/settings/catalog-navigation-settings.tsx'),
    read('../src/lib/catalog-images.ts')
  ]);
  assert.match(page, /CatalogNavigationSettings/);
  assert.match(page, /updateCategoryCatalogPresentation/);
  assert.match(navigation, /data-testid="catalog-navigation-settings"/);
  assert.match(banners, /imagem desktop/i);
  assert.match(banners, /Imagem mobile opcional/);
  assert.match(banners + navigation, /Texto alternativo/);
  assert.match(banners + navigation, /Abrir destino em nova aba/);
  assert.match(navigation, /Categoria em destaque/);
  assert.match(navigation, /Mega Menu ativo/);
  assert.match(navigation, /Salvar apresentação/);
  assert.match(uploader, /PRODUCT_IMAGE_BUCKET/);
  assert.match(uploader, /upsert:\s*false/);
  assert.doesNotMatch(page + banners + navigation + uploader, /SUPABASE_SERVICE_ROLE|service_role/i);
});
