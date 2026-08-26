import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20260826213807_fix_quote_order_production_initial_enqueue.sql', import.meta.url),
  'utf8'
);
const context = await readFile(new URL('../src/context/database-context.tsx', import.meta.url), 'utf8');
const quotesPage = await readFile(new URL('../src/app/(dashboard)/quotes/page.tsx', import.meta.url), 'utf8');

const command = migration.match(
  /create or replace function public\.approve_quote_and_create_order\(p_quote_id text\)[\s\S]+?\n\$\$;/i
)?.[0] || '';

test('quote approval is one hardened server-side transaction', () => {
  assert.match(command, /language plpgsql[\s\S]+security definer[\s\S]+set search_path = ''/i);
  assert.match(command, /private\.current_company_id\(\)/i);
  assert.match(command, /auth\.uid\(\)/i);
  assert.match(command, /current_user_can_access_path\('\/quotes'\)/i);
  assert.match(migration, /revoke all on function public\.approve_quote_and_create_order\(text\)[\s\S]+from public, anon/i);
  assert.match(migration, /grant execute on function public\.approve_quote_and_create_order\(text\)[\s\S]+to authenticated/i);
});

test('the command locks the tenant quote before checking or creating its order', () => {
  assert.match(command, /from public\.quotes q[\s\S]+q\.company_id = v_company_id[\s\S]+for update/i);
  const lockPosition = command.search(/for update/i);
  const insertPosition = command.search(/insert into public\.orders/i);
  assert.ok(lockPosition >= 0 && insertPosition > lockPosition);
});

test('idempotency returns the existing linked order and inserts only when absent', () => {
  assert.match(command, /where o\.company_id = v_company_id[\s\S]+o\.source_quote_id = v_quote\.id/i);
  assert.match(command, /if not found then[\s\S]+insert into public\.orders/i);
  assert.match(command, /source_quote_id[\s\S]+v_quote\.id/i);
  assert.equal((command.match(/insert into public\.orders/gi) || []).length, 1);
});

