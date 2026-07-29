import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helperUrl = new URL('../src/lib/store/resolve-store-lookup-hostname.mjs', import.meta.url);
const routeUrl = new URL('../src/app/api/store/public-data/route.ts', import.meta.url);
const middlewareUrl = new URL('../src/middleware.ts', import.meta.url);

const helperSource = await readFile(helperUrl, 'utf8');
const executableHelperSource = helperSource.replace("import 'server-only';", '');
const helperModuleUrl = `data:text/javascript;base64,${Buffer.from(executableHelperSource).toString('base64')}`;
const { resolveStoreLookupHostname } = await import(helperModuleUrl);

const previewEnvironment = {
  VERCEL: '1',
  VERCEL_ENV: 'preview',
  VERCEL_URL: 'printflowpro-preview.vercel.app',
  VERCEL_BRANCH_URL: 'printflowpro-git-favorites.vercel.app',
  STORE_PREVIEW_CANONICAL_HOST: 'store.cibeleprint.com.br'
};

test('preview override is gated by Vercel environment and exact deployment host', () => {
  assert.equal(resolveStoreLookupHostname('printflowpro-preview.vercel.app', previewEnvironment), 'store.cibeleprint.com.br');
  assert.equal(resolveStoreLookupHostname('printflowpro-git-favorites.vercel.app', previewEnvironment), 'store.cibeleprint.com.br');
  assert.equal(resolveStoreLookupHostname('attacker.example', previewEnvironment), 'attacker.example');
  assert.equal(resolveStoreLookupHostname('unrelated.vercel.app', previewEnvironment), 'unrelated.vercel.app');
  assert.equal(resolveStoreLookupHostname('localhost', previewEnvironment), 'localhost');
});

test('production, development and incomplete preview environments ignore the override', () => {
  assert.equal(resolveStoreLookupHostname('store.cibeleprint.com.br', { ...previewEnvironment, VERCEL_ENV: 'production' }), 'store.cibeleprint.com.br');
  assert.equal(resolveStoreLookupHostname('printflowpro-preview.vercel.app', { ...previewEnvironment, VERCEL_ENV: 'development' }), 'printflowpro-preview.vercel.app');
  assert.equal(resolveStoreLookupHostname('printflowpro-preview.vercel.app', { ...previewEnvironment, VERCEL: undefined }), 'printflowpro-preview.vercel.app');
  assert.equal(resolveStoreLookupHostname('printflowpro-preview.vercel.app', { ...previewEnvironment, STORE_PREVIEW_CANONICAL_HOST: undefined }), 'printflowpro-preview.vercel.app');
});

test('canonical host validation fails closed and the override stays server-only and store-specific', async () => {
  for (const invalidHost of [
    'https://store.cibeleprint.com.br',
    'store.cibeleprint.com.br/path',
    'store.cibeleprint.com.br?query=1',
    'store.cibeleprint.com.br#fragment',
    ' user@store.cibeleprint.com.br',
    'store.cibeleprint.com.br:443'
  ]) {
    assert.equal(
      resolveStoreLookupHostname('printflowpro-preview.vercel.app', { ...previewEnvironment, STORE_PREVIEW_CANONICAL_HOST: invalidHost }),
      'printflowpro-preview.vercel.app'
    );
  }

  const routeSource = await readFile(routeUrl, 'utf8');
  const middlewareSource = await readFile(middlewareUrl, 'utf8');
  assert.match(helperSource, /^import 'server-only';/);
  assert.doesNotMatch(helperSource, /NEXT_PUBLIC_/);
  assert.match(routeSource, /resolveStoreLookupHostname\(localAwareHost\)/);
  assert.match(routeSource, /STORE_NOT_FOUND/);
  assert.doesNotMatch(middlewareSource, /STORE_PREVIEW_CANONICAL_HOST|resolveStoreLookupHostname/);
});
