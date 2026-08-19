import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('sidebar separates Produtos and Catálogo next to each other with the existing settings permission', async () => {
  const [sidebar, mobile, layout, header] = await Promise.all([
    read('../src/components/dashboard/sidebar.tsx'),
    read('../src/components/dashboard/mobile-bottom-nav.tsx'),
    read('../src/app/(dashboard)/layout.tsx'),
    read('../src/components/dashboard/header.tsx')
  ]);
  assert.doesNotMatch(sidebar, /Produtos \(Catálogo\)/);
  assert.match(sidebar, /name: 'Produtos', path: '\/products'/);
  assert.match(sidebar, /name: 'Catálogo', path: '\/catalog', permissionPath: '\/settings'/);
  assert.ok(sidebar.indexOf("path: '/products'") < sidebar.indexOf("path: '/catalog'"));
  assert.match(mobile, /name: 'Catálogo', path: '\/catalog', permissionPath: '\/settings'/);
  assert.match(layout, /pathname\.startsWith\('\/catalog'\)\) return '\/settings'/);
  assert.match(header, /catalog: 'Administração do Catálogo'/);
});

test('catalog route has eight non-empty administration areas and the legacy route redirects', async () => {
  const [route, module, legacy, nextConfig, settings] = await Promise.all([
    read('../src/app/(dashboard)/catalog/page.tsx'),
    read('../src/components/catalog/catalog-admin.tsx'),
    read('../src/app/(dashboard)/settings/catalog/page.tsx'),
    read('../next.config.ts'),
    read('../src/app/(dashboard)/settings/page.tsx')
  ]);
  assert.match(route, /CatalogAdmin/);
  for (const label of ['Visão geral', 'Banners', 'Navegação & Mega Menu', 'Seções & Merchandising', 'Benefícios', 'Aparência', 'Rodapé & Redes', 'Políticas']) {
    assert.match(module, new RegExp(label.replace(/[&]/g, '\\&')));
  }
  assert.match(module, /data-testid="catalog-overview"/);
  assert.match(module, /testId="catalog-showcase-toggles"/);
  assert.match(module, /testId="catalog-benefit-card-settings"/);
  assert.match(legacy, /redirect\('\/catalog'\)/);
  assert.match(nextConfig, /source: '\/settings\/catalog'[\s\S]+destination: '\/catalog'/);
  assert.doesNotMatch(settings, /id: 'catalogo', label: 'Catálogo & Banners'/);
});

test('banner administration exposes explicit CRUD, status, ordering, duplication and previews', async () => {
  const banners = await read('../src/components/catalog/catalog-banner-manager.tsx');
  for (const action of ['Novo banner', 'Editar banner', 'Duplicar banner', 'Excluir banner', 'Visualizar banner', 'Ativar', 'Desativar']) {
    assert.match(banners, new RegExp(action));
  }
  assert.match(banners, /updateBanner\(editing\.id/);
  assert.match(banners, /Banner duplicado como inativo/);
  assert.match(banners, /catalog-banner-live-preview/);
  assert.match(banners, /uploadCatalogImage/);
  assert.match(banners, /hero-banner/);
  assert.match(banners, /commercial-banner/);
});

test('recommended image dimensions come from the real public slots and share the real upload limit', async () => {
  const [specs, store, navigation] = await Promise.all([
    read('../src/lib/store/catalog-image-specs.ts'),
    read('../src/app/store/page.tsx'),
    read('../src/components/store/catalog-category-navigation.tsx')
  ]);
  assert.match(specs, /recommendedWidth: 1220[\s\S]+recommendedHeight: 300/);
  assert.match(specs, /recommendedWidth: 900[\s\S]+recommendedHeight: 300/);
  assert.match(specs, /recommendedWidth: 600[\s\S]+recommendedHeight: 640/);
  assert.match(specs, /MAX_PRODUCT_IMAGE_SIZE_BYTES/);
  assert.match(store, /max-w-\[1220px\]/);
  assert.match(store, /h-\[300px\]/);
  assert.match(store, /aspect-\[3\/1\]/);
  assert.match(navigation, /width=\{600\} height=\{640\}/);
  assert.match(store, /banner\.mobile_image_url \|\| banner\.image_url/);
});

test('category presentation is compact, editable and keeps structural taxonomy in Products', async () => {
  const navigation = await read('../src/components/settings/catalog-navigation-settings.tsx');
  for (const column of ['Categoria', 'Destaque', 'Mega Menu', 'Ordem', 'Status', 'Ações']) assert.match(navigation, new RegExp(column));
  assert.match(navigation, /data-testid="catalog-category-editor"/);
  assert.match(navigation, /A taxonomia estrutural continua no módulo Produtos/);
  assert.match(navigation, /catalog_featured_sort_order/);
  assert.match(navigation, /catalog_mega_menu_banner_image_url/);
  assert.match(navigation, /catalog_mega_menu_banner_new_tab/);
  assert.match(navigation, /expectedUpdatedAt|updateCategory\(category\.id, draft\)/);
});

test('catalog persistence remains tenant-scoped, CAS protected and audited without a phase migration', async () => {
  const [context, persistence, audit] = await Promise.all([
    read('../src/context/database-context.tsx'),
    read('../src/lib/persistence/persistence-service.ts'),
    read('../supabase/migrations/20260819130847_phase4b_global_persistence_integrity.sql')
  ]);
  assert.match(context, /patchTenantRecord<StoreBannerRow>[\s\S]+expectedUpdatedAt: current\.updated_at/);
  assert.match(context, /patchTenantRecord<Category>[\s\S]+expectedUpdatedAt: current\.updated_at/);
  assert.match(persistence, /\.eq\('company_id', companyId\)/);
  assert.match(audit, /'store_banners'/);
  assert.match(audit, /'categories'/);
  assert.match(audit, /'settings'/);
  assert.match(audit, /'companies'/);
});

test('Products uses product-administration language and does not present itself as the catalog module', async () => {
  const products = await read('../src/app/(dashboard)/products/page.tsx');
  assert.match(products, />Produtos<\/h2>/);
  assert.match(products, /Cadastre produtos, serviços, preços e categorias estruturais do ERP/);
  assert.doesNotMatch(products, />Catálogo & Cadastro<\/h2>/);
});
