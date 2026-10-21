import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { requireStoreTestSession } from './lib/store-test-session.mjs';

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseContainer = process.env.SUPABASE_DB_CONTAINER;
const appUrl = process.env.STORE_ACCOUNT_APP_URL;
const fixtureHost = 'store-link-local.example.test';

assert.ok(supabaseUrl, 'SUPABASE_URL is required');
assert.ok(anonKey, 'SUPABASE_ANON_KEY is required');
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required');
assert.ok(databaseContainer, 'SUPABASE_DB_CONTAINER is required');
assert.equal(databaseContainer, 'supabase_db_PrintFlowPRO', 'only the PrintFlowPRO local fixture DB is allowed');
assert.ok(appUrl, 'STORE_ACCOUNT_APP_URL is required');
for (const url of [supabaseUrl, appUrl]) assert.ok(['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'local URLs only');

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const runId = randomUUID();
const suffix = runId.slice(0, 8);
const ownerEmail = `store-link-owner-${suffix}@example.test`;
const attackerEmail = `store-link-attacker-${suffix}@example.test`;
const ownerPassword = randomBytes(24).toString('base64url');
const attackerPassword = randomBytes(24).toString('base64url');
const document = `8${Date.now().toString().slice(-10)}`;
const authUserIds = [];
const companyIds = [];
let customerId = null;
let otherTenantCustomerId = null;

const publicClient = () => createClient(supabaseUrl, anonKey, {
  global: { headers: { Origin: 'http://127.0.0.1:3000' } },
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const requireData = (result, label) => {
  assert.equal(result.error, null, `${label}: ${result.error?.message ?? 'unknown error'}`);
  return result.data;
};

const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const psql = (sql) => execFileSync(
  'docker',
  ['exec', '-i', databaseContainer, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-qAt'],
  { encoding: 'utf8', input: sql },
).trim();

const cleanup = async () => {
  if (authUserIds.length) {
    const authList = authUserIds.map(sqlLiteral).join(',');
    const emailList = [ownerEmail, attackerEmail].map(sqlLiteral).join(',');
    const discoveredCompanies = psql(`
      select distinct company_id
      from public.profiles
      where auth_user_id in (${authList})
      order by company_id;
    `).split(/\r?\n/).filter(Boolean);
    companyIds.push(...discoveredCompanies.filter((id) => !companyIds.includes(id)));
    const companyList = companyIds.map(sqlLiteral).join(',') || "''";

    psql(`
      begin;
      delete from public.customer_consents where auth_user_id in (${authList});
      delete from public.privacy_audit_events where auth_user_id in (${authList});
      delete from public.store_customer_accounts where auth_user_id in (${authList});
      delete from public.customers where auth_user_id in (${authList}) or lower(email) in (${emailList});
      delete from public.profiles where auth_user_id in (${authList});
      delete from public.role_permissions where company_id in (${companyList});
      delete from public.settings where company_id in (${companyList});
      delete from public.audit_logs where company_id in (${companyList});
      delete from public.companies where id in (${companyList});
      commit;
    `);
  }

  for (const authUserId of authUserIds.toReversed()) {
    await admin.auth.admin.deleteUser(authUserId);
  }
};

try {
  const owner = requireData(await admin.auth.admin.createUser({
    email: ownerEmail,
    password: ownerPassword,
    email_confirm: true,
    user_metadata: { name: `Store Link Owner ${suffix}`, company_name: `Store Link Test ${suffix}` },
  }), 'create owner').user;
  authUserIds.push(owner.id);
  const attacker = requireData(await admin.auth.admin.createUser({
    email: attackerEmail,
    password: attackerPassword,
    email_confirm: true,
    user_metadata: { name: `Store Link Attacker ${suffix}`, company_name: `Store Link Attacker ${suffix}` },
  }), 'create attacker').user;
  authUserIds.push(attacker.id);

  const authList = authUserIds.map(sqlLiteral).join(',');
  const profiles = psql(`
    select auth_user_id::text || '|' || company_id
    from public.profiles
    where auth_user_id in (${authList})
    order by auth_user_id;
  `).split(/\r?\n/).filter(Boolean).map((row) => {
    const [auth_user_id, company_id] = row.split('|');
    return { auth_user_id, company_id };
  });
  assert.equal(profiles.length, 2, 'both local Auth users must have provisioned profiles');
  companyIds.push(...new Set(profiles.map((profile) => profile.company_id)));
  const companyId = profiles.find((profile) => profile.auth_user_id === owner.id)?.company_id;
  assert.ok(companyId, 'owner tenant was not provisioned');
  psql(`update public.companies set store_domain = ${sqlLiteral(fixtureHost)} where id = ${sqlLiteral(companyId)};`);
  const otherCompanyId = profiles.find((profile) => profile.auth_user_id === attacker.id)?.company_id;
  assert.ok(otherCompanyId && otherCompanyId !== companyId);
  const otherHost = `store-link-other-${suffix}.example.test`;
  psql(`update public.companies set store_domain = ${sqlLiteral(otherHost)} where id = ${sqlLiteral(otherCompanyId)};`);
  otherTenantCustomerId = psql(`
    insert into public.customers(company_id,name,document,email,phone,address,tags,notes)
    values (${sqlLiteral(otherCompanyId)},'Other tenant fixture',${sqlLiteral(document)},${sqlLiteral(ownerEmail)},'', '{}',
      array['TEST_STORE_ACCOUNT_LINK_CONCURRENCY'],'Local disposable tenant fixture.') returning id;
  `);

  customerId = psql(`
    insert into public.customers (
      company_id, auth_user_id, customer_type, name, legal_name, document,
      email, phone, whatsapp, address, tags, notes
    ) values (
      ${sqlLiteral(companyId)}, null, 'fisica', ${sqlLiteral(`Concurrency Fixture ${suffix}`)},
      ${sqlLiteral(`Concurrency Fixture ${suffix}`)}, ${sqlLiteral(document)}, ${sqlLiteral(ownerEmail)},
      '71999990000', '71999990000', '{}'::jsonb,
      array['TEST_STORE_ACCOUNT_LINK_CONCURRENCY'], 'Local disposable concurrency fixture.'
    ) returning id;
  `);

  const ownerClient = publicClient();
  const attackerClient = publicClient();
  requireData(await ownerClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword }), 'sign in owner');
  requireData(await attackerClient.auth.signInWithPassword({ email: attackerEmail, password: attackerPassword }), 'sign in attacker');
  const ownerToken = await requireStoreTestSession(ownerClient);
  const attackerToken = await requireStoreTestSession(attackerClient);

  const rpcArgs = {
    p_name: `Concurrency Fixture ${suffix}`,
    p_customer_type: 'fisica',
    p_document: document,
    p_phone: '71999990000',
    p_whatsapp: null,
    p_trade_name: null,
    p_birth_date: null,
    p_contact_preference: 'whatsapp',
    p_privacy_policy_version: '2026-06',
    p_terms_version: '2026-06',
    p_marketing_email_granted: false,
    p_marketing_whatsapp_granted: false,
  };

  const ensure = async (token, profile = rpcArgs, extraHeaders = {}) => {
    const response = await fetch(new URL('/api/store/customer-account', appUrl), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extraHeaders },
      body: JSON.stringify(profile)
    });
    return { status: response.status, body: await response.json() };
  };
  const [ownerResult, attackerResult] = await Promise.all([
    ensure(ownerToken), ensure(attackerToken, { ...rpcArgs, p_name: `Attacker ${suffix}` })
  ]);

  assert.equal(ownerResult.status, 200, `legitimate concurrent link failed: ${JSON.stringify(ownerResult.body)}`);
  assert.equal(attackerResult.status, 409);
  assert.equal(attackerResult.body.error, 'Nao foi possivel concluir o cadastro.');
  const retries = await Promise.all([ensure(ownerToken), ensure(ownerToken)]);
  assert.ok(retries.every((result) => result.status === 200 && result.body.account_id === ownerResult.body.account_id));
  assert.equal((await ensure(attackerToken)).status, 409, 'later attacker cannot overwrite the owner');
  for (const headers of [
    {}, { Origin: `https://${otherHost}` }, { Referer: `https://${otherHost}/store` },
    { 'X-Forwarded-Host': otherHost }, { Origin: 'invalid', 'X-Store-Host': otherHost },
    { Origin: `https://${otherHost}`, Referer: `https://${otherHost}/store`, 'X-Forwarded-Host': otherHost }
  ]) {
    const result = await ensure(ownerToken, rpcArgs, headers);
    assert.equal(result.status, 200, 'spoofing context must not change the routed tenant');
    assert.equal(result.body.customer_id, customerId);
  }
  assert.equal((await ensure(ownerToken, { ...rpcArgs, p_company_id: otherCompanyId })).status, 400);
  assert.equal(psql(`select coalesce(auth_user_id::text,'NULL') from public.customers where id = ${sqlLiteral(otherTenantCustomerId)};`), 'NULL');
  assert.equal(psql(`select count(*) from public.store_customer_accounts where customer_id = ${sqlLiteral(otherTenantCustomerId)};`), '0');
  const newSessionClient = publicClient();
  requireData(await newSessionClient.auth.signInWithPassword({ email: ownerEmail, password: ownerPassword }), 'fresh owner session');
  const newToken = await requireStoreTestSession(newSessionClient);
  assert.equal((await ensure(newToken)).body.account_id, ownerResult.body.account_id, 'fresh session preserves account');
  const direct = await attackerClient.rpc('ensure_store_customer_account', { ...rpcArgs, p_company_id: companyId });
  assert.equal(direct.error?.code, '42501', 'direct legacy RPC must be revoked');
  const directWrapper = await attackerClient.rpc('ensure_store_customer_account_from_server', {
    p_store_hostname: fixtureHost, p_actor_user_id: owner.id, p_profile: rpcArgs
  });
  assert.equal(directWrapper.error?.code, '42501', 'direct wrapper spoof must be revoked');

  const finalAuthUserId = psql(`select auth_user_id::text from public.customers where id = ${sqlLiteral(customerId)};`);
  assert.equal(finalAuthUserId, owner.id, 'concurrent attacker must never own the customer');

  const accounts = psql(`
    select auth_user_id::text
    from public.store_customer_accounts
    where customer_id = ${sqlLiteral(customerId)}
    order by id;
  `).split(/\r?\n/).filter(Boolean);
  assert.equal(accounts.length, 1, 'concurrent calls must create exactly one Store account');
  assert.equal(accounts[0], owner.id, 'the unique Store account must belong to the verified owner');
  assert.equal(psql(`select company_id from public.customers where id = ${sqlLiteral(customerId)};`), companyId);
  assert.equal(psql(`select count(*) from public.audit_logs where entity_id = ${sqlLiteral(customerId)} and action = 'customer.store_account_linked';`), '1');

  console.log('STORE_ACCOUNT_LINK_CONCURRENCY=PASS');
  console.log(`FINAL_ACCOUNT_COUNT=${accounts.length}`);
  console.log('ATTACKER_LINKED=false');
  console.log('TENANT_HEADER_SPOOFING=PASS');
  console.log('AUDIT_LINK_COUNT=1');
} finally {
  await cleanup();
}
