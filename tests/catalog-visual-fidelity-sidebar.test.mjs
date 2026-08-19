import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('hero artwork keeps stored colors and uses only localized carousel controls', async () => {
  const page = await read('../src/app/store/page.tsx');
  const hero = page.slice(
    page.indexOf('{/* Banner Slider Section */}'),
    page.indexOf('{/* 4. Trust signals grid')
  );

  assert.match(hero, /className="h-full w-full object-cover select-none sm:hidden"/);
  assert.match(hero, /className="hidden h-full w-full object-cover select-none sm:block"/);
  assert.match(hero, /className="absolute inset-0 z-10 focus-visible:outline-none/);
  assert.match(hero, /target=\{banner\.open_in_new_tab \? '_blank' : undefined\}/);
  assert.doesNotMatch(hero, /bg-gradient|from-(?:black|slate|blue)|to-(?:black|slate|blue)|brightness-|contrast-|saturate-|grayscale|mix-blend|filter:/);
  assert.doesNotMatch(hero, /absolute inset-0 bg-(?:black|slate|blue)/);
  assert.match(hero, /h-11 w-11[^\n]+bg-black\/35/);
  assert.match(hero, /opacity-100[^\n]+\[@media\(hover:hover\)\]:opacity-0/);
  assert.doesNotMatch(hero, /sm:opacity-0/);
  assert.match(hero, /className="flex h-11 w-11 items-center justify-center rounded-full/);
  assert.match(hero, /aria-label="Slide anterior"/);
  assert.match(hero, /aria-label="Próximo slide"/);
});

test('commercial, mega-menu and admin preview artwork have no automatic color treatment', async () => {
  const [page, navigation, manager] = await Promise.all([
    read('../src/app/store/page.tsx'),
    read('../src/components/store/catalog-category-navigation.tsx'),
    read('../src/components/catalog/catalog-banner-manager.tsx')
  ]);
  const commercial = page.slice(
    page.indexOf('data-testid="catalog-commercial-banners"') - 800,
    page.indexOf('data-testid="catalog-commercial-banners"') + 2500
  );
  const forbidden = /brightness-|contrast-|saturate-|grayscale|mix-blend|bg-gradient|absolute inset-0 bg-(?:black|slate|blue)/;

  assert.match(commercial, /aspect-\[3\/1\][^"\n]*object-cover/);
  assert.doesNotMatch(commercial, forbidden);
  assert.match(navigation, /catalog_mega_menu_banner_image_url/);
  assert.match(navigation, /className="h-full max-h-64 w-full object-cover"/);
  assert.doesNotMatch(navigation.slice(navigation.indexOf('catalog_mega_menu_banner_enabled'), navigation.indexOf('return (')), forbidden);
  assert.match(manager, /previewing\.alt_text \|\| previewing\.title \|\| 'Banner'/);
  assert.match(manager, /object-cover/);
  assert.doesNotMatch(manager, /brightness-|contrast-|saturate-|grayscale|mix-blend/);
});

test('public category navigation is minimal and toggles an active filter off', async () => {
  const [page, navigation, mobile] = await Promise.all([
    read('../src/app/store/page.tsx'),
    read('../src/components/store/catalog-category-navigation.tsx'),
    read('../src/components/store/StoreMobileBottomNavigation.tsx')
  ]);

  assert.doesNotMatch(navigation + mobile, /Todos os produtos/);
  assert.doesNotMatch(navigation, /ChevronDown|ChevronRight|ArrowDown|ArrowRight/);
  assert.doesNotMatch(navigation, />Categorias<\/h[1-6]>/i);
  assert.match(navigation, /onSelectCategory\(selectedCategory === categoryId \? null : categoryId\)/);
  assert.match(mobile, /categoryId && selectedCategory === categoryId \? null : categoryId/);
  assert.match(navigation, /expandedCategoryIds/);
  assert.match(mobile, /expandedCategoryIds/);
  assert.match(navigation, /aria-expanded=/);
  assert.match(navigation, /aria-controls=/);
  assert.match(navigation, /catalog-mega-menu-mobile-\$\{category\.id\} catalog-mega-menu-\$\{category\.id\}/);
  assert.match(mobile, /aria-expanded=/);
  assert.match(mobile, /aria-controls=/);
  assert.match(navigation, /event\.key === 'Escape'/);
  assert.match(navigation, /document\.addEventListener\('pointerdown'/);
  assert.match(page, /const filteredProducts = selectedCategory\s*\? searchedProducts\.filter/);
  assert.match(page, /:\s*searchedProducts;/);
});
