import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseContainer = process.env.SUPABASE_DB_CONTAINER;

assert.ok(supabaseUrl, 'SUPABASE_URL is required');
assert.ok(anonKey, 'SUPABASE_ANON_KEY is required');
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required');
assert.ok(databaseContainer, 'SUPABASE_DB_CONTAINER is required');

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
  const attacker = requireData(await admin.auth.admin.createUser({
    email: attackerEmail,
    password: attackerPassword,
    email_confirm: true,
    user_metadata: { name: `Store Link Attacker ${suffix}`, company_name: `Store Link Attacker ${suffix}` },
  }), 'create attacker').user;
  authUserIds.push(owner.id, attacker.id);

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

  const rpcArgs = {
    p_company_id: companyId,
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

  const [ownerResult, attackerResult] = await Promise.all([
    ownerClient.rpc('ensure_store_customer_account', rpcArgs),
    attackerClient.rpc('ensure_store_customer_account', { ...rpcArgs, p_name: `Attacker ${suffix}` }),
  ]);

  assert.equal(ownerResult.error, null, `legitimate concurrent link failed: ${ownerResult.error?.message ?? ''}`);
  assert.equal(attackerResult.error?.message, 'Nao foi possivel concluir o cadastro.');

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

  console.log('STORE_ACCOUNT_LINK_CONCURRENCY=PASS');
  console.log(`FINAL_ACCOUNT_COUNT=${accounts.length}`);
  console.log('ATTACKER_LINKED=false');
} finally {
  await cleanup();
}
