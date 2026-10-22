-- Finance 2: extend the existing book, never introduce a second balance/ledger.
create table public.financial_accounts (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 name text not null check(length(btrim(name)) between 1 and 100), institution text not null default '',
 kind text not null check(kind in ('bank','cash','clearing')), active boolean not null default true,
 system_key text, notes text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id), unique(company_id,system_key)
);
create table public.financial_categories (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 name text not null check(length(btrim(name)) between 1 and 100), type text not null check(type in ('receita','despesa')),
 active boolean not null default true, created_at timestamptz not null default now(), unique(company_id,id), unique(company_id,type,name)
);
-- Private managerial configuration. settings.tax_rate remains the existing pricing source.
create table public.finance_settings (
 company_id text primary key references public.companies(id), tax_regime text not null default 'nao_informado'
 check(tax_regime in ('nao_informado','simples_nacional','lucro_presumido','lucro_real','outro')),
 fees jsonb not null default '{}' check(jsonb_typeof(fees)='object'), loss_rate numeric not null default 0 check(loss_rate between 0 and 100),
 variable_rate numeric not null default 0 check(variable_rate between 0 and 100),
 contribution_margin numeric check(contribution_margin>0 and contribution_margin<=100),
 revenue_target numeric not null default 0 check(revenue_target between 0 and 9999999999), profit_target numeric not null default 0 check(profit_target between 0 and 9999999999),
 updated_at timestamptz not null default now()
);
-- Command receipts only: no monetary balance or independently calculated ledger.
create table private.finance_commands (
 company_id text not null references public.companies(id), operation_id uuid not null, action text not null,
 payload jsonb not null, result jsonb not null, actor uuid not null, created_at timestamptz not null default now(),
 primary key(company_id,operation_id)
);
alter table private.finance_commands enable row level security;
revoke all on private.finance_commands from public,anon,authenticated;
alter table public.financial_transactions
 add column account_id uuid,
 add column category_id uuid,
 add column supplier_id text references public.suppliers(id),
 add column source text not null default 'legacy',
 add column entry_role text not null default 'movement' check(entry_role in ('movement','payable')),
 add column economic_kind text not null default 'operating' check(economic_kind in ('operating','capital','transfer','opening','adjustment')),
 add column payable_id text references public.financial_transactions(id),
 add column reversal_of text references public.financial_transactions(id),
 add column reversed_at timestamptz,
 add column cancelled_at timestamptz,
 add column transfer_id uuid,
 add column competency_date date,
 add column actor_user_id uuid,
 add column notes text not null default '',
 add column is_fixed boolean not null default false,
 add column recurrence text not null default 'none' check(recurrence in ('none','weekly','monthly','yearly')),
 add column recurrence_parent_id text references public.financial_transactions(id),
 add constraint financial_account_tenant_fk foreign key(company_id,account_id) references public.financial_accounts(company_id,id),
 add constraint financial_category_tenant_fk foreign key(company_id,category_id) references public.financial_categories(company_id,id);
create unique index finance_reversal_once on public.financial_transactions(reversal_of) where reversal_of is not null;
create unique index finance_recurrence_once on public.financial_transactions(recurrence_parent_id,due_date) where recurrence_parent_id is not null;
create index finance_account_cash on public.financial_transactions(company_id,account_id,paid_at) where status='pago';
create index finance_payables_due on public.financial_transactions(company_id,due_date) where type='despesa';
create index finance_payable_link on public.financial_transactions(payable_id) where payable_id is not null;

