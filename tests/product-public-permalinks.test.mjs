import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

const [migration, permalink, resolver, publicData, store, routePage, routeLayout, modal, picker, banners, navigation, catalogAdmin, productsPage, database, rootLayout, brandingHeadSync, companyThemeSync] = await Promise.all([
  read('../supabase/migrations/20260820021813_product_public_permalinks.sql'),
  read('../src/lib/store/product-permalink.ts'),
  read('../src/lib/store/resolve-public-store-product.server.ts'),
  read('../src/app/api/store/public-data/route.ts'),
  read('../src/app/store/page.tsx'),
  read('../src/app/store/product/[slug]/page.tsx'),
  read('../src/app/store/product/[slug]/layout.tsx'),
  read('../src/components/store/ProductConfiguratorModal.tsx'),
  read('../src/components/catalog/catalog-link-target-picker.tsx'),
  read('../src/components/catalog/catalog-banner-manager.tsx'),
  read('../src/components/settings/catalog-navigation-settings.tsx'),
  read('../src/components/catalog/catalog-admin.tsx'),
  read('../src/app/(dashboard)/products/page.tsx'),
  read('../src/context/database-context.tsx'),
  read('../src/app/layout.tsx'),
  read('../src/components/branding-head-sync.tsx'),
  read('../src/components/company-theme-sync.tsx')
]);

test('migration creates stable tenant-scoped slugs with deterministic collision control', () => {
  assert.match(migration, /add column if not exists slug text/i);
  assert.match(migration, /products_company_slug_key unique \(company_id, slug\)/i);
  assert.match(migration, /pg_advisory_xact_lock\([\s\S]*?'product-slug:' \|\| p_company_id[\s\S]*?\)/i);
  assert.doesNotMatch(migration.match(/pg_advisory_xact_lock\([\s\S]*?\);/)?.[0] || '', /v_base/i);
  assert.match(migration, /order by p\.company_id, p\.created_at, p\.id/i);
  assert.match(migration, /new\.slug is not distinct from old\.slug[\s\S]*?return new/i);
  assert.match(migration, /v_slug := v_base \|\| '-' \|\| v_suffix::text/i);
  assert.doesNotMatch(migration, /update public\.products\s+set\s+name/i);
});

test('slug functions are private and the dedicated audit event contains only slug values', () => {
  assert.match(migration, /function private\.normalize_product_slug/i);
  assert.match(migration, /revoke all on function private\.allocate_product_slug[\s\S]*?authenticated/i);
  assert.match(migration, /function private\.ensure_product_slug\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /public_store_products_select[\s\S]*?active = true and catalog_active = true/i);
  assert.match(migration, /'product\.slug_changed'/i);
  assert.match(migration, /jsonb_build_object\('slug', old\.slug\)/i);
  assert.match(migration, /jsonb_build_object\('slug', new\.slug\)/i);
  assert.doesNotMatch(migration, /service_role_key|supabase_service_role_key/i);
});

test('one canonical permalink helper owns path, parsing, tenant origin and URL composition', () => {
  assert.match(permalink, /STORE_PRODUCT_PATH_PREFIX = '\/store\/product\/'/);
  assert.match(permalink, /normalizePublicProductSlug/);
  assert.match(permalink, /getProductSlugFromStorePath/);
  assert.match(permalink, /company\?\.store_domain, company\?\.custom_domain, company\?\.admin_domain, fallbackOrigin/);
  assert.match(permalink, /new URL\(path, origin\)/);
  assert.doesNotMatch(permalink, /cibele/i);
});

test('public product resolver is server-only, hostname-derived and fail-closed by tenant and publication', () => {
  assert.match(resolver, /import 'server-only'/);
  assert.match(resolver, /normalizeStoreHost/);
  assert.match(resolver, /resolveStoreLookupHostname/);
  assert.match(resolver, /from\('companies'\)[\s\S]*?store_domain\.eq\.\$\{host\}/);
  assert.match(resolver, /from\('products'\)[\s\S]*?eq\('company_id', companyId\)[\s\S]*?eq\('slug', slug\)[\s\S]*?eq\('active', true\)[\s\S]*?eq\('catalog_active', true\)/);
  assert.doesNotMatch(resolver, /searchParams|company_id.*params|companyId.*raw/i);
});

test('deep route validates server-side, returns sanitized notFound and publishes canonical metadata', () => {
  assert.match(routeLayout, /resolvePublicStoreProduct\(await getHost\(\), slug\)/);
  assert.match(routeLayout, /if \(!product\) notFound\(\)/);
  assert.match(routeLayout, /alternates: \{ canonical \}/);
  assert.match(routeLayout, /openGraph/);
  assert.match(routePage, /import StorefrontPage from '@\/app\/store\/page'/);
  assert.match(routePage, /return <StorefrontPage \/>/);
});