test('new conversions require an approvable quote with a customer and at least one item', () => {
  assert.match(command, /v_quote\.status is null[\s\S]+v_quote\.status not in \('rascunho', 'pendente', 'aprovado'\)[\s\S]+QUOTE_STATUS_NOT_APPROVABLE/i);
  assert.match(command, /v_quote\.customer_id is null[\s\S]+QUOTE_CUSTOMER_REQUIRED/i);
  assert.match(command, /not exists \([\s\S]+from public\.quote_items qi[\s\S]+qi\.quote_id = v_quote\.id[\s\S]+QUOTE_ITEMS_REQUIRED/i);
});

test('an existing order is idempotent only for an already approved quote', () => {
  assert.match(command, /if found then[\s\S]+v_quote\.status is distinct from 'aprovado'[\s\S]+QUOTE_ORDER_STATE_CONFLICT[\s\S]+else/i);
});

test('approved commercial values and item snapshots are copied without repricing', () => {
  assert.match(command, /v_quote\.total_amount/i);
  assert.match(command, /coalesce\(v_quote\.delivery_fee, 0\)/i);
  assert.match(command, /coalesce\(v_quote\.additional_services, '\[\]'::jsonb\)/i);
  assert.match(command, /qi\.quantity,[\s\S]+qi\.unit_price,[\s\S]+qi\.total_price,[\s\S]+qi\.details/i);
  assert.doesNotMatch(command, /resolveProductPrice|pricing_type|sales_price/i);
});

test('customer and product references cannot cross tenant boundaries', () => {
  assert.match(command, /public\.customers c[\s\S]+c\.id = v_quote\.customer_id[\s\S]+c\.company_id = v_company_id/i);
  assert.match(command, /public\.quote_items qi[\s\S]+join public\.products p[\s\S]+p\.company_id <> v_company_id/i);
  assert.match(command, /QUOTE_CUSTOMER_TENANT_MISMATCH/i);
  assert.match(command, /QUOTE_PRODUCT_TENANT_MISMATCH/i);
});

test('conversion keeps the payment status and atomically enqueues production', () => {
  assert.match(command, /'aguardando_pagamento'/i);
  assert.match(command, /private\.ensure_production_queue_for_order\(v_order\.id, v_company_id\)/i);
  assert.match(command, /'production', v_production/i);
  assert.doesNotMatch(command, /financial_transactions/i);
});

test('the canonical production helper admits only approved quote conversions at the waiting status', () => {
  const helper = migration.match(
    /create or replace function private\.ensure_production_queue_for_order[\s\S]+?\n\$\$;/i
  )?.[0] || '';
  assert.match(helper, /o\.status = 'aguardando_pagamento'/i);
  assert.match(helper, /o\.source_quote_id is not null/i);
  assert.match(helper, /q\.id = o\.source_quote_id[\s\S]+q\.company_id = o\.company_id[\s\S]+q\.status = 'aprovado'/i);
  assert.match(helper, /on conflict \(company_id, order_item_id\) do nothing/i);
  assert.doesNotMatch(helper, /set[\s\S]{0,300}status\s*=/i);
});

test('the confirmed PED-0025 repair is exact, idempotent and fails closed for partial state', () => {
  assert.match(migration, /regexp_replace\(coalesce\(c\.document, ''\), '\\D', '', 'g'\) = '30807938000189'/i);
  assert.match(migration, /upper\(btrim\(o\.number\)\) = 'PED-0025'/i);
  assert.match(migration, /q\.number = 1026[\s\S]+q\.status = 'aprovado'/i);
  assert.match(migration, /v_candidate_count = 0[\s\S]+return/i);
  assert.match(migration, /v_candidate_count <> 1[\s\S]+PED_0025_TARGET_AMBIGUOUS/i);
  assert.match(migration, /v_existing_count = v_item_count and v_sets_match[\s\S]+return/i);
  assert.match(migration, /not exists \([\s\S]+public\.order_items[\s\S]+not exists \([\s\S]+public\.production_queue/i);
  assert.match(migration, /v_existing_count <> 0[\s\S]+PED_0025_PRODUCTION_PARTIAL_STATE/i);
  assert.match(migration, /private\.ensure_production_queue_for_order\(v_order_id, v_company_id\)/i);
  assert.match(migration, /production\.queue_repaired[\s\S]+targeted_idempotent_repair_20260826213807/i);
  assert.doesNotMatch(migration.match(/do \$\$[\s\S]+?\n\$\$;/i)?.[0] || '', /update\s+public\.production_queue|delete\s+from\s+public\.production_queue/i);
});

test('repeat approval is a no-op for the quote status and therefore for audit triggers', () => {
  assert.match(command, /if v_quote\.status <> 'aprovado' then[\s\S]+update public\.quotes/i);
  assert.equal((command.match(/update public\.quotes/gi) || []).length, 1);
});

test('the client calls only the canonical approval RPC and updates both aggregates', () => {
  const approveQuote = context.match(/const approveQuote = async \(id: string\) => \{[\s\S]+?\n  \};/i)?.[0] || '';
  assert.match(approveQuote, /await supabase\.rpc\('approve_quote_and_create_order'/i);
  assert.match(approveQuote, /upsertQuoteState/i);
  assert.match(approveQuote, /upsertOrderState/i);
  assert.match(approveQuote, /applyProductionQueueState\(payload\.production \|\| \[\]\)/i);
  assert.doesNotMatch(approveQuote, /applyProductionQueueInsertions|adjustStock/i);
  assert.doesNotMatch(approveQuote, /from\(['"]orders['"]\)\.(insert|upsert)/i);
  assert.match(approveQuote, /Nenhuma alteração foi concluída/i);
});

test('the approval UI prevents local re-entry and always releases loading', () => {
  assert.match(quotesPage, /if \(approvingQuoteId\) return/i);
  assert.match(quotesPage, /setApprovingQuoteId\(quoteId\)[\s\S]+await approveQuote\(quoteId\)[\s\S]+finally[\s\S]+setApprovingQuoteId\(null\)/i);
  assert.match(quotesPage, /type="button"[\s\S]+Aprovar este orçamento e gerar o Pedido\?/i);
  assert.equal((quotesPage.match(/quote\.status === 'rascunho' \|\| quote\.status === 'pendente'/g) || []).length, 2);
});

test('approval remains independent from WhatsApp and browser-generated order numbers', () => {
  assert.doesNotMatch(command, /whatsapp/i);
  assert.match(command, /private\.next_order_number\(v_company_id\)/i);
  assert.doesNotMatch(context.match(/const approveQuote = async \(id: string\) => \{[\s\S]+?\n  \};/i)?.[0] || '', /whatsapp|ORD-|PED-/i);
});
