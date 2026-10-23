-- Shared canonical finance cores. Existing human boundaries retain their checks and contracts.
create function private.finance_apply_order_payment(p_company text,p_order_id text,p_amount numeric,p_method text,p_payment_type text,p_paid_at timestamptz,p_notes text,p_expected_updated_at timestamptz,p_account uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id text := p_company;
  v_order public.orders%rowtype;
  v_financial public.financial_transactions%rowtype;
  v_customer public.customers%rowtype;
  v_session public.cash_register_sessions%rowtype;
  v_register public.cash_register_transactions%rowtype;
  v_payment numeric;
  v_new_paid numeric;
  v_due_days integer := 30;
  v_due_date date;
  v_paid_at timestamptz := coalesce(p_paid_at, clock_timestamp());
  v_description text;
begin

  if p_amount is null or p_amount <= 0
     or p_method not in ('pix','cartao_credito','cartao_debito','boleto','dinheiro','faturado')
     or (p_payment_type is not null and p_payment_type not in ('adiantamento','parcial','saldo','total')) then
    return jsonb_build_object('status', 'INVALID_INPUT');
  end if;

  select o.* into v_order from public.orders o
  where o.id = p_order_id and o.company_id = v_company_id for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_order.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'order', to_jsonb(v_order));
  end if;

  if p_account is not null then
    -- Verified online receipts honor the same max(cache, active ledger) balance as Finance 2.
    v_order.paid_amount:=greatest(coalesce(v_order.paid_amount,0),v_order.total_amount-private.payment_order_balance(v_company_id,v_order.id));
  end if;
  v_payment := least(greatest(v_order.total_amount - v_order.paid_amount, 0), p_amount);
  if v_payment <= 0 then return jsonb_build_object('status', 'UNCHANGED', 'order', to_jsonb(v_order)); end if;
  v_new_paid := least(v_order.total_amount, v_order.paid_amount + v_payment);

  select c.* into v_customer from public.customers c
  where c.id = v_order.customer_id and c.company_id = v_company_id for update;
  if found and v_customer.billing_type = 'faturado' and v_customer.payment_terms_days is not null then
    v_due_days := v_customer.payment_terms_days;
  end if;
  v_due_date := case when p_method = 'faturado' then current_date + v_due_days else v_paid_at::date end;
  v_description := case coalesce(p_payment_type, case when v_new_paid >= v_order.total_amount then 'saldo' else 'parcial' end)
    when 'adiantamento' then 'Adiantamento'
    when 'parcial' then 'Pagamento parcial'
    when 'total' then 'Pagamento total'
    else 'Pagamento do saldo'
  end || ' do Pedido ' || v_order.number;
  if nullif(btrim(p_notes), '') is not null then v_description := v_description || ' - ' || btrim(p_notes); end if;

  update public.orders o set
    paid_amount = case when p_method = 'faturado' then o.paid_amount else v_new_paid end,
    payment_status = case when p_method = 'faturado' then 'pendente' when v_new_paid >= o.total_amount then 'pago' else 'parcial' end,
    status = case when o.status = 'aguardando_pagamento' and (p_method = 'faturado' or v_new_paid >= o.total_amount) then 'producao' else o.status end
  where o.id = v_order.id returning o.* into v_order;

  insert into public.financial_transactions(company_id, order_id, order_number, type, category, amount,
    description, payment_method, status, due_date, paid_at, account_id)
  values (v_company_id, v_order.id, v_order.number, 'receita', 'Vendas', v_payment,
    case when p_method = 'faturado' then 'Faturamento B2B - ' || v_description || ' (' || v_due_days || ' dias)' else v_description end,
    p_method, case when p_method = 'faturado' then 'pendente' else 'pago' end,
    v_due_date, case when p_method = 'faturado' then null else v_paid_at end, p_account)
  returning * into v_financial;

  if p_method = 'faturado' and v_customer.id is not null then
    update public.customers c set credit_used = coalesce(c.credit_used, 0) + v_payment
    where c.id = v_customer.id returning c.* into v_customer;
  elsif p_method <> 'faturado' and p_account is null then
    select s.* into v_session from public.cash_register_sessions s
    where s.company_id = v_company_id and s.status = 'aberto' for update;
    if found then
      insert into public.cash_register_transactions(session_id, type, amount, description, payment_method)
      values (v_session.id, 'venda', v_payment, 'Recebimento Pedido ' || v_order.number, p_method)
      returning * into v_register;
      if p_method = 'dinheiro' then
        update public.cash_register_sessions s set expected_cash = s.expected_cash + v_payment
        where s.id = v_session.id returning s.* into v_session;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'UPDATED', 'order', to_jsonb(v_order), 'financial', to_jsonb(v_financial),
    'customer', case when v_customer.id is not null then to_jsonb(v_customer) else null end,
    'session', case when v_session.id is not null then to_jsonb(v_session) else null end,
    'register_transaction', case when v_register.id is not null then to_jsonb(v_register) else null end
  );