test('branding synchronizers preserve product title and Open Graph metadata after hydration', () => {
  assert.match(rootLayout, /isStoreProduct = window\.location\.pathname\.indexOf\('\/store\/product\/'\) === 0/);
  assert.match(rootLayout, /if \(companyName && !isStoreProduct\)/);
  assert.match(brandingHeadSync, /const isStoreProductPath = pathname\.startsWith\('\/store\/product\/'\)/);
  assert.match(brandingHeadSync, /if \(!isStoreProductPath\) document\.title = appTitle/);
  assert.match(brandingHeadSync, /if \(!isStoreProductPath\) \{[\s\S]*?meta\[name="description"\][\s\S]*?meta\[property="og:title"\]/);
  assert.match(companyThemeSync, /if \(pathname\.startsWith\('\/store\/product\/'\)\) return;[\s\S]*?document\.title/);
});

test('public catalog payload includes the canonical slug but no private product cost', () => {
  assert.match(publicData, /'id', 'slug', 'category_id'/);
  assert.doesNotMatch(publicData.match(/const PRODUCT_FIELDS = \[[\s\S]*?\]\.join\(','\);/)?.[0] || '', /base_cost|current_stock/);
});

test('Store opens the same configurator from URL and keeps history coherent', () => {
  assert.match(store, /usePathname, useRouter, useSearchParams/);
  assert.match(store, /getProductSlugFromStorePath\(pathname\)/);
  assert.match(store, /products\.find\(\(product\) => product\.slug === slug/);
  assert.match(store, /router\.push\(path, \{ scroll: false \}\)/);
  assert.match(store, /router\.replace\('\/store', \{ scroll: false \}\)/);
  assert.match(store, /\}, \[pathname, products\]\)/);
  assert.doesNotMatch(store, /history\.(?:pushState|replaceState)|addEventListener\('popstate'/);
  assert.match(store, /<ProductConfiguratorModal[\s\S]*?productUrl=\{getPublicProductUrl/);
});

test('configurator exposes one accessible Copy/Share action', () => {
  assert.match(modal, /productUrl\?: string \| null/);
  assert.match(modal, /navigator\.share/);
  assert.match(modal, /navigator\.clipboard\.writeText\(productUrl\)/);
  assert.match(modal, /aria-label=\{shareComplete \? 'Link do produto copiado' : 'Compartilhar produto'\}/);
  assert.match(modal, /h-11 min-w-11/);
  assert.match(modal, /role="dialog"/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /aria-labelledby="product-configurator-title"/);
  assert.match(modal, /event\.key === 'Escape'/);
  assert.match(modal, /className="h-11 w-11[^"]*"[\s\S]*?aria-label="Fechar configurador"/);
});

test('one searchable destination picker serves banner slider, commercial banners and Mega Menu', () => {
  assert.match(picker, /type DestinationType = 'none' \| 'product' \| 'url' \| 'whatsapp'/);
  assert.match(picker, /Buscar por produto ou SKU/);
  assert.match(picker, /getPublicProductPath\(event\.target\.value\)/);
  assert.match(banners, /<CatalogLinkTargetPicker products=\{products\}/);
  assert.match(navigation, /<CatalogLinkTargetPicker products=\{products\}/);
  assert.match(catalogAdmin, /<CatalogBannerManager[\s\S]*?products=\{products\}/);
  assert.match(catalogAdmin, /<CatalogNavigationSettings[\s\S]*?products=\{products\}/);
});

test('existing banner rendering safely follows canonical relative product links', () => {
  assert.match(store, /href=\{safeHref\(banner\.link\)\}/);
  assert.match(store, /href=\{safeHref\(banner\.link \|\| '#'\)\}/);
  assert.match(banners, /link: draft\.link\.trim\(\) \|\| undefined/);
});

test('admin product form shows publication state and compact Copy/Open controls', () => {
  assert.match(productsPage, /data-testid="product-public-permalink-admin"/);
  assert.match(productsPage, /Produto fora do catálogo/);
  assert.match(productsPage, /navigator\.clipboard\.writeText\(selectedProductPublicUrl\)/);
  assert.match(productsPage, /target="_blank" rel="noopener noreferrer"/);
  assert.match(database, /'is_highlight', 'pricing_details', 'slug'/);
});

test('client code contains no service role credential and permalink scope stays product/catalog only', () => {
  const clientSurface = [store, modal, picker, banners, navigation, productsPage, database].join('\n');
  assert.doesNotMatch(clientSurface, /SUPABASE_SERVICE_ROLE_KEY|service_role_key/i);
  assert.doesNotMatch(clientSurface, /cibeleprint|cibele/i);
});
