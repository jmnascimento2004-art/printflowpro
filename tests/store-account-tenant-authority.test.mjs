import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, imports = {}) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace("import 'server-only';", '');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in imports) return imports[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}
const normalizer = await compile('../src/lib/store/normalize-store-host.ts');
const lookup = await compile('../src/lib/store/resolve-store-lookup-hostname.mjs');
const input = { p_name: 'Fixture', p_customer_type: 'fisica', p_document: '11122233344', p_phone: '71999999999' };

async function run({ host = 'store-a.example.test', extraHeaders = {}, body = input, user = { id: 'verified-user' }, authError = null, rpcError = null, rows = [{ account_id: 'account-a', customer_id: 'customer-a' }], environment = {} } = {}) {
  const observed = { calls: [], tokens: [] };
  const admin = {
    auth: { async getUser(token) { observed.tokens.push(token); return { data: { user }, error: authError }; } },
    async rpc(name, args) { observed.calls.push({ name, args }); return { data: rows, error: rpcError }; }
  };
  const route = await compile('../src/app/api/store/customer-account/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: 200, ...options }) } },
    '@/lib/supabase/server-admin': { getSupabaseAdminClient: () => admin },
    '@/lib/store/normalize-store-host': normalizer,
    '@/lib/store/resolve-store-lookup-hostname.mjs': { resolveStoreLookupHostname: (host) => lookup.resolveStoreLookupHostname(host, environment) }
  });
  const headers = new Headers({ authorization: 'Bearer verified-token', ...extraHeaders });
  if (host !== null) headers.set('host', host);
  const response = await route.POST(new Request('https://store-a.example.test/api/store/customer-account', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { ...observed, response };
}

test('valid hostname uses server-verified identity and returns only account identifiers', async () => {
  const result = await run();
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.tokens, ['verified-token']);
  assert.deepEqual(result.calls, [{ name: 'ensure_store_customer_account_from_server', args: { p_store_hostname: 'store-a.example.test', p_actor_user_id: 'verified-user', p_profile: input } }]);
  assert.deepEqual(result.response.body, { account_id: 'account-a', customer_id: 'customer-a' });
  assert.match(result.response.headers['Cache-Control'], /no-store/);
});

for (const spoof of [
  {}, { origin: 'https://store-a.example.test' }, { origin: 'https://store-b.example.test' },
  { origin: 'http://localhost:3000', referer: 'https://store-b.example.test/path' },
  { 'x-forwarded-host': 'store-b.example.test', 'x-store-host': 'store-b.example.test', 'x-tenant-id': 'tenant-b' },
  { origin: 'invalid', referer: 'invalid', 'x-forwarded-host': 'invalid' }
]) test(`headers cannot override Host A: ${JSON.stringify(spoof)}`, async () => {
  const result = await run({ extraHeaders: spoof });
  assert.equal(result.response.status, 200);
  assert.equal(result.calls[0].args.p_store_hostname, 'store-a.example.test');
});

for (const host of [null, '', 'https://store-b.example.test', 'a.example,b.example', 'user@b.example', 'store-a.example.test/path'])
  test(`missing/malformed Host fails closed: ${host}`, async () => {
    const result = await run({ host, extraHeaders: { 'x-forwarded-host': 'store-b.example.test', origin: 'https://store-b.example.test' } });
    assert.equal(result.response.status, 400);
    assert.equal(result.calls.length, 0);
  });

for (const key of ['companyId', 'p_company_id', 'tenant_id', 'store_id', 'p_actor_user_id', 'auth_user_id', 'email', 'p_email', '__proto__'])
  test(`browser authority rejected: ${key}`, async () => {
    const result = await run({ body: { ...input, [key]: 'tenant-b-or-victim' } });
    assert.equal(result.response.status, 400);
    assert.equal(result.calls.length, 0);
  });

test('missing, invalid and anonymous authentication cannot invoke privileged RPC', async () => {
  for (const options of [{ extraHeaders: { authorization: '' } }, { user: null }, { authError: { message: 'bad token' } }, { user: { id: 'anonymous', is_anonymous: true } }]) {
    const result = await run(options);
    assert.equal(result.response.status, 401);
    assert.equal(result.calls.length, 0);
  }
});

test('Preview canonical configuration only maps the exact deployment host', async () => {
  const environment = { VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_URL: 'preview.vercel.app', STORE_PREVIEW_CANONICAL_HOST: 'store-a.example.test' };
  const result = await run({ host: 'preview.vercel.app', environment, extraHeaders: { 'x-forwarded-host': 'store-b.example.test' } });
  assert.equal(result.calls[0].args.p_store_hostname, 'store-a.example.test');
  const custom = await run({ host: 'custom-b.example.test', environment });
  assert.equal(custom.calls[0].args.p_store_hostname, 'custom-b.example.test');
});

test('database failures are sanitized without identifiers or raw errors', async () => {
  for (const [code, status] of [['P0001', 409], ['23505', 503]]) {
    const result = await run({ rpcError: { code, message: 'secret document or email' } });
    assert.equal(result.response.status, status);
    assert.deepEqual(result.response.body, { error: 'Nao foi possivel concluir o cadastro.' });
  }
});
