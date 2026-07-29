import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const providerUrl = new URL('../src/context/store-customer-context.tsx', import.meta.url);
const storeUrl = new URL('../src/app/store/page.tsx', import.meta.url);

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

test('store cards share state and expose accessible favorite controls', async () => {
  const source = await readFile(storeUrl, 'utf8');
  assert.match(source, /favoritePendingProductIdSet\.has\(productId\)/);
  assert.ok((source.match(/aria-pressed=\{isFavorite\}/g) || []).length >= 2);
  assert.ok((source.match(/aria-busy=\{isSaving\}/g) || []).length >= 2);
  assert.match(source, /e\.stopPropagation\(\)/);
  assert.match(source, /Entre na sua conta para salvar produtos nos favoritos\./);
  assert.match(source, /Sua sessão expirou\. Entre novamente para continuar\./);
  assert.match(source, /Tente novamente\./);
  assert.doesNotMatch(source, /favoriteSavingProductId/);
});
