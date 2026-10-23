-- Commissions are a commercial obligation. Cash remains in financial_transactions.
create table public.commission_rules (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 seller_profile_id text references public.profiles(id), active boolean not null default false, use_default boolean not null default true,
 kind text not null default 'percent' check(kind in ('percent','fixed')), amount numeric(14,2) not null default 0 check(amount between 0 and 999999999),
 base text not null default 'net_sale' check(base in ('net_sale','net_products')),
 policy text not null default 'fully_paid' check(policy in ('fully_paid','approved_sale')),
 exclude_shipping boolean not null default true, deduct_discount boolean not null default true,
 origins text[] not null default array['manual','quote','pos','store']::text[] check(origins <@ array['manual','quote','pos','store']::text[]),
 revision integer not null default 1, updated_at timestamptz not null default now(),
 check(kind<>'percent' or amount<=100), unique(company_id,id)
);
create unique index commission_default_rule on public.commission_rules(company_id) where seller_profile_id is null;
create unique index commission_seller_rule on public.commission_rules(company_id,seller_profile_id) where seller_profile_id is not null;
create index commission_rule_profile on public.commission_rules(seller_profile_id);
create table public.commission_attributions (
 order_id text primary key references public.orders(id), company_id text not null references public.companies(id),
 seller_profile_id text not null references public.profiles(id), origin text not null check(origin in ('manual','quote','pos','store')),
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create index commission_attribution_seller on public.commission_attributions(company_id,seller_profile_id);
create index commission_attribution_profile on public.commission_attributions(seller_profile_id);
create table public.commission_periods (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), name text not null check(length(btrim(name)) between 1 and 100),
 starts_on date not null, ends_on date not null, status text not null default 'open' check(status in ('open','closed','approved','paid','review_required')),
 generation integer not null default 1, revision integer not null default 1, created_at timestamptz not null default now(),
 check(ends_on>=starts_on and ends_on-starts_on<=366), unique(company_id,id)
);
create index commission_period_dates on public.commission_periods(company_id,starts_on,ends_on);
create table public.commission_entries (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 period_id uuid not null, generation integer not null, order_id text not null references public.orders(id), seller_profile_id text not null references public.profiles(id),
 base numeric(14,2) not null check(base>=0), amount numeric(14,2) not null check(amount>=0), snapshot jsonb not null,
 voided boolean not null default false, invalidated_at timestamptz, created_at timestamptz not null default now(),
 foreign key(company_id,period_id) references public.commission_periods(company_id,id)
);
create unique index commission_order_claim on public.commission_entries(company_id,order_id) where not voided;
create index commission_entry_period on public.commission_entries(company_id,period_id,generation,seller_profile_id);
create index commission_entry_period_fk on public.commission_entries(period_id);
create index commission_entry_order on public.commission_entries(order_id);
create index commission_entry_profile on public.commission_entries(seller_profile_id);
create table public.commission_adjustments (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), period_id uuid not null,
 generation integer not null, seller_profile_id text not null references public.profiles(id), entry_id uuid references public.commission_entries(id),
 amount numeric(14,2) not null check(amount<>0 and abs(amount)<=999999999), reason text not null check(length(btrim(reason)) between 3 and 500),
 automatic boolean not null default false, actor_user_id uuid, created_at timestamptz not null default now(),
 foreign key(company_id,period_id) references public.commission_periods(company_id,id)
);
create unique index commission_invalidation_once on public.commission_adjustments(entry_id) where automatic;
create index commission_adjustment_period on public.commission_adjustments(company_id,period_id,generation,seller_profile_id);
create index commission_adjustment_period_fk on public.commission_adjustments(period_id);
create index commission_adjustment_entry on public.commission_adjustments(entry_id);
create index commission_adjustment_profile on public.commission_adjustments(seller_profile_id);
create table public.commission_payments (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), period_id uuid not null, generation integer not null,
 seller_profile_id text not null references public.profiles(id), seller_name text not null, amount numeric(14,2) not null check(amount>0),
 transaction_id text not null unique references public.financial_transactions(id), reversal_id text unique references public.financial_transactions(id),
 paid_on date not null, reversed_at timestamptz, reason text not null default '', created_at timestamptz not null default now(),
 foreign key(company_id,period_id) references public.commission_periods(company_id,id)
);
create unique index commission_active_payment on public.commission_payments(company_id,period_id,generation,seller_profile_id) where reversed_at is null;
create index commission_payment_period on public.commission_payments(period_id);
create index commission_payment_company on public.commission_payments(company_id,period_id,generation,seller_profile_id);
create index commission_payment_profile on public.commission_payments(seller_profile_id);
create index commission_receipt_order on public.financial_transactions(company_id,order_id) where status='pago' and type='receita' and entry_role='movement' and reversed_at is null and cancelled_at is null and reversal_of is null;
create index commission_receipt_number on public.financial_transactions(company_id,private.reports_order_key(order_number)) where order_id is null and status='pago' and type='receita' and entry_role='movement' and reversed_at is null and cancelled_at is null and reversal_of is null;
create table private.commission_commands (
 company_id text not null references public.companies(id), operation_id uuid not null, action text not null, payload jsonb not null, result jsonb not null,
 actor uuid not null, created_at timestamptz not null default now(), primary key(company_id,operation_id)
);
alter table private.commission_commands enable row level security;
revoke all on private.commission_commands from public,anon,authenticated;

