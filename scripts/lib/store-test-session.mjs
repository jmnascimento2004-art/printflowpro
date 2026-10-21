import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

// Local PostgREST 14.5 predates the cached-clock fixes (#5159/#5208).
// Establish authenticated read readiness BEFORE racing mutations. Never change
// claims, mint replacement JWTs, retry a mutation, or relax server validation.
export async function requireStoreTestSession(client) {
  const { data, error } = await client.auth.getSession();
  assert.equal(error, null);
  const token = data.session?.access_token;
  assert.ok(token, 'test session is missing');
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  const now = Date.now() / 1000;
  assert.ok(Number.isFinite(claims.iat) && claims.iat <= now, 'fixture JWT iat is actually in the future');
  assert.ok(claims.nbf == null || claims.nbf <= now, 'fixture JWT nbf is actually in the future');
  assert.ok(Number.isFinite(claims.exp) && claims.exp > now, 'fixture JWT is expired');
  console.log(JSON.stringify({ phase: 'jwt-readiness', hostEpoch: now, iat: claims.iat, nbf: claims.nbf ?? null }));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const probe = await client.from('store_customer_accounts').select('id').limit(1);
    if (!probe.error) return token;
    if (probe.error.code !== 'PGRST303' || probe.error.message !== 'JWT issued at future' || attempt === 3) {
      throw new Error(`Local authenticated read not ready: ${probe.error.code}`);
    }
    console.log('LOCAL_POSTGREST_CLOCK_NOT_READY; retrying read-only preflight');
    await setTimeout(250);
  }
  throw new Error('Local authenticated read not ready');
}
