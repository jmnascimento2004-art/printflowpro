import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20260729160835_fix_store_customer_favorites_product_rls.sql', import.meta.url);

test('favorite migration exposes only a hardened boolean helper', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /returns boolean/i);
  assert.match(sql, /stable\s+security definer\s+set search_path = pg_catalog/i);
  assert.match(sql, /public\.store_customer_accounts/);
  assert.match(sql, /public\.products/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /revoke all on function[\s\S]+from public/i);
  assert.match(sql, /revoke all on function[\s\S]+from anon/i);
  assert.match(sql, /grant execute on function[\s\S]+to authenticated/i);
});

test('favorite migration changes only the insert policy and contains no data DML', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /create policy "store_favorites_self_insert"[\s\S]+for insert[\s\S]+to authenticated[\s\S]+with check/i);
  assert.doesNotMatch(sql, /with check\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(sql, /store_favorites_self_(select|delete)/i);
  assert.doesNotMatch(sql, /create\s+policy[\s\S]+on\s+public\.products/i);
  assert.doesNotMatch(sql, /grant[\s\S]+on[\s\S]+public\.products/i);
  assert.doesNotMatch(sql, /\b(insert\s+into|update\s+public\.|delete\s+from|alter\s+table)\b/i);
});