-- Same strict financial boundary, including explicit configured denials.
create function private.commission_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.finance_can_access()
$$;
revoke all on function private.commission_allowed() from public,anon;
grant execute on function private.commission_allowed() to authenticated;
do $$declare t text;begin
 foreach t in array array['commission_rules','commission_attributions','commission_periods','commission_entries','commission_adjustments','commission_payments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy commission_read on public.%I for select to authenticated using(company_id=(select private.current_company_id()) and (select private.commission_allowed()))',t);
 end loop;
end $$;

create function private.commission_audit(p_company text,p_action text,p_id text,p_old jsonb,p_new jsonb,p_operation uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype;
begin
 select * into a from public.profiles where auth_user_id=auth.uid() and company_id=p_company and active order by id limit 1;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
 values(p_company,auth.uid(),a.id,coalesce(a.name,'Sistema'),coalesce(a.role,'system'),p_action,'commission',p_id,'financial',coalesce(p_old,'{}'),coalesce(p_new,'{}'),jsonb_build_object('operation_id',p_operation));
end $$;
revoke all on function private.commission_audit(text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;

-- Active receipts are authoritative. An operational paid_amount cache is not proof of payment.
create function private.commission_received(p_company text,p_order text,p_number text) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce(sum(f.amount),0)
 from public.financial_transactions f
 where f.company_id=p_company and f.entry_role='movement' and f.type='receita' and f.status='pago' and f.cancelled_at is null and f.reversed_at is null and f.reversal_of is null
 and (f.order_id=p_order or (f.order_id is null and f.order_number is not null and private.reports_order_key(f.order_number)=private.reports_order_key(p_number)))
 and f.source in ('order_payment','pdv','legacy')
$$;
revoke all on function private.commission_received(text,text,text) from public,anon,authenticated;

-- The only calculation engine. UI, close and CSV consume this projection or its frozen snapshot.
create function private.commission_calculate(p_company text,p_from date,p_to date) returns table(order_id text,seller_profile_id text,base numeric,amount numeric,snapshot jsonb)
language sql stable security definer set search_path='' as $$
 with sales as (
 select o.*,a.seller_profile_id,a.origin,p.name as seller_name,
 case when s.use_default then to_jsonb(d) else to_jsonb(s) end as rule,
 coalesce((select sum(i.total_price) from public.order_items i where i.order_id=o.id),0) as item_total,
 coalesce((select sum((z->>'total_price')::numeric) from jsonb_array_elements(coalesce(o.additional_services,'[]')) z),0) as service_total
 from public.orders o join public.commission_attributions a on a.order_id=o.id and a.company_id=p_company
 join public.profiles p on p.id=a.seller_profile_id and p.company_id=p_company and p.active
 join public.commission_rules s on s.company_id=p_company and s.seller_profile_id=p.id and s.active
 join public.commission_rules d on d.company_id=p_company and d.seller_profile_id is null and d.active
 where o.company_id=p_company and o.status in ('aguardando_pagamento','producao','impressao','acabamento','expedicao','entregue','finalizado')
 and o.created_at>=p_from::timestamp at time zone 'America/Bahia' and o.created_at<(p_to+1)::timestamp at time zone 'America/Bahia'
 ), bases as (
 select sales.*,round(greatest(0,
 (case when (rule->>'deduct_discount')::boolean then greatest(0,total_amount-shipping_cost) else item_total+service_total end)
 *case when rule->>'base'='net_products' then case when item_total+service_total>0 then item_total/(item_total+service_total) else 0 end else 1 end
 +case when (rule->>'exclude_shipping')::boolean then 0 else shipping_cost end),2) as calculated_base
 from sales where origin=any(array(select jsonb_array_elements_text(rule->'origins')))
 and ((rule->>'policy')='approved_sale' or private.commission_received(p_company,id,number)>=total_amount)
 ), calculated as (
 select bases.*,case when calculated_base<=0 then 0 when rule->>'kind'='fixed' then (rule->>'amount')::numeric else round(calculated_base*(rule->>'amount')::numeric/100,2) end as commission
 from bases
 ) select id,seller_profile_id,calculated_base,commission,
 jsonb_build_object('order_id',id,'number',number,'customer',customer_name,'date',(created_at at time zone 'America/Bahia')::date,'total',total_amount,'shipping',shipping_cost,'item_total',item_total,'origin',origin,'seller_id',seller_profile_id,'seller',seller_name,'rule',rule,'base',calculated_base,'amount',commission)
 from calculated
$$;
revoke all on function private.commission_calculate(text,date,date) from public,anon,authenticated;

-- Preserve history and flag recovery when a sale is cancelled or its receipt reversed.
create function private.commission_invalidate(p_company text,p_order text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare e public.commission_entries%rowtype; v_order public.orders%rowtype;
begin
 if not exists(select 1 from public.commission_attributions where company_id=p_company and order_id=p_order) then return;end if;
 if not pg_try_advisory_xact_lock(hashtextextended('commission:'||p_company,0)) then raise exception 'Commission busy; retry order change' using errcode='40001'; end if;
 if not exists(select 1 from public.commission_entries where company_id=p_company and order_id=p_order and not voided and invalidated_at is null) then return; end if;
 select * into v_order from public.orders where id=p_order and company_id=p_company;
 for e in select * from public.commission_entries where company_id=p_company and order_id=p_order and not voided and invalidated_at is null for update loop
  if v_order.status in ('orcamento','aguardando_aprovacao','cancelado') or (e.snapshot#>>'{rule,policy}'='fully_paid' and private.commission_received(p_company,v_order.id,v_order.number)<v_order.total_amount) then
   if e.amount>0 then insert into public.commission_adjustments(company_id,period_id,generation,seller_profile_id,entry_id,amount,reason,automatic,actor_user_id)
   values(p_company,e.period_id,e.generation,e.seller_profile_id,e.id,-e.amount,p_reason,true,auth.uid()) on conflict(entry_id) where automatic do nothing; end if;
   update public.commission_entries set invalidated_at=clock_timestamp() where id=e.id;
   update public.commission_periods set status='review_required',revision=revision+1 where id=e.period_id;
   perform private.commission_audit(p_company,'commission.sale_invalidated',e.id::text,e.snapshot,jsonb_build_object('adjustment',-e.amount,'reason',p_reason));
  end if;
 end loop;
end $$;
revoke all on function private.commission_invalidate(text,text,text) from public,anon,authenticated;
create function private.commission_order_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.commission_invalidate(new.company_id,new.id,'Venda cancelada ou sem elegibilidade financeira');return new;
end $$;
revoke all on function private.commission_order_changed() from public,anon,authenticated;
create trigger commission_order_changed after update of status,total_amount on public.orders for each row execute function private.commission_order_changed();
create function private.commission_sale_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v_order text;
begin
 if tg_table_name='orders' then
  if new.status='cancelado' or (old.total_amount,old.shipping_cost,old.additional_services) is not distinct from (new.total_amount,new.shipping_cost,new.additional_services) then return new;end if;
  v_order:=old.id;
 else
  if tg_op='UPDATE' and (old.quantity,old.unit_price,old.total_price,old.product_id) is not distinct from (new.quantity,new.unit_price,new.total_price,new.product_id) then return new;end if;
  v_order:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 end if;
 if exists(select 1 from public.commission_entries where order_id=v_order and not voided) then raise exception 'Reabra o período de comissão antes de alterar valores da venda' using errcode='22023';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function private.commission_sale_guard() from public,anon,authenticated;
create trigger commission_sale_guard before update on public.orders for each row execute function private.commission_sale_guard();
-- Aggregate persistence deletes/reinserts identical items even for notes/deadline edits.
-- Compare the final monetary aggregate at commit, rather than blocking those replacements.
create function private.commission_item_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare v_order text:=case when tg_op='DELETE' then old.order_id else new.order_id end; expected numeric; actual numeric;
begin
 select (snapshot->>'item_total')::numeric into expected from public.commission_entries where order_id=v_order and not voided;
 if found then select coalesce(sum(total_price),0) into actual from public.order_items where order_id=v_order;
 if actual is distinct from expected then raise exception 'Reabra o período de comissão antes de alterar valores dos itens' using errcode='22023';end if;end if;return null;
end $$;
revoke all on function private.commission_item_guard() from public,anon,authenticated;
create constraint trigger commission_item_guard after insert or update or delete on public.order_items deferrable initially deferred for each row execute function private.commission_item_guard();
create function private.commission_receipt_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare o record; v_order text:=new.order_id; v_number text:=new.order_number;
begin
 if v_order is null and v_number is null and new.reversal_of is not null then select order_id,order_number into v_order,v_number from public.financial_transactions where id=new.reversal_of and company_id=new.company_id;end if;
 if v_order is not null or v_number is not null then
 for o in select id from public.orders where company_id=new.company_id and (id=v_order or (v_order is null and private.reports_order_key(number)=private.reports_order_key(v_number))) loop
 perform private.commission_invalidate(new.company_id,o.id,'Recebimento da venda revertido ou cancelado');end loop;
 end if;return new;
end $$;
revoke all on function private.commission_receipt_changed() from public,anon,authenticated;
create trigger commission_receipt_changed after insert or update on public.financial_transactions for each row execute function private.commission_receipt_changed();

-- Generic finance reversal must never leave a commission marked paid.
create function private.commission_finance_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if current_setting('printflow.commission_command',true) is distinct from 'on' and
 ((tg_op='UPDATE' and exists(select 1 from public.commission_payments where transaction_id=old.id or reversal_id=old.id))
 or new.source='commission' or exists(select 1 from public.commission_payments where transaction_id=new.reversal_of)) then
 raise exception 'Use Comissões para reverter este pagamento' using errcode='42501';end if;return new;
end $$;
revoke all on function private.commission_finance_guard() from public,anon,authenticated;
create trigger commission_finance_guard before insert or update on public.financial_transactions for each row execute function private.commission_finance_guard();

create function public.commission_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id(); receipt private.commission_commands%rowtype;
 r public.commission_rules%rowtype; per public.commission_periods%rowtype; pay public.commission_payments%rowtype; a public.commission_attributions%rowtype;
 seller public.profiles%rowtype; bank public.financial_accounts%rowtype; sale public.orders%rowtype; f public.financial_transactions%rowtype;
 v_result jsonb; v_old jsonb; v_id uuid; v_seller text; v_amount numeric; v_base numeric; v_date date; v_method text; v_reason text; row record;
begin
 if c is null or not private.commission_allowed() then raise exception 'Commission access denied' using errcode='42501'; end if;
 if p_operation_id is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>16000 then raise exception 'Invalid commission command' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('commission:'||c,0));
 select * into receipt from private.commission_commands where company_id=c and operation_id=p_operation_id;
 if found then if receipt.action<>p_action or receipt.payload<>p_payload or receipt.actor<>auth.uid() then raise exception 'Operation key reused' using errcode='22023';end if;return receipt.result;end if;
 perform set_config('printflow.commission_command','on',true);
 v_reason:=btrim(coalesce(p_payload->>'reason',''));v_seller:=nullif(p_payload->>'seller_id','');
 if p_action='rule_save' then
  if v_seller is not null and not exists(select 1 from public.profiles where id=v_seller and company_id=c and active and role in ('admin','gerente','vendas','financeiro')) then raise exception 'Vendedor interno ativo obrigatório' using errcode='22023';end if;
  select * into r from public.commission_rules where company_id=c and seller_profile_id is not distinct from v_seller for update;
  if coalesce(r.revision,0)<>coalesce((p_payload->>'revision')::integer,0) then raise exception 'Commission changed' using errcode='40001';end if;v_old:=to_jsonb(r);
  if r.id is null then insert into public.commission_rules(company_id,seller_profile_id) values(c,v_seller) returning * into r;end if;
  update public.commission_rules set active=coalesce((p_payload->>'active')::boolean,false),use_default=v_seller is not null and coalesce((p_payload->>'use_default')::boolean,true),
  kind=coalesce(p_payload->>'kind','percent'),amount=coalesce((p_payload->>'amount')::numeric,0),base=coalesce(p_payload->>'base','net_sale'),policy=coalesce(p_payload->>'policy','fully_paid'),
  exclude_shipping=coalesce((p_payload->>'exclude_shipping')::boolean,true),deduct_discount=coalesce((p_payload->>'deduct_discount')::boolean,true),
  origins=case when p_payload ? 'origins' then array(select jsonb_array_elements_text(p_payload->'origins')) else array['manual','quote','pos','store']::text[] end,revision=revision+1,updated_at=clock_timestamp()
  where id=r.id returning * into r;
  if r.active and not r.use_default and r.amount<=0 then raise exception 'Valor da regra deve ser positivo' using errcode='22023';end if;
  v_result:=to_jsonb(r);perform private.commission_audit(c,case when v_old is null then 'commission.rule_created' else 'commission.rule_updated' end,r.id::text,v_old,v_result,p_operation_id);
 elsif p_action='assign' then
  select * into sale from public.orders where id=p_payload->>'order_id' and company_id=c for update;if not found then raise exception 'Pedido indisponível' using errcode='P0002';end if;
  if exists(select 1 from public.commission_entries where company_id=c and order_id=sale.id and not voided) then raise exception 'Pedido já possui snapshot; reabra o período antes de alterar' using errcode='22023';end if;
  if not exists(select 1 from public.profiles p join public.commission_rules s on s.seller_profile_id=p.id and s.company_id=c and s.active where p.id=v_seller and p.company_id=c and p.active) then raise exception 'Vendedor elegível obrigatório' using errcode='22023';end if;
  select * into a from public.commission_attributions where order_id=sale.id for update;
  if coalesce(a.revision,0)<>coalesce((p_payload->>'revision')::integer,0) then raise exception 'Commission changed' using errcode='40001';end if;v_old:=to_jsonb(a);
  if sale.store_origin is not null and p_payload->>'origin'<>'store' then raise exception 'Origem Store deve ser preservada' using errcode='22023';end if;
  insert into public.commission_attributions(company_id,order_id,seller_profile_id,origin) values(c,sale.id,v_seller,p_payload->>'origin')
  on conflict(order_id) do update set seller_profile_id=excluded.seller_profile_id,origin=excluded.origin,revision=public.commission_attributions.revision+1,updated_at=clock_timestamp() returning * into a;
  v_result:=to_jsonb(a);perform private.commission_audit(c,'commission.sale_assigned',sale.id,v_old,v_result,p_operation_id);
 elsif p_action='period_create' then
  if exists(select 1 from public.commission_periods where company_id=c and starts_on<=(p_payload->>'ends_on')::date and ends_on>=(p_payload->>'starts_on')::date) then raise exception 'Períodos não podem se sobrepor' using errcode='22023';end if;
  insert into public.commission_periods(company_id,name,starts_on,ends_on) values(c,p_payload->>'name',(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date) returning * into per;
  v_result:=to_jsonb(per);perform private.commission_audit(c,'commission.period_created',per.id::text,null,v_result,p_operation_id);
 else
  select * into per from public.commission_periods where company_id=c and id=(p_payload->>'period_id')::uuid for update;
  if not found then raise exception 'Período indisponível' using errcode='P0002';end if;
  if per.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Commission changed' using errcode='40001';end if;
  v_old:=to_jsonb(per);
  if p_action='close' then
   if per.status<>'open' then raise exception 'Período precisa estar aberto' using errcode='22023';end if;
   if (select count(*) from public.orders where company_id=c and created_at>=per.starts_on::timestamp at time zone 'America/Bahia' and created_at<(per.ends_on+1)::timestamp at time zone 'America/Bahia')>10000 then raise exception 'Reduza a janela para até 10 mil vendas' using errcode='54000';end if;
   -- A competing Order update fails fast in its trigger instead of waiting in an inverse lock order.
   perform id from public.orders where company_id=c and created_at>=per.starts_on::timestamp at time zone 'America/Bahia' and created_at<(per.ends_on+1)::timestamp at time zone 'America/Bahia' order by id for update;
   insert into public.commission_entries(company_id,period_id,generation,order_id,seller_profile_id,base,amount,snapshot)
   select c,per.id,per.generation,x.order_id,x.seller_profile_id,x.base,x.amount,x.snapshot from private.commission_calculate(c,per.starts_on,per.ends_on) x;
   update public.commission_periods set status='closed',revision=revision+1 where id=per.id returning * into per;
  elsif p_action='reopen' then
   if per.status='open' or length(v_reason)<3 or exists(select 1 from public.commission_payments where period_id=per.id and reversed_at is null) then raise exception 'Reabertura exige motivo e reversão dos pagamentos' using errcode='22023';end if;
   update public.commission_entries set voided=true where period_id=per.id and not voided;
   update public.commission_periods set status='open',generation=generation+1,revision=revision+1 where id=per.id returning * into per;
  elsif p_action='approve' then
   if per.status not in ('closed','review_required') or exists(select 1 from public.commission_payments where period_id=per.id and reversed_at is null) then raise exception 'Feche ou revise o período antes de aprovar' using errcode='22023';end if;
   update public.commission_periods set status='approved',revision=revision+1 where id=per.id returning * into per;
  elsif p_action='adjust' then
   if per.status not in ('closed','review_required') or length(v_reason)<3 or exists(select 1 from public.commission_payments where period_id=per.id and reversed_at is null) or not exists(select 1 from public.commission_entries where period_id=per.id and generation=per.generation and seller_profile_id=v_seller) then raise exception 'Ajuste exige fechamento sem pagamentos ativos, vendedor e motivo' using errcode='22023';end if;
   insert into public.commission_adjustments(company_id,period_id,generation,seller_profile_id,amount,reason,actor_user_id) values(c,per.id,per.generation,v_seller,(p_payload->>'amount')::numeric,v_reason,auth.uid());
   update public.commission_periods set revision=revision+1 where id=per.id returning * into per;
  elsif p_action='pay' then
   if per.status<>'approved' then raise exception 'Aprove o período antes de pagar' using errcode='22023';end if;
   perform o.id from public.orders o join public.commission_entries e on e.order_id=o.id where e.period_id=per.id and not e.voided order by o.id for update of o;
   for row in select order_id from public.commission_entries where period_id=per.id and not voided loop perform private.commission_invalidate(c,row.order_id,'Venda sem elegibilidade na conferência do pagamento');end loop;
   if (select status from public.commission_periods where id=per.id)<>'approved' then raise exception 'Vendas alteradas; atualize e revise o período' using errcode='22023';end if;
   if exists(select 1 from public.commission_payments where period_id=per.id and generation=per.generation and seller_profile_id=v_seller and reversed_at is null) then raise exception 'Comissão já paga' using errcode='22023';end if;
   select p.* into seller from public.profiles p where p.id=v_seller and p.company_id=c;
   if not found then raise exception 'Vendedor indisponível' using errcode='22023';end if;
   select coalesce(sum(amount),0) into v_amount from (select amount from public.commission_entries where period_id=per.id and generation=per.generation and not voided and seller_profile_id=v_seller union all select amount from public.commission_adjustments where period_id=per.id and generation=per.generation and seller_profile_id=v_seller) z;
   if v_amount<=0 then raise exception 'Sem saldo positivo para pagamento' using errcode='22023';end if;
   select * into bank from public.financial_accounts where company_id=c and id=(p_payload->>'account_id')::uuid and active and kind='bank' for update;
   if not found then raise exception 'Selecione uma conta bancária ativa' using errcode='22023';end if;
   v_date:=(p_payload->>'date')::date;v_method:=p_payload->>'method';
   if v_date is null or v_date>(now() at time zone 'America/Bahia')::date or v_method not in ('pix','boleto','dinheiro','cartao_credito','cartao_debito') or v_method is null then raise exception 'Data ou método inválido' using errcode='22023';end if;
   perform set_config('printflow.finance_command','on',true);
   insert into public.financial_transactions(company_id,account_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,entry_role,economic_kind,competency_date)
   values(c,bank.id,'despesa','Comissões',v_amount,'Comissão · '||seller.name||' · '||per.name,v_method,'pago',v_date,v_date::timestamp at time zone 'America/Bahia','commission','movement','operating',per.ends_on) returning * into f;
   insert into public.commission_payments(company_id,period_id,generation,seller_profile_id,seller_name,amount,transaction_id,paid_on) values(c,per.id,per.generation,v_seller,seller.name,v_amount,f.id,v_date) returning * into pay;
   update public.commission_periods set revision=revision+1 where id=per.id returning * into per;
   if not exists(select 1 from (select seller_profile_id,sum(amount) total from (select seller_profile_id,amount from public.commission_entries where period_id=per.id and generation=per.generation and not voided union all select seller_profile_id,amount from public.commission_adjustments where period_id=per.id and generation=per.generation) z group by seller_profile_id) totals where total>0 and not exists(select 1 from public.commission_payments p where p.period_id=per.id and p.generation=per.generation and p.seller_profile_id=totals.seller_profile_id and p.reversed_at is null)) then
    update public.commission_periods set status='paid' where id=per.id returning * into per;
   end if;
   perform private.commission_audit(c,'commission.payment_created',pay.id::text,null,jsonb_build_object('period',per.id,'seller',v_seller,'amount',v_amount,'transaction',f.id,'account_id',bank.id,'date',v_date),p_operation_id);
  elsif p_action='reverse' then
   if length(v_reason)<3 then raise exception 'Motivo obrigatório' using errcode='22023';end if;
   select * into pay from public.commission_payments where company_id=c and period_id=per.id and id=(p_payload->>'payment_id')::uuid and reversed_at is null for update;
   if not found then raise exception 'Pagamento ativo indisponível' using errcode='22023';end if;
   select * into f from public.financial_transactions where id=pay.transaction_id and company_id=c for update;
   v_date:=(p_payload->>'date')::date;if v_date is null or v_date<pay.paid_on or v_date>(now() at time zone 'America/Bahia')::date then raise exception 'Data inválida' using errcode='22023';end if;
   perform set_config('printflow.finance_command','on',true);
   insert into public.financial_transactions(company_id,account_id,type,category,amount,description,payment_method,status,due_date,paid_at,source,entry_role,economic_kind,reversal_of,competency_date)
   values(c,f.account_id,'receita',f.category,f.amount,'Estorno · '||f.description,f.payment_method,'pago',v_date,v_date::timestamp at time zone 'America/Bahia','reversal','movement','operating',f.id,f.competency_date) returning id into v_seller;
   update public.financial_transactions set reversed_at=clock_timestamp() where id=f.id;
   update public.commission_payments set reversed_at=clock_timestamp(),reversal_id=v_seller,reason=v_reason where id=pay.id;
   update public.commission_periods set status='closed',revision=revision+1 where id=per.id returning * into per;
   perform private.commission_audit(c,'commission.payment_reversed',pay.id::text,jsonb_build_object('transaction',f.id,'amount',f.amount),jsonb_build_object('reversal',v_seller,'reason',v_reason),p_operation_id);
  else raise exception 'Unknown commission action' using errcode='22023';end if;
  v_result:=to_jsonb(per);
  if p_action not in ('pay','reverse') then perform private.commission_audit(c,'commission.'||case p_action when 'close' then 'period_closed' when 'reopen' then 'period_reopened' when 'approve' then 'period_approved' else 'adjustment_created' end,per.id::text,v_old,v_result||jsonb_build_object('reason',v_reason,'seller_id',v_seller,'adjustment',case when p_action='adjust' then p_payload->'amount' end),p_operation_id);end if;
 end if;
 insert into private.commission_commands(company_id,operation_id,action,payload,result,actor) values(c,p_operation_id,p_action,p_payload,v_result,auth.uid());
 perform set_config('printflow.finance_command','off',true);perform set_config('printflow.commission_command','off',true);return v_result;
end $$;
revoke all on function public.commission_command(uuid,text,jsonb) from public,anon;
grant execute on function public.commission_command(uuid,text,jsonb) to authenticated;

create function public.commission_source(p_period uuid default null,p_from date default current_date,p_to date default current_date,p_seller text default null,p_origin text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id(); per public.commission_periods%rowtype; rows jsonb; adjustments jsonb; payments jsonb; sellers jsonb;
begin
 if c is null or not private.commission_allowed() then raise exception 'Commission access denied' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Período inválido (máximo 366 dias)' using errcode='22023';end if;
 if p_period is not null then select * into per from public.commission_periods where id=p_period and company_id=c;if not found then raise exception 'Período indisponível' using errcode='P0002';end if;end if;
 if (select count(*) from public.orders where company_id=c and created_at>=coalesce(per.starts_on,p_from)::timestamp at time zone 'America/Bahia' and created_at<(coalesce(per.ends_on,p_to)+1)::timestamp at time zone 'America/Bahia')>10000 then raise exception 'Reduza a janela para até 10 mil vendas' using errcode='54000';end if;
 if per.status is null or per.status='open' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.snapshot->>'date',x.order_id),'[]') into rows from private.commission_calculate(c,coalesce(per.starts_on,p_from),coalesce(per.ends_on,p_to)) x
  where (p_seller is null or x.seller_profile_id=p_seller);
 else
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at,e.id),'[]') into rows from public.commission_entries e where e.company_id=c and e.period_id=per.id and e.generation=per.generation and not e.voided and (p_seller is null or e.seller_profile_id=p_seller);
 end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at),'[]') into adjustments from public.commission_adjustments a where a.company_id=c and a.period_id=per.id and a.generation=per.generation and (p_seller is null or a.seller_profile_id=p_seller);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at),'[]') into payments from public.commission_payments a where a.company_id=c and a.period_id=per.id and a.generation=per.generation and (p_seller is null or a.seller_profile_id=p_seller);
 with ids as(select x->>'seller_profile_id' id from jsonb_array_elements(rows) x union select x->>'seller_profile_id' from jsonb_array_elements(adjustments) x union select x->>'seller_profile_id' from jsonb_array_elements(payments) x), totals as(
 select id,coalesce((select count(*) from jsonb_array_elements(rows) x where x->>'seller_profile_id'=id),0) as orders,
 coalesce((select sum((x->>'base')::numeric) from jsonb_array_elements(rows) x where x->>'seller_profile_id'=id),0) as base,
 coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(rows) x where x->>'seller_profile_id'=id),0) as commission,
 coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(adjustments) x where x->>'seller_profile_id'=id),0) as adjustments,
 coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(payments) x where x->>'seller_profile_id'=id and x->>'reversed_at' is null),0) as paid
 from ids)
 select coalesce(jsonb_agg(to_jsonb(t)||jsonb_build_object('name',coalesce((select x#>>'{snapshot,seller}' from jsonb_array_elements(rows) x where x->>'seller_profile_id'=t.id limit 1),(select name from public.profiles where id=t.id and company_id=c)),'total',t.commission+t.adjustments,'remaining',greatest(0,t.commission+t.adjustments-t.paid),'recovery',greatest(0,t.paid-t.commission-t.adjustments)) order by t.id),'[]') into sellers from totals t;
 return jsonb_build_object('period',case when per.id is not null then to_jsonb(per) end,'rows',coalesce((select jsonb_agg(x) from jsonb_array_elements(rows) x where p_origin is null or x#>>'{snapshot,origin}'=p_origin),'[]'),'adjustments',adjustments,'payments',payments,'sellers',sellers,
 'summary',(select jsonb_build_object('estimated',coalesce(sum((x->>'total')::numeric),0),'remaining',coalesce(sum((x->>'remaining')::numeric),0),'paid',coalesce(sum((x->>'paid')::numeric),0),'recovery',coalesce(sum((x->>'recovery')::numeric),0),'sellers',count(*)) from jsonb_array_elements(sellers) x),
 'rules',coalesce((select jsonb_agg(to_jsonb(r) order by r.seller_profile_id nulls first) from public.commission_rules r where company_id=c),'[]'),
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active,'role',role) order by name) from public.profiles where company_id=c and role in ('admin','gerente','vendas','financeiro')),'[]'),
 'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.starts_on desc) from (select * from public.commission_periods where company_id=c order by starts_on desc limit 200) p),'[]'),
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from public.financial_accounts where company_id=c and active and kind='bank'),'[]'),
 'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from (select id,number,customer_name,created_at,status,total_amount,source_quote_id,(store_origin is not null) as store from public.orders where company_id=c order by created_at desc limit 1000) o),'[]'),
 'attributions',coalesce((select jsonb_agg(to_jsonb(a)) from public.commission_attributions a where company_id=c and order_id in (select id from public.orders where company_id=c order by created_at desc limit 1000)),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(e) order by e.generation,e.created_at) from (select * from public.commission_entries where company_id=c and period_id=per.id and (voided or generation<>per.generation) order by created_at desc limit 1000) e),'[]'),
 'historyPayments',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from (select * from public.commission_payments where company_id=c and period_id=per.id order by created_at desc limit 1000) e),'[]'),
 'historyAdjustments',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from (select * from public.commission_adjustments where company_id=c and period_id=per.id order by created_at desc limit 1000) e),'[]'));
end $$;
revoke all on function public.commission_source(uuid,date,date,text,text) from public,anon;
grant execute on function public.commission_source(uuid,date,date,text,text) to authenticated;