create function private.finance_default_account(p_company text,p_cash boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 insert into public.financial_accounts(company_id,name,kind,system_key,notes)
 values(p_company,case when p_cash then 'Caixa físico' else 'Valores sem conciliação bancária' end,
 case when p_cash then 'cash' else 'clearing' end,case when p_cash then 'cash' else 'unallocated' end,
 'Conta de integração do livro existente. Não representa saldo bancário conciliado.')
 on conflict(company_id,system_key) do nothing;
 select id into v_id from public.financial_accounts where company_id=p_company and system_key=case when p_cash then 'cash' else 'unallocated' end;
 return v_id;
end $$;
revoke all on function private.finance_default_account(text,boolean) from public,anon,authenticated;

-- Preserve historical amounts and dates. Do not invent a bank reconciliation or opening float.
update public.financial_transactions set account_id=private.finance_default_account(company_id,payment_method='dinheiro'),
 source=case when order_id is not null or order_number is not null then 'order_payment' when category in ('Operações de Caixa','Ajuste de Caixa') then 'pdv' else 'legacy' end,
 economic_kind=case when category='Operações de Caixa' then 'capital' when category='Ajuste de Caixa' then 'adjustment' else 'operating' end,
 competency_date=due_date;
alter table public.financial_transactions alter column account_id set not null;

create function private.finance_validate_entry() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and (old.type='despesa' or old.entry_role='payable' or old.source in ('transfer','opening','manual','accounts_payable','reversal'))
    and current_setting('printflow.finance_command',true) is distinct from 'on' then
  raise exception 'Use finance command for managed entries' using errcode='42501';
 end if;
 if new.account_id is null then new.account_id:=private.finance_default_account(new.company_id,new.payment_method='dinheiro'); end if;
 -- PDV owns the physical cash session while open. Never let a finance command
 -- create a book movement that its closing calculation would count again.
 if tg_op='INSERT' and new.entry_role='movement' and new.status='pago'
    and current_setting('printflow.finance_command',true)='on'
    and exists(select 1 from public.financial_accounts where id=new.account_id and system_key='cash') then
  perform id from public.cash_register_sessions where company_id=new.company_id and status='aberto' for update;
  if found then raise exception 'Caixa físico com sessão aberta: use o PDV ou encerre a sessão antes de movimentar pelo Financeiro.' using errcode='22023'; end if;
 end if;
 if new.source='legacy' and (new.order_id is not null or new.order_number is not null) then new.source:='order_payment'; end if;
 if new.source='legacy' and new.category in ('Operações de Caixa','Ajuste de Caixa') then
  new.source:='pdv'; new.economic_kind:=case when new.category='Operações de Caixa' then 'capital' else 'adjustment' end;
 end if;
 if tg_op='INSERT' then new.actor_user_id:=auth.uid(); end if;
 new.competency_date:=coalesce(new.competency_date,new.due_date);
 if new.supplier_id is not null and not exists(select 1 from public.suppliers where id=new.supplier_id and company_id=new.company_id) then raise exception 'Invalid supplier' using errcode='23514'; end if;
 if new.order_id is not null and not exists(select 1 from public.orders where id=new.order_id and company_id=new.company_id) then raise exception 'Invalid order' using errcode='23514'; end if;
 if new.payable_id is not null and not exists(select 1 from public.financial_transactions where id=new.payable_id and company_id=new.company_id and entry_role='payable') then raise exception 'Invalid payable' using errcode='23514'; end if;
 if new.reversal_of is not null and not exists(select 1 from public.financial_transactions where id=new.reversal_of and company_id=new.company_id and account_id=new.account_id) then raise exception 'Invalid reversal' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function private.finance_validate_entry() from public,anon,authenticated;
create trigger finance_validate_entry before insert or update on public.financial_transactions for each row execute function private.finance_validate_entry();

-- Match the existing UI permission key, including explicitly configured denials.
create function private.finance_can_access() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.role=any(coalesce(r.roles,array['admin','gerente','financeiro']::text[]))
 from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path='/financial'
 where p.auth_user_id=(select auth.uid()) and p.active order by p.id limit 1),false)