end;
$$;

create function private.finance_apply_receivable(p_company text,p_transaction_id text,p_status text,p_expected_updated_at timestamptz,p_account uuid,p_paid_at timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_company_id text := p_company;
  v_transaction public.financial_transactions%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
begin

  if p_status not in ('pendente','pago') then return jsonb_build_object('status', 'INVALID_INPUT'); end if;

  -- Same lock order as verified webhooks: resolve and lock the Order before its receipt.
  perform 1 from public.orders o where o.company_id=v_company_id and exists(
   select 1 from public.financial_transactions f where f.id=p_transaction_id and f.company_id=v_company_id
   and (f.order_id=o.id or (f.order_id is null and private.reports_order_key(f.order_number)=private.reports_order_key(o.number)))
  ) for update;
  select f.* into v_transaction
  from public.financial_transactions f
  where f.id = p_transaction_id and f.company_id = v_company_id
  for update;
  if not found then return jsonb_build_object('status', 'NOT_FOUND'); end if;
  if p_expected_updated_at is not null and v_transaction.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('status', 'CONFLICT', 'transaction', to_jsonb(v_transaction));
  end if;
  if v_transaction.status = p_status then
    return jsonb_build_object('status', 'UNCHANGED', 'transaction', to_jsonb(v_transaction));
  end if;

  if v_transaction.type = 'receita' and v_transaction.order_id is not null
     and v_transaction.status is distinct from p_status then
    select o.* into v_order from public.orders o
    where o.id = v_transaction.order_id and o.company_id = v_company_id for update;
    if found then
      if p_account is not null then v_order.paid_amount:=greatest(coalesce(v_order.paid_amount,0),v_order.total_amount-private.payment_order_balance(v_company_id,v_order.id)); end if;
      update public.orders o set
        paid_amount = case
          when p_status = 'pago' then least(o.total_amount, v_order.paid_amount + v_transaction.amount)
          else greatest(0, o.paid_amount - v_transaction.amount)
        end,
        payment_status = case
          when p_status = 'pago' and v_order.paid_amount + v_transaction.amount >= o.total_amount then 'pago'
          when p_status = 'pago' then 'parcial'
          when greatest(0, o.paid_amount - v_transaction.amount) = 0 then 'pendente'
          else 'parcial'
        end
      where o.id = v_order.id;

      if v_transaction.payment_method = 'faturado' then
        select c.* into v_customer from public.customers c
        where c.id = v_order.customer_id and c.company_id = v_company_id for update;
        if found then
          update public.customers c set credit_used = case
            when p_status = 'pago' then greatest(0, coalesce(c.credit_used, 0) - v_transaction.amount)
            else coalesce(c.credit_used, 0) + v_transaction.amount
          end
          where c.id = v_customer.id;
        end if;
      end if;
    end if;
  end if;

  update public.financial_transactions f set
    account_id = coalesce(p_account,f.account_id), status = p_status,
    paid_at = case when p_status = 'pago' then coalesce(p_paid_at,clock_timestamp()) else null end
  where f.id = v_transaction.id
  returning f.* into v_transaction;

  return jsonb_build_object('status', 'UPDATED', 'transaction', to_jsonb(v_transaction));
end;
$$;

revoke all on function private.finance_apply_order_payment(text,text,numeric,text,text,timestamptz,text,timestamptz,uuid),private.finance_apply_receivable(text,text,text,timestamptz,uuid,timestamptz) from public,anon,authenticated,service_role;
create or replace function public.record_order_payment_phase4b(p_order_id text,p_amount numeric,p_method text,p_payment_type text default null,p_paid_at timestamptz default null,p_notes text default null,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_company_id() is null or not private.current_user_can_access_path('/orders') then return jsonb_build_object('status','NOT_AUTHORIZED'); end if;
 return private.finance_apply_order_payment(private.current_company_id(),p_order_id,p_amount,p_method,p_payment_type,p_paid_at,p_notes,p_expected_updated_at,null);
end $$;
create or replace function public.settle_financial_transaction_phase4b(p_transaction_id text,p_status text,p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_company_id() is null or not private.current_user_can_access_path('/financial') then return jsonb_build_object('status','NOT_AUTHORIZED'); end if;
 return private.finance_apply_receivable(private.current_company_id(),p_transaction_id,p_status,p_expected_updated_at,null,null);
end $$;
revoke all on function public.record_order_payment_phase4b(text,numeric,text,text,timestamptz,text,timestamptz),public.settle_financial_transaction_phase4b(text,text,timestamptz) from public,anon,authenticated,service_role;

-- No live gateway exists. QA can only operate on an explicitly privileged fixture allowlist.
create table private.payment_qa_fixtures (
 company_id text not null references public.companies(id), order_id text primary key references public.orders(id),
 account_id uuid not null references public.financial_accounts(id), paid_at timestamptz not null, active boolean not null default true
);
create index payment_qa_company_idx on private.payment_qa_fixtures(company_id);
create index payment_qa_account_idx on private.payment_qa_fixtures(account_id);
create table private.payment_provider_config (
 provider text primary key check(provider='qa'), secret text not null default encode(extensions.gen_random_bytes(32),'hex') check(length(secret)=64)
);
insert into private.payment_provider_config(provider) values('qa');
create table public.payment_links (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 order_id text not null references public.orders(id), receivable_id text references public.financial_transactions(id),
 provider text not null check(provider='qa'), external_id text not null default gen_random_uuid()::text,
 token_hash text not null unique, amount numeric(14,2) not null check(amount>0), currency text not null default 'BRL' check(currency='BRL'),
 status text not null default 'active' check(status in ('active','processing','paid','cancelled','divergent')),
 expires_at timestamptz not null, created_at timestamptz not null default now(), created_by uuid not null,
 updated_at timestamptz not null default now(), revision integer not null default 1, paid_at timestamptz,
 transaction_id text references public.financial_transactions(id), divergence text, unique(provider,external_id)
);
create index payment_links_company_created_idx on public.payment_links(company_id,created_at desc);
create index payment_links_order_idx on public.payment_links(order_id);
create index payment_links_receivable_idx on public.payment_links(receivable_id) where receivable_id is not null;
create index payment_links_transaction_idx on public.payment_links(transaction_id) where transaction_id is not null;
create index payment_links_company_status_expiry_idx on public.payment_links(company_id,status,expires_at);
create table private.payment_link_tokens(link_id uuid primary key references public.payment_links(id),token text not null unique);
create table private.payment_link_commands(company_id text not null,operation_id uuid not null,actor uuid not null,action text not null,payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(company_id,operation_id));
create table private.payment_provider_events(
 provider text not null,event_id text not null,link_id uuid not null references public.payment_links(id),
 payload jsonb not null,payload_hash text not null,status text not null check(status in ('processed','ignored','divergent')),
 created_at timestamptz not null default now(),primary key(provider,event_id)
);
create index payment_events_link_idx on private.payment_provider_events(link_id,created_at desc);
create table private.payment_provider_receipts(provider text not null,payment_id text not null,link_id uuid not null references public.payment_links(id),primary key(provider,payment_id));
create index payment_receipts_link_idx on private.payment_provider_receipts(link_id);
create table private.payment_rate_limits(key text primary key,window_start timestamptz not null,count integer not null);
create index payment_rate_window_idx on private.payment_rate_limits(window_start);
alter table public.payment_links enable row level security;
revoke all on public.payment_links from public,anon,authenticated;
grant select on public.payment_links to authenticated;
create policy payment_links_read on public.payment_links for select to authenticated using(company_id=(select private.current_company_id()) and (select private.finance_can_access()));
do $$ declare t text; begin foreach t in array array['payment_qa_fixtures','payment_provider_config','payment_link_tokens','payment_link_commands','payment_provider_events','payment_provider_receipts','payment_rate_limits'] loop
 execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
end loop;end $$;

create function private.payment_order_balance(p_company text,p_order text) returns numeric language sql stable security definer set search_path='' as $$
 select case when o.status in ('cancelado','orcamento','aguardando_aprovacao') then 0 else greatest(0,o.total_amount-greatest(coalesce(o.paid_amount,0),coalesce((select sum(f.amount) from public.financial_transactions f
 where f.company_id=p_company and f.type='receita' and f.status='pago' and f.entry_role='movement' and f.economic_kind='operating' and f.cancelled_at is null and f.reversed_at is null and f.reversal_of is null
 and (f.order_id=o.id or (f.order_id is null and private.reports_order_key(f.order_number)=private.reports_order_key(o.number)))),0))) end
 from public.orders o where o.company_id=p_company and o.id=p_order
$$;
create function private.payment_link_status(p public.payment_links) returns text language sql stable security definer set search_path='' as $$
 select case when p.status='paid' then case when exists(select 1 from public.financial_transactions f where f.id=p.transaction_id and (f.reversed_at is not null or f.cancelled_at is not null or f.status<>'pago')) then 'refunded' else 'paid' end
 when p.status='cancelled' then 'cancelled' when p.expires_at<=now() then 'expired' when p.status='divergent' then 'divergent'
 when coalesce(private.payment_order_balance(p.company_id,p.order_id),0)<p.amount then 'divergent' else p.status end
$$;
create function private.payment_audit(p_company text,p_action text,p_id text,p_new jsonb) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; begin
 if auth.uid() is null then
  if coalesce(auth.jwt()->>'role','')<>'service_role' then return; end if;
 else select * into a from public.profiles where auth_user_id=auth.uid() and company_id=p_company and active order by id limit 1;
  if not found then raise exception 'Payment audit actor denied' using errcode='42501'; end if;
 end if;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
 values(p_company,auth.uid(),a.id,coalesce(a.name,'SYSTEM'),coalesce(a.role,'system'),p_action,'payment_link',p_id,'financial','{}',p_new,'{}');
end $$;

create function public.payment_link_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id(); r private.payment_link_commands%rowtype;l public.payment_links%rowtype;o public.orders%rowtype;f public.financial_transactions%rowtype;v numeric;token text;expiry date;result jsonb;
begin
 if auth.uid() is null or c is null or not private.finance_can_access() then raise exception 'Payment access denied' using errcode='42501';end if;
 if p_operation_id is null or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-links:'||c,0));
 select * into r from private.payment_link_commands where company_id=c and operation_id=p_operation_id;
 if found then if r.actor<>auth.uid() or r.action<>p_action or r.payload<>p_payload then raise exception 'Operation key reused' using errcode='22023';end if;return r.result;end if;
 if p_action='create' then
  select * into o from public.orders where id=p_payload->>'order_id' and company_id=c for update;
  if not found then raise exception 'Pedido indisponível.' using errcode='P0002';end if;
  if not exists(select 1 from private.payment_qa_fixtures q join public.financial_accounts a on a.id=q.account_id and a.company_id=c and a.active and a.kind='bank' where q.company_id=c and q.order_id=o.id and q.active) then raise exception 'Provedor real não configurado. QA disponível somente para fixtures autorizadas.' using errcode='22023';end if;
  if p_payload->>'provider' is distinct from 'qa' then raise exception 'Provedor indisponível.' using errcode='22023';end if;
  v:=private.payment_order_balance(c,o.id);
  if v is null or v<=0 then raise exception 'Pedido sem saldo elegível.' using errcode='22023';end if;
  if nullif(p_payload->>'receivable_id','') is not null then
   select * into f from public.financial_transactions where id=p_payload->>'receivable_id' and company_id=c and type='receita' and entry_role='movement' and economic_kind='operating' and status='pendente' and cancelled_at is null and reversed_at is null and reversal_of is null and (order_id=o.id or (order_id is null and private.reports_order_key(order_number)=private.reports_order_key(o.number))) for update;
   if not found or f.amount>v then raise exception 'Recebível indisponível ou divergente.' using errcode='22023';end if;
   v:=f.amount;
   if nullif(p_payload->>'amount','') is not null and (p_payload->>'amount')::numeric<>v then raise exception 'Recebível específico exige valor integral.' using errcode='22023';end if;
  else
   if exists(select 1 from public.financial_transactions where company_id=c and type='receita' and status='pendente' and cancelled_at is null and (order_id=o.id or (order_id is null and private.reports_order_key(order_number)=private.reports_order_key(o.number)))) then raise exception 'Selecione o recebível específico deste Pedido.' using errcode='22023';end if;
   if nullif(p_payload->>'amount','') is not null then
    if (p_payload->>'amount')::numeric<>round((p_payload->>'amount')::numeric,2) or (p_payload->>'amount')::numeric<=0 or (p_payload->>'amount')::numeric>v then raise exception 'Valor deve ser positivo e não superar o saldo.' using errcode='22023';end if;
    v:=(p_payload->>'amount')::numeric;
   end if;
  end if;
  expiry:=(p_payload->>'expires_on')::date;
  if expiry is null or expiry<(now() at time zone 'America/Bahia')::date or expiry>(now() at time zone 'America/Bahia')::date+366 then raise exception 'Vencimento inválido: hoje até 366 dias.' using errcode='22023';end if;
  if (select count(*) from public.payment_links where company_id=c and created_at>now()-interval '1 minute')>=20 then raise exception 'Limite de criação. Aguarde um minuto.' using errcode='22023';end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.payment_links(company_id,order_id,receivable_id,provider,token_hash,amount,expires_at,created_by)
  values(c,o.id,f.id,'qa',encode(extensions.digest(token,'sha256'),'hex'),v,((expiry+1)::timestamp at time zone 'America/Bahia'),auth.uid()) returning * into l;
  insert into private.payment_link_tokens values(l.id,token);
  perform private.payment_audit(c,'payment_link.created',l.id::text,jsonb_build_object('order_id',o.id,'receivable_id',f.id,'amount',v,'provider','qa'));
  result:=jsonb_build_object('id',l.id);
 elsif p_action in ('cancel','qa_prepare','reconcile') then
  -- Lock the Order before the link, matching verified settlement and manual receipts.
  select * into l from public.payment_links where id=(p_payload->>'id')::uuid and company_id=c;
  if not found then raise exception 'Link indisponível.' using errcode='P0002';end if;
  perform 1 from public.orders where id=l.order_id and company_id=c for update;
  select * into l from public.payment_links where id=l.id for update;
  if l.revision<>(p_payload->>'revision')::integer or p_payload->>'revision' is null then raise exception 'Link alterado. Atualize.' using errcode='40001';end if;
  if p_action='cancel' then
   if l.status='paid' then raise exception 'Pagamento confirmado não pode ser cancelado pelo link.' using errcode='22023';end if;
   update public.payment_links set status='cancelled',revision=revision+1,updated_at=now() where id=l.id;
   perform private.payment_audit(c,'payment_link.cancelled',l.id::text,'{}');result:='{}';
  elsif p_action='qa_prepare' then
   if not exists(select 1 from public.profiles where auth_user_id=auth.uid() and company_id=c and active and role in ('admin','gerente')) or not exists(select 1 from private.payment_qa_fixtures where company_id=c and order_id=l.order_id and active) then raise exception 'QA permission denied' using errcode='42501';end if;
   result:=jsonb_build_object('event_id',p_operation_id,'external_id',l.external_id,'payment_id','qa:'||l.external_id,'state','paid','amount',l.amount,'currency',l.currency);
  else
   if not exists(select 1 from public.profiles where auth_user_id=auth.uid() and company_id=c and active and role in ('admin','gerente')) then raise exception 'Reconcile permission denied' using errcode='42501';end if;
   perform private.payment_reconcile(l.id);
   select * into l from public.payment_links where id=l.id;
   perform private.payment_audit(c,'payment_link.reconciled',l.id::text,jsonb_build_object('status',private.payment_link_status(l)));result:='{}';
  end if;
 else raise exception 'Invalid command' using errcode='22023';end if;
 insert into private.payment_link_commands values(c,p_operation_id,auth.uid(),p_action,p_payload,result,now());return result;
end $$;
revoke all on function public.payment_link_command(uuid,text,jsonb) from public,anon;
grant execute on function public.payment_link_command(uuid,text,jsonb) to authenticated;

create function private.payment_apply_event(p jsonb,p_retry boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.payment_links%rowtype;o public.orders%rowtype;f public.financial_transactions%rowtype;e private.payment_provider_events%rowtype;q private.payment_qa_fixtures%rowtype;response jsonb;vhash text;estate text:='processed';reason text;old_setting text;
begin
 if p->>'state' not in ('processing','paid','failed') or length(p->>'event_id') not between 1 and 128 or length(p->>'payment_id') not between 1 and 128 or p->>'currency' is distinct from 'BRL' then raise exception 'Invalid event' using errcode='22023';end if;
 select * into l from public.payment_links where provider='qa' and external_id=p->>'external_id';
 if not found then raise exception 'Unavailable event target' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-links:'||l.company_id,0));
 select * into o from public.orders where id=l.order_id and company_id=l.company_id for update;
 select * into l from public.payment_links where id=l.id for update;
 vhash:=encode(extensions.digest(p::text,'sha256'),'hex');
 select * into e from private.payment_provider_events where provider='qa' and event_id=p->>'event_id';
 if found then
  if e.payload_hash<>vhash then raise exception 'Event key reused' using errcode='22023';end if;
  if not p_retry or e.status<>'divergent' then return jsonb_build_object('result','duplicate');end if;
 end if;
 if (p->>'amount')::numeric is distinct from l.amount then reason:='Valor confirmado difere do link';
 elsif exists(select 1 from private.payment_provider_receipts where provider='qa' and payment_id=p->>'payment_id' and link_id<>l.id) then reason:='Pagamento externo já vinculado a outro link';
 elsif l.status='paid' then estate:='ignored';
 elsif p->>'state'='paid' then
  select * into q from private.payment_qa_fixtures where company_id=l.company_id and order_id=l.order_id and active;
  if not found then reason:='Fixture QA não autorizada';
  elsif l.status='cancelled' or l.expires_at<=now() then reason:='Confirmação após cancelamento ou expiração';
  elsif private.payment_order_balance(l.company_id,o.id)<l.amount then reason:='Saldo alterado antes da confirmação';
  elsif not exists(select 1 from public.financial_accounts where id=q.account_id and company_id=l.company_id and active and kind='bank') then reason:='Conta QA indisponível';
  else
   if l.receivable_id is not null then
    select * into f from public.financial_transactions where id=l.receivable_id and company_id=l.company_id for update;
    if not found or f.type is distinct from 'receita' or f.entry_role is distinct from 'movement' or f.economic_kind is distinct from 'operating' or f.status is distinct from 'pendente' or f.amount is distinct from l.amount or f.cancelled_at is not null or f.reversed_at is not null or f.reversal_of is not null or (f.order_id=o.id or (f.order_id is null and private.reports_order_key(f.order_number)=private.reports_order_key(o.number))) is not true then reason:='Recebível já liquidado ou alterado';end if;
   elsif exists(select 1 from public.financial_transactions where company_id=l.company_id and type='receita' and status='pendente' and cancelled_at is null and (order_id=o.id or (order_id is null and private.reports_order_key(order_number)=private.reports_order_key(o.number)))) then reason:='Recebível específico criado depois do link';end if;
   if reason is null then
    old_setting:=current_setting('printflow.finance_command',true);perform set_config('printflow.finance_command','on',true);
    if l.receivable_id is not null then
     -- Resolve a legacy PED/ORD receivable once, without creating a second receipt.
     if f.order_id is null then update public.financial_transactions set order_id=o.id where id=f.id;end if;
     response:=private.finance_apply_receivable(l.company_id,f.id,'pago',null,q.account_id,q.paid_at);
     if response->>'status'<>'UPDATED' then raise exception 'Canonical settlement failed';end if;
     f:=jsonb_populate_record(null::public.financial_transactions,response->'transaction');
    else
     response:=private.finance_apply_order_payment(l.company_id,o.id,l.amount,'pix',null,q.paid_at,'QA — sem cobrança real',null,q.account_id);
     if response->>'status'<>'UPDATED' then raise exception 'Canonical settlement failed';end if;
     f:=jsonb_populate_record(null::public.financial_transactions,response->'financial');
    end if;
    if f.amount<>l.amount then raise exception 'Canonical amount mismatch';end if;
    perform private.ensure_production_queue_for_order(o.id,l.company_id);
    perform set_config('printflow.finance_command',coalesce(old_setting,''),true);
    insert into private.payment_provider_receipts values('qa',p->>'payment_id',l.id);
    update public.payment_links set status='paid',paid_at=q.paid_at,transaction_id=f.id,divergence=null,revision=revision+1,updated_at=now() where id=l.id;
    perform private.payment_audit(l.company_id,'payment_link.confirmed',l.id::text,jsonb_build_object('transaction_id',f.id,'amount',f.amount,'provider','qa'));
   end if;
  end if;
 elsif l.status in ('cancelled','divergent') or l.expires_at<=now() then estate:='ignored';
 elsif p->>'state'='processing' and l.status='active' then update public.payment_links set status='processing',revision=revision+1,updated_at=now() where id=l.id;
 else estate:='ignored';end if;
 if reason is not null then estate:='divergent';update public.payment_links set status=case when status='paid' then status else 'divergent' end,divergence=reason,revision=revision+1,updated_at=now() where id=l.id;end if;
 if e.event_id is not null then
  update private.payment_provider_events set status=estate where provider='qa' and event_id=e.event_id and payload_hash=vhash;
 else
  -- A cross-tenant concurrent claim must abort its entire financial transaction on conflict.
  insert into private.payment_provider_events values('qa',p->>'event_id',l.id,p,vhash,estate,now());
 end if;
 return jsonb_build_object('result',estate);
end $$;
create function private.payment_reconcile(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare e record;begin
 for e in select payload from private.payment_provider_events where link_id=p_id and status='divergent' and payload->>'state'='paid' order by created_at limit 20 loop perform private.payment_apply_event(e.payload,true);end loop;
end $$;
create function public.payment_link_webhook(p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;return private.payment_apply_event(p_event);end $$;
revoke all on function public.payment_link_webhook(jsonb) from public,anon,authenticated;
grant execute on function public.payment_link_webhook(jsonb) to service_role;
create function public.payment_provider_secret() returns text language sql stable security definer set search_path='' as $$select secret from private.payment_provider_config where provider='qa' and (auth.jwt()->>'role')='service_role'$$;
revoke all on function public.payment_provider_secret() from public,anon,authenticated;
grant execute on function public.payment_provider_secret() to service_role;

create function public.payment_public_source(p_token text,p_host text,p_preview boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.payment_links%rowtype;company public.companies%rowtype;o public.orders%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_token is null or p_token!~'^[a-f0-9]{64}$' then return null;end if;
 select * into l from public.payment_links where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');if not found then return null;end if;
 select * into company from public.companies where id=l.company_id and (p_preview or p_host in (store_domain,admin_domain,custom_domain));if not found then return null;end if;
 select * into o from public.orders where id=l.order_id and company_id=l.company_id;
 return jsonb_build_object('company',company.name,'logo',company.logo_url,'color',company.theme_color,'order',o.number,'customer',split_part(o.customer_name,' ',1),'amount',l.amount,'currency',l.currency,'status',private.payment_link_status(l),'expires_at',l.expires_at,'expires_on',((l.expires_at at time zone 'America/Bahia')::date-1),'provider',l.provider,'paid_at',l.paid_at);
end $$;
revoke all on function public.payment_public_source(text,text,boolean) from public,anon,authenticated;
grant execute on function public.payment_public_source(text,text,boolean) to service_role;
create function public.payment_public_rate(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 insert into private.payment_rate_limits values(left(p_key,160),date_trunc('minute',now()),1) on conflict(key) do update set count=case when payment_rate_limits.window_start=date_trunc('minute',now()) then payment_rate_limits.count+1 else 1 end,window_start=date_trunc('minute',now()) returning count into n;
 -- Bound stale technical data; expiry is never dependent on cleanup.
 delete from private.payment_rate_limits where window_start<now()-interval '1 day';return n<=least(greatest(p_limit,1),300);
end $$;
revoke all on function public.payment_public_rate(text,integer) from public,anon,authenticated;
grant execute on function public.payment_public_rate(text,integer) to service_role;

create function public.payment_links_source(p_order text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();begin
 if auth.uid() is null or c is null or not private.finance_can_access() then raise exception 'Payment access denied' using errcode='42501';end if;
 return jsonb_build_object('provider','qa','liveConfigured',false,
 'canReconcile',exists(select 1 from public.profiles where auth_user_id=auth.uid() and company_id=c and active and role in ('admin','gerente')),
 'rows',coalesce((select jsonb_agg(to_jsonb(l)-'token_hash'||jsonb_build_object('status',private.payment_link_status(l),'expires_on',((l.expires_at at time zone 'America/Bahia')::date-1),'token',t.token,'number',o.number,'customer',o.customer_name)) from (select * from public.payment_links where company_id=c and (p_order is null or order_id=p_order) order by created_at desc limit 1000) l join private.payment_link_tokens t on t.link_id=l.id join public.orders o on o.id=l.order_id and o.company_id=c),'[]'),
 'receivables',coalesce((select jsonb_agg(jsonb_build_object('order_id',o.id,'number',o.number,'customer',o.customer_name,'balance',private.payment_order_balance(c,o.id),'qa',exists(select 1 from private.payment_qa_fixtures q where q.order_id=o.id and q.company_id=c and q.active),'pending',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'amount',f.amount,'due_date',f.due_date)) from public.financial_transactions f where f.company_id=c and f.type='receita' and f.status='pendente' and f.cancelled_at is null and (f.order_id=o.id or (f.order_id is null and private.reports_order_key(f.order_number)=private.reports_order_key(o.number)))),'[]'))) from (select * from public.orders where company_id=c and status not in ('cancelado','orcamento','aguardando_aprovacao') and (p_order is null or id=p_order) order by created_at desc limit 1000) o),'[]'),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',e.event_id,'link_id',e.link_id,'state',e.payload->>'state','result',e.status,'created_at',e.created_at)) from (select e.* from private.payment_provider_events e join public.payment_links l on l.id=e.link_id where l.company_id=c and (p_order is null or l.order_id=p_order) order by e.created_at desc limit 1000) e),'[]'));
end $$;
revoke all on function public.payment_links_source(text) from public,anon;
grant execute on function public.payment_links_source(text) to authenticated;
-- Helpers are never an RPC authority for browsers or service clients.
revoke all on function private.payment_order_balance(text,text),private.payment_link_status(public.payment_links),private.payment_audit(text,text,text,jsonb),private.payment_apply_event(jsonb,boolean),private.payment_reconcile(uuid) from public,anon,authenticated,service_role;
