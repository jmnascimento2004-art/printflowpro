import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const providerUrl = new URL('../src/context/store-customer-context.tsx', import.meta.url);
const storeUrl = new URL('../src/app/store/page.tsx', import.meta.url);
const modalUrl = new URL('../src/components/store/ProductConfiguratorModal.tsx', import.meta.url);
const favoriteButtonUrl = new URL('../src/components/store/StoreFavoriteButton.tsx', import.meta.url);

test('provider owns optimistic favorites, rollback and per-product concurrency', async () => {
  const source = await readFile(providerUrl, 'utf8');
  assert.match(source, /pendingFavoritesRef = useRef\(new Set<string>\(\)\)/);
  assert.match(source, /pendingFavoritesRef\.current\.has\(productId\)/);
  assert.match(source, /setFavoriteProductIds\(\(current\) => isFavorite/);
  assert.match(source, /catch \(favoriteError\)[\s\S]+setFavoriteProductIds/);
  assert.match(source, /result\.error\.code === '23505'/);
  assert.match(source, /StoreFavoriteError\('session_expired'\)/);
  assert.match(source, /\.select\('product_id'\)/);
  assert.match(source, /generation !== loadGenerationRef\.current/);
  assert.doesNotMatch(source, /service_role/i);
});

test('store cards share state and use the shared favorite control', async () => {
  const source = await readFile(storeUrl, 'utf8');
  assert.match(source, /favoritePendingProductIdSet\.has\(productId\)/);
  assert.ok((source.match(/<StoreFavoriteButton/g) || []).length >= 2);
  assert.match(source, /Produto adicionado aos favoritos\./);
  assert.doesNotMatch(source, /Produto salvo nos favoritos\./);
  assert.match(source, /Entre na sua conta para salvar produtos nos favoritos\./);
  assert.match(source, /Sua sessão expirou\. Entre novamente para continuar\./);
  assert.match(source, /Tente novamente\./);
  assert.doesNotMatch(source, /favoriteSavingProductId/);
});

test('favorite button blocks card propagation before checking pending state', async () => {
  const source = await readFile(favoriteButtonUrl, 'utf8');
  assert.match(source, /const handleClick[\s\S]+event\.preventDefault\(\);[\s\S]+event\.stopPropagation\(\);[\s\S]+if \(isPending\) return;[\s\S]+onToggle\(productId\)/);
  assert.match(source, /const handleDoubleClick[\s\S]+event\.preventDefault\(\);[\s\S]+event\.stopPropagation\(\)/);
  assert.match(source, /onPointerDown=\{stopPointerPropagation\}/);
  assert.match(source, /onMouseDown=\{stopMousePropagation\}/);
  assert.match(source, /onKeyDown=\{stopKeyboardPropagation\}/);
});

test('favorite button remains accessible and shares pending state', async () => {
  const source = await readFile(favoriteButtonUrl, 'utf8');
  assert.match(source, /type="button"/);
  assert.match(source, /aria-pressed=\{isFavorite\}/);
  assert.match(source, /aria-busy=\{isPending\}/);
  assert.match(source, /aria-disabled=\{isPending\}/);
  assert.doesNotMatch(source, /service_role/i);
});

test('favorite controls separate a 44px touch target from the visual surface', async () => {
  const [storeSource, modalSource, buttonSource] = await Promise.all([
    readFile(storeUrl, 'utf8'),
    readFile(modalUrl, 'utf8'),
    readFile(favoriteButtonUrl, 'utf8')
  ]);

  assert.equal((storeSource.match(/className="absolute top-2\.5 left-2\.5 h-11 w-11 z-10"/g) || []).length, 2);
  assert.equal((storeSource.match(/surfaceClassName="h-7 w-7 rounded-full/g) || []).length, 2);
  assert.doesNotMatch(storeSource, /className="[^"]*h-7 w-7[^"]*"/);
  assert.match(modalSource, /className="h-11 w-11"/);
  assert.match(modalSource, /surfaceClassName="h-9 w-9 rounded-xl/);
  assert.match(buttonSource, /surfaceClassName\?: string/);
  assert.match(buttonSource, /<span className=\{`flex items-center justify-center \$\{surfaceClassName\}`\}>/);
  assert.match(buttonSource, /<Heart className=\{`h-4 w-4/);
  assert.match(buttonSource, /type="button"/);
  assert.match(buttonSource, /event\.preventDefault\(\);[\s\S]+event\.stopPropagation\(\);/);
  assert.match(buttonSource, /onDoubleClick=\{handleDoubleClick\}/);
  assert.match(buttonSource, /if \(isPending\) return;/);
  assert.doesNotMatch(buttonSource, /service_role/i);
});

test('configurator consumes the shared favorite state without its own query or state', async () => {
  const source = await readFile(modalUrl, 'utf8');
  assert.match(source, /<StoreFavoriteButton/);
  assert.match(source, /productId=\{product\.id\}/);
  assert.match(source, /isFavorite=\{isFavorite\}/);
  assert.match(source, /isPending=\{isFavoritePending\}/);
  assert.match(source, /onToggle=\{onToggleFavorite\}/);
  assert.doesNotMatch(source, /store_customer_favorites/);
  assert.doesNotMatch(source, /useState[^\n]+favorit/i);
});

test('cards and configurator receive the same provider-derived favorite state', async () => {
  const source = await readFile(storeUrl, 'utf8');
  assert.match(source, /isFavorite=\{favoriteProductIdSet\.has\(p\.id\)\}/);
  assert.match(source, /isFavorite=\{favoriteProductIdSet\.has\(product\.id\)\}/);
  assert.match(source, /isFavorite=\{Boolean\(activeAdvancedConfigProduct && favoriteProductIdSet\.has\(activeAdvancedConfigProduct\.id\)\)\}/);
  assert.match(source, /isFavoritePending=\{Boolean\(activeAdvancedConfigProduct && favoritePendingProductIdSet\.has\(activeAdvancedConfigProduct\.id\)\)\}/);
  assert.match(source, /onToggleFavorite=\{handleProductFavorite\}/);
});