$$;
revoke all on function private.finance_can_access() from public,anon;
grant execute on function private.finance_can_access() to authenticated;
-- Keep the legacy response contract, with the same configured permission boundary.
alter function public.settle_financial_transaction(text,text,timestamptz) rename to settle_financial_transaction_phase4b;
revoke all on function public.settle_financial_transaction_phase4b(text,text,timestamptz) from public,anon,authenticated;
create function public.settle_financial_transaction(p_transaction_id text,p_status text,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.finance_can_access() then return jsonb_build_object('status','NOT_AUTHORIZED'); end if;
 return public.settle_financial_transaction_phase4b(p_transaction_id,p_status,p_expected_updated_at);
end $$;
revoke all on function public.settle_financial_transaction(text,text,timestamptz) from public,anon;
grant execute on function public.settle_financial_transaction(text,text,timestamptz) to authenticated;

do $$ declare t text; begin
 foreach t in array array['financial_accounts','financial_categories','finance_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy finance_read on public.%I for select to authenticated using (company_id=(select private.current_company_id()) and (select private.finance_can_access()))',t);
 end loop;
end $$;
-- Orders/PDV may still read their receipts, never bank accounts or other movements.
drop policy tenant_financial_transactions_select on public.financial_transactions;
drop policy if exists tenant_financial_all on public.financial_transactions;
create policy tenant_financial_transactions_select on public.financial_transactions for select to authenticated using
 (company_id=(select private.current_company_id()) and ((select private.finance_can_access()) or
 ((order_id is not null or order_number is not null) and ((select private.current_user_can_access_path('/orders')) or (select private.current_user_can_access_path('/pos'))))));
revoke insert,update,delete on public.financial_transactions from authenticated;

create function private.finance_audit(p_action text,p_entity text,p_id text,p_old jsonb,p_new jsonb,p_operation uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype;
begin
 select * into strict a from public.profiles where auth_user_id=auth.uid() and active order by id limit 1;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
 values(a.company_id,auth.uid(),a.id,a.name,a.role,p_action,p_entity,p_id,'financial',coalesce(p_old,'{}'),coalesce(p_new,'{}'),jsonb_build_object('operation_id',p_operation));
end $$;
revoke all on function private.finance_audit(text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;

create function public.finance_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 c text:=private.current_company_id(); receipt private.finance_commands%rowtype;
 a public.financial_accounts%rowtype; b public.financial_accounts%rowtype; f public.financial_transactions%rowtype; movement public.financial_transactions%rowtype;
 v_id text; v_result jsonb; v_old jsonb; v_amount numeric; v_date date; v_method text; v_category text; v_category_id uuid;
 v_account uuid; v_paid boolean; v_kind text; v_next date; v_action text:=p_action; v_settings public.finance_settings%rowtype; v_fee record;
begin
 if auth.uid() is null or c is null or not private.finance_can_access() then raise exception 'Finance access denied' using errcode='42501'; end if;
 if p_operation_id is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('finance:'||c,0));
 perform set_config('printflow.finance_command','on',true);
 select * into receipt from private.finance_commands where company_id=c and operation_id=p_operation_id;
 if found then
  if receipt.action<>p_action or receipt.payload<>p_payload then raise exception 'Operation key reused' using errcode='22023'; end if;
  perform set_config('printflow.finance_command','off',true);
  return receipt.result;
 end if;
 v_amount:=round(nullif(p_payload->>'amount','')::numeric,2); v_account:=nullif(p_payload->>'account_id','')::uuid;
 v_date:=coalesce(nullif(p_payload->>'date','')::date,(now() at time zone 'America/Bahia')::date);
 v_method:=coalesce(nullif(p_payload->>'method',''),'pix');
 if v_method not in ('pix','dinheiro','cartao_credito','cartao_debito','boleto','faturado') then raise exception 'Invalid payment method' using errcode='22023'; end if;

 if p_action in ('account_create','account_update') then
  if length(btrim(coalesce(p_payload->>'name',''))) not between 1 and 100 or coalesce(p_payload->>'kind','bank') not in ('bank','cash','clearing') or (p_action='account_create' and p_payload->>'kind'='clearing') then raise exception 'Invalid account' using errcode='22023'; end if;
  if p_action='account_create' then
   insert into public.financial_accounts(company_id,name,institution,kind,notes) values(c,btrim(p_payload->>'name'),left(coalesce(p_payload->>'institution',''),120),coalesce(p_payload->>'kind','bank'),left(coalesce(p_payload->>'notes',''),1000)) returning * into a;
   if coalesce(v_amount,0)<>0 then
    if abs(v_amount)>9999999999 then raise exception 'Invalid opening amount' using errcode='22023'; end if;
    insert into public.financial_transactions(company_id,account_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,economic_kind)
    values(c,a.id,case when v_amount>0 then 'receita' else 'despesa' end,'Saldo inicial',abs(v_amount),'Saldo inicial · '||a.name,'dinheiro','pago',v_date,v_date::timestamp at time zone 'America/Bahia','opening','opening');
   end if;
  else
   select * into a from public.financial_accounts where id=(p_payload->>'id')::uuid and company_id=c for update;
   if not found then raise exception 'Account not found' using errcode='P0002'; end if;
   if a.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Stale account' using errcode='40001'; end if;
   v_old:=to_jsonb(a);
   if a.system_key is not null and (not coalesce((p_payload->>'active')::boolean,true) or p_payload->>'kind'<>a.kind) then raise exception 'Integration account cannot be blocked or change kind' using errcode='22023'; end if;
   update public.financial_accounts set name=btrim(p_payload->>'name'),institution=left(coalesce(p_payload->>'institution',''),120),active=coalesce((p_payload->>'active')::boolean,true),notes=left(coalesce(p_payload->>'notes',''),1000),updated_at=clock_timestamp() where id=a.id returning * into a;
  end if;
  v_id:=a.id::text; v_result:=jsonb_build_object('account',to_jsonb(a));
  perform private.finance_audit(case when p_action='account_create' then 'finance.bank_account_created' when not a.active then 'finance.bank_account_blocked' else 'finance.bank_account_updated' end,'financial_accounts',v_id,v_old,to_jsonb(a),p_operation_id);
 elsif p_action='category_create' then
  insert into public.financial_categories(company_id,name,type) values(c,btrim(p_payload->>'name'),p_payload->>'type') returning id::text into v_id;
  v_result:=jsonb_build_object('id',v_id);
  perform private.finance_audit('finance.category_created','financial_categories',v_id,null,p_payload,p_operation_id);
 elsif p_action='settings_save' then
  select * into v_settings from public.finance_settings where company_id=c for update;
  if found and v_settings.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Stale settings' using errcode='40001'; end if;
  v_old:=coalesce(to_jsonb(v_settings),'{}');
  for v_fee in select * from jsonb_each_text(coalesce(p_payload->'fees','{}')) loop
   if v_fee.key not in ('pix','dinheiro','cartao_credito','cartao_debito','boleto','faturado') or v_fee.value is null or v_fee.value::numeric not between 0 and 100 then raise exception 'Invalid fee' using errcode='22023'; end if;
  end loop;
  if p_payload->>'tax_rate' is null or (p_payload->>'tax_rate')::numeric not between 0 and 100 then raise exception 'Invalid tax rate' using errcode='22023'; end if;
  insert into public.finance_settings(company_id,tax_regime,fees,loss_rate,variable_rate,contribution_margin,revenue_target,profit_target)
  values(c,p_payload->>'tax_regime',coalesce(p_payload->'fees','{}'),coalesce((p_payload->>'loss_rate')::numeric,0),coalesce((p_payload->>'variable_rate')::numeric,0),nullif(p_payload->>'contribution_margin','')::numeric,coalesce((p_payload->>'revenue_target')::numeric,0),coalesce((p_payload->>'profit_target')::numeric,0))
  on conflict(company_id) do update set tax_regime=excluded.tax_regime,fees=excluded.fees,loss_rate=excluded.loss_rate,variable_rate=excluded.variable_rate,contribution_margin=excluded.contribution_margin,revenue_target=excluded.revenue_target,profit_target=excluded.profit_target,updated_at=clock_timestamp() returning * into v_settings;
  update public.settings set tax_rate=(p_payload->>'tax_rate')::numeric where company_id=c;
  v_id:=c; v_result:=to_jsonb(v_settings);
  perform private.finance_audit('finance.settings_updated','finance_settings',c,v_old,to_jsonb(v_settings)||jsonb_build_object('tax_rate',p_payload->'tax_rate'),p_operation_id);
 elsif p_action in ('manual_create','adjust','transfer','payable_create') then
  if v_amount is null or v_amount<=0 or v_amount>9999999999 or length(btrim(coalesce(p_payload->>'description',''))) not between 1 and 500 then raise exception 'Invalid amount or description' using errcode='22023'; end if;
  -- Lock both accounts in deterministic order; all writes are one transaction.
  perform id from public.financial_accounts where company_id=c and id in (v_account,nullif(p_payload->>'destination_id','')::uuid) order by id for update;
  select * into a from public.financial_accounts where id=v_account and company_id=c and active;
  if not found then raise exception 'Active account required' using errcode='22023'; end if;
  if p_action='transfer' then
   select * into b from public.financial_accounts where id=(p_payload->>'destination_id')::uuid and company_id=c and active and id<>a.id;
   if not found then raise exception 'Different active destination required' using errcode='22023'; end if;
   insert into public.financial_transactions(company_id,account_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,economic_kind,transfer_id)
   values(c,a.id,'despesa','Transferência',v_amount,p_payload->>'description','dinheiro','pago',v_date,v_date::timestamp at time zone 'America/Bahia','transfer','transfer',p_operation_id),
         (c,b.id,'receita','Transferência',v_amount,p_payload->>'description','dinheiro','pago',v_date,v_date::timestamp at time zone 'America/Bahia','transfer','transfer',p_operation_id);
   v_id:=p_operation_id::text; v_result:=jsonb_build_object('id',v_id);
   perform private.finance_audit('finance.transfer_created','financial_transfer',v_id,null,jsonb_build_object('from',a.id,'to',b.id,'amount',v_amount),p_operation_id);
  else
   v_category_id:=nullif(p_payload->>'category_id','')::uuid;
   select name into v_category from public.financial_categories where id=v_category_id and company_id=c and active and type=case when p_action='payable_create' then 'despesa' else p_payload->>'type' end;
   if p_action<>'adjust' and not found then raise exception 'Active matching category required' using errcode='22023'; end if;
   v_paid:=p_action<>'payable_create'; v_kind:=case when p_action='adjust' then 'adjustment' else coalesce(p_payload->>'economic_kind','operating') end;
   if v_kind not in ('operating','capital','adjustment') or (v_kind='adjustment' and p_action<>'adjust') then raise exception 'Invalid economic classification' using errcode='22023'; end if;
   insert into public.financial_transactions(company_id,account_id,category_id,supplier_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,entry_role,economic_kind,notes,is_fixed,recurrence)
   values(c,a.id,v_category_id,nullif(p_payload->>'supplier_id',''),case when p_action='payable_create' then 'despesa' else p_payload->>'type' end,coalesce(v_category,'Ajuste auditável'),v_amount,p_payload->>'description',v_method,case when v_paid then 'pago' else 'pendente' end,v_date,case when v_paid then v_date::timestamp at time zone 'America/Bahia' end,case when p_action='payable_create' then 'accounts_payable' else 'manual' end,case when p_action='payable_create' then 'payable' else 'movement' end,v_kind,left(coalesce(p_payload->>'notes',''),1000),coalesce((p_payload->>'is_fixed')::boolean,false),coalesce(p_payload->>'recurrence','none')) returning * into f;
   v_id:=f.id; v_result:=jsonb_build_object('transaction',to_jsonb(f));
   perform private.finance_audit(case when p_action='adjust' then 'finance.bank_account_adjusted' when p_action='payable_create' then 'finance.payable_created' else 'finance.manual_movement_created' end,'financial_transactions',v_id,null,to_jsonb(f),p_operation_id);
   if p_action='payable_create' and coalesce((p_payload->>'pay_now')::boolean,false) then
    v_action:='payable_pay'; v_date:=coalesce(nullif(p_payload->>'payment_date','')::date,(now() at time zone 'America/Bahia')::date);
   end if;
  end if;
 elsif p_action not in ('payable_pay','payable_reverse','payable_cancel','payable_next') then
  raise exception 'Unknown finance action' using errcode='22023';
 end if;

 if v_action in ('payable_pay','payable_reverse','payable_cancel','payable_next') then
  if f.id is null then
   select * into f from public.financial_transactions where id=p_payload->>'id' and company_id=c and type='despesa' and payable_id is null and reversal_of is null and economic_kind='operating' for update;
   if not found then raise exception 'Payable not found' using errcode='P0002'; end if;
   if f.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Stale payable' using errcode='40001'; end if;
  end if;
  v_old:=to_jsonb(f); v_id:=f.id;
  if f.cancelled_at is not null then raise exception 'Payable cancelled' using errcode='22023'; end if;
  if v_action='payable_next' then
   if f.recurrence='none' then raise exception 'No recurrence' using errcode='22023'; end if;
   v_next:=(f.due_date+case f.recurrence when 'weekly' then interval '7 days' when 'monthly' then interval '1 month' else interval '1 year' end)::date;
   insert into public.financial_transactions(company_id,account_id,category_id,supplier_id,type,category,amount,description,payment_method,status,due_date,source,entry_role,notes,is_fixed,recurrence,recurrence_parent_id)
   values(c,f.account_id,f.category_id,f.supplier_id,'despesa',f.category,f.amount,f.description,f.payment_method,'pendente',v_next,'accounts_payable','payable',f.notes,f.is_fixed,f.recurrence,f.id)
   on conflict(recurrence_parent_id,due_date) where recurrence_parent_id is not null do nothing;
  elsif v_action='payable_cancel' then
   if f.status='pago' then raise exception 'Reverse payment before cancellation' using errcode='22023'; end if;
   update public.financial_transactions set cancelled_at=clock_timestamp() where id=f.id;
  elsif v_action='payable_pay' then
   if f.status='pago' then raise exception 'Already paid' using errcode='22023'; end if;
   select * into a from public.financial_accounts where id=coalesce(v_account,f.account_id) and company_id=c and active for update;
   if not found then raise exception 'Active account required' using errcode='22023'; end if;
   update public.financial_transactions set entry_role='payable',status='pago',account_id=a.id,paid_at=v_date::timestamp at time zone 'America/Bahia',source='accounts_payable' where id=f.id;
   insert into public.financial_transactions(company_id,account_id,category_id,supplier_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,payable_id,competency_date)
   values(c,a.id,f.category_id,f.supplier_id,'despesa',f.category,f.amount,'Pagamento · '||f.description,v_method,'pago',v_date,v_date::timestamp at time zone 'America/Bahia','accounts_payable',f.id,f.competency_date);
  else
   if f.status<>'pago' then raise exception 'Payable is not paid' using errcode='22023'; end if;
   -- Legacy paid expense becomes an obligation + original cash entry, without changing its net amount.
   if f.entry_role='movement' then
    update public.financial_transactions set entry_role='payable' where id=f.id;
    insert into public.financial_transactions(company_id,account_id,category_id,supplier_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,payable_id,competency_date)
    values(c,f.account_id,f.category_id,f.supplier_id,'despesa',f.category,f.amount,f.description,f.payment_method,'pago',f.due_date,f.paid_at,'accounts_payable',f.id,f.competency_date) returning * into movement;
   else
    select * into movement from public.financial_transactions where payable_id=f.id and reversal_of is null and reversed_at is null and status='pago' order by created_at desc limit 1 for update;
   end if;
   if movement.id is null then raise exception 'Paid movement missing' using errcode='23514'; end if;
   insert into public.financial_transactions(company_id,account_id,category_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,reversal_of,competency_date)
   values(c,movement.account_id,movement.category_id,'receita',movement.category,movement.amount,'Estorno · '||movement.description,movement.payment_method,'pago',v_date,v_date::timestamp at time zone 'America/Bahia','reversal',movement.id,movement.competency_date);
   update public.financial_transactions set reversed_at=clock_timestamp() where id=movement.id;
   update public.financial_transactions set status='pendente',paid_at=null where id=f.id;
  end if;
  select * into f from public.financial_transactions where id=v_id;
  v_result:=jsonb_build_object('transaction',to_jsonb(f));
  perform private.finance_audit(case v_action when 'payable_pay' then 'finance.payable_paid' when 'payable_reverse' then 'finance.payable_reversed' when 'payable_cancel' then 'finance.payable_cancelled' else 'finance.payable_recurrence_created' end,'financial_transactions',v_id,v_old,to_jsonb(f),p_operation_id);
 end if;
 v_result:=jsonb_build_object('status','UPDATED')||v_result;
 insert into private.finance_commands values(c,p_operation_id,p_action,p_payload,v_result,auth.uid(),clock_timestamp());
 perform set_config('printflow.finance_command','off',true);
 return v_result;
end $$;
revoke all on function public.finance_command(uuid,text,jsonb) from public,anon;
grant execute on function public.finance_command(uuid,text,jsonb) to authenticated;

-- One statement snapshot, consumed by the server read-model, never a client aggregation.
create function public.finance_source() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id(); v jsonb;
begin
 if auth.uid() is null or c is null or not private.finance_can_access() then raise exception 'Finance access denied' using errcode='42501'; end if;
 if (select count(*) from public.financial_transactions where company_id=c)>50000 or (select count(*) from public.orders where company_id=c)>50000 then raise exception 'Finance dataset requires paged aggregation' using errcode='54000'; end if;
 select jsonb_build_object(
 'transactions',coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at,f.id) from public.financial_transactions f where company_id=c),'[]'),
 'orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'customer_id',o.customer_id,'customer_name',o.customer_name,'total_amount',o.total_amount,'paid_amount',o.paid_amount,'status',o.status,'payment_status',o.payment_status,'created_at',o.created_at,'updated_at',o.updated_at)) from public.orders o where company_id=c),'[]'),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'billing_type',billing_type,'payment_terms_days',payment_terms_days)) from public.customers where company_id=c),'[]'),
 'accounts',coalesce((select jsonb_agg(to_jsonb(a) order by name) from public.financial_accounts a where company_id=c),'[]'),
 'categories',coalesce((select jsonb_agg(to_jsonb(a) order by name) from public.financial_categories a where company_id=c),'[]'),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.suppliers where company_id=c),'[]'),
 'settings',coalesce((select to_jsonb(s) from public.finance_settings s where company_id=c),'{}')||jsonb_build_object('tax_rate',coalesce((select tax_rate from public.settings where company_id=c),0))
 ) into v;
 return v;
end $$;
revoke all on function public.finance_source() from public,anon;
grant execute on function public.finance_source() to authenticated;
