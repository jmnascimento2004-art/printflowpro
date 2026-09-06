import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260906030909_harden_store_customer_account_link.sql',
  import.meta.url,
);
const storeContextUrl = new URL('../src/context/store-customer-context.tsx', import.meta.url);

const [migration, storeContext] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(storeContextUrl, 'utf8'),
]);

test('Store account RPC trusts only server-side authenticated identity for reconciliation', () => {
  assert.match(migration, /v_auth_user_id uuid := \(select auth\.uid\(\)\)/i);
  assert.match(migration, /from auth\.users u[\s\S]*?where u\.id = v_auth_user_id[\s\S]*?for share/i);
  assert.match(migration, /u\.email_confirmed_at is not null[\s\S]*?not coalesce\(u\.is_anonymous, false\)/i);
  assert.match(migration, /lower\(pg_catalog\.btrim\(coalesce\(c\.email, ''\)\)\) = v_auth_email/i);
  assert.doesNotMatch(migration.match(/create or replace function[\s\S]*?returns table/i)?.[0] ?? '', /auth_user_id\s+(?:text|uuid)/i);
});

test('CPF/CNPJ is only a tenant-scoped conflict check and never ownership proof', () => {
  const documentConflictBlock = migration.match(
    /-- A matching document[\s\S]*?\n  end if;\n\n  if v_customer_id is null then/i,
  )?.[0] ?? '';
  assert.match(documentConflictBlock, /only a conflict check/i);
  assert.match(documentConflictBlock, /never selects the[\s\S]*?customer that will be linked/i);
  assert.match(documentConflictBlock, /where c\.company_id = p_company_id[\s\S]*?regexp_replace\(coalesce\(c\.document, ''\)/i);
  assert.match(documentConflictBlock, /v_customer_id is null[\s\S]*?not \(v_customer_id = any\(v_candidate_ids\)\)/i);
  assert.doesNotMatch(documentConflictBlock, /v_customer_id\s*:=\s*v_candidate_ids\[1\]/i);
});

test('RPC is tenant-scoped, hardened and exposes only the current overload', () => {
  assert.match(migration, /if not private\.company_matches_request_host\(p_company_id\) then/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /revoke all on function public\.ensure_store_customer_account[\s\S]*?from public, anon/i);
  assert.match(migration, /grant execute on function public\.ensure_store_customer_account[\s\S]*?to authenticated/i);
  assert.match(migration, /historical ten-argument overload[\s\S]*?drop function if exists public\.ensure_store_customer_account/i);
});

test('ownership writes are serialized, reassignment-safe and auditable without PII metadata', () => {
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*?store-account-auth:/i);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*?store-account-email:/i);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*?store-account-document:/i);
  assert.match(migration, /c\.auth_user_id is null or c\.auth_user_id = v_auth_user_id/i);
  assert.match(migration, /on conflict \(company_id, auth_user_id\)[\s\S]*?where public\.store_customer_accounts\.customer_id = excluded\.customer_id/i);
  assert.match(migration, /'customer\.store_account_linked'[\s\S]*?'identity_proof', 'confirmed_auth_email'/i);
  const auditMetadata = migration.match(/'identity_proof', 'confirmed_auth_email'[\s\S]*?\)\s*\n\s*\);/i)?.[0] ?? '';
  assert.doesNotMatch(auditMetadata, /document|phone|v_auth_email/i);
});

test('Store browser caller supplies profile fields but cannot supply email or actor identity', () => {
  const rpcCall = storeContext.match(/supabase\.rpc\('ensure_store_customer_account',[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  assert.match(rpcCall, /p_company_id:/);
  assert.match(rpcCall, /p_document:/);
  assert.doesNotMatch(rpcCall, /p_email|p_auth_user_id|auth_user_id:/i);
});
