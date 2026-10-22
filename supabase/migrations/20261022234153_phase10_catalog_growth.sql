-- Additive Growth boundary. Browser roles cannot insert analytics or consume coupons.
alter table public.products add column catalog_sort_order integer not null default 0;
grant select(id,company_id,category_id,name,pricing_type,sales_price,active,catalog_active,pricing_details,volume_pricing,updated_at,stock_controlled,current_stock,catalog_sort_order) on public.products to service_role;
alter table public.quotes add column store_origin jsonb;
alter table public.orders add column store_origin jsonb;
create index catalog_products_editorial on public.products(company_id,catalog_sort_order,id);
create index catalog_quotes_origin on public.quotes(company_id,created_at) where store_origin is not null;
create index catalog_orders_origin on public.orders(company_id,created_at) where store_origin is not null;

create table public.catalog_sessions (
 company_id text not null references public.companies(id), id uuid not null,
 created_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
 primary key(company_id,id)
);
create index catalog_session_time on public.catalog_sessions(company_id,created_at,id);
create table public.catalog_events (
 company_id text not null references public.companies(id), id uuid not null,
 session_id uuid not null, event_type text not null check(event_type in
 ('session_started','page_viewed','product_viewed','product_clicked','cart_item_added','cart_item_removed','checkout_started','search_performed','category_viewed','banner_clicked','coupon_applied')),
 product_id text, category_id text, banner_id text,
 search_term text check(length(search_term)<=60), result_count integer check(result_count between 0 and 100000),
 created_at timestamptz not null default now(), primary key(company_id,id),
 foreign key(company_id,session_id) references public.catalog_sessions(company_id,id)
);
create unique index catalog_one_session_started on public.catalog_events(company_id,session_id) where event_type='session_started';
create index catalog_event_time on public.catalog_events(company_id,created_at,event_type);
create index catalog_event_product on public.catalog_events(company_id,product_id,created_at) where product_id is not null;
create index catalog_event_session on public.catalog_events(company_id,session_id,created_at);
create table public.catalog_coupons (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 code text not null check(code=upper(btrim(code)) and code~'^[A-Z0-9_-]{2,32}$'),
 name text not null check(length(name) between 1 and 120), description text not null default '' check(length(description)<=500),
 kind text not null check(kind in('percent','fixed')), amount numeric(14,2) not null check(amount>0),
 active boolean not null default true, starts_at timestamptz, ends_at timestamptz,
 minimum numeric(14,2) not null default 0 check(minimum>=0),
 global_limit integer check(global_limit>0), session_limit integer check(session_limit>0),
 product_ids text[] not null default '{}', category_ids text[] not null default '{}',
 revision integer not null default 1, created_at timestamptz not null default now(),
 unique(company_id,code), check(kind<>'percent' or amount<=100), check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create table public.catalog_coupon_uses (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 coupon_id uuid references public.catalog_coupons(id) on delete set null,
 session_id uuid not null, quote_id text references public.quotes(id) on delete set null,
 snapshot jsonb not null, created_at timestamptz not null default now(), unique(company_id,quote_id)
);
create index catalog_coupon_usage on public.catalog_coupon_uses(company_id,coupon_id,session_id);
create index catalog_coupon_reference on public.catalog_coupon_uses(coupon_id) where coupon_id is not null;
create index catalog_coupon_quote_reference on public.catalog_coupon_uses(quote_id) where quote_id is not null;
create table public.catalog_marketing (
 company_id text primary key references public.companies(id), revision integer not null default 1,
 config jsonb not null default '{}', updated_at timestamptz not null default now()
);
create table public.catalog_checkout_operations (
 company_id text not null references public.companies(id), id uuid not null,
 request_hash text not null, quote_id text references public.quotes(id) on delete set null, session_id uuid not null, receipt jsonb not null,
 created_at timestamptz not null default now(), primary key(company_id,id)
);
create index catalog_checkout_session on public.catalog_checkout_operations(company_id,session_id,created_at);
create index catalog_checkout_quote_reference on public.catalog_checkout_operations(quote_id) where quote_id is not null;

do $$ declare t text; begin
 foreach t in array array['catalog_sessions','catalog_events','catalog_coupons','catalog_coupon_uses','catalog_marketing','catalog_checkout_operations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function private.catalog_can_access() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.role=any(coalesce(r.roles,array['admin','gerente']::text[]))
 from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path='/settings'
 where p.auth_user_id=(select auth.uid()) and p.active and p.company_id=private.current_company_id() order by p.id limit 1),false)
$$;
revoke all on function private.catalog_can_access() from public,anon,authenticated;

-- Snapshot propagation leaves the canonical approval RPC and totals untouched.
create function private.catalog_order_origin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.source_quote_id is not null then
 select q.store_origin into new.store_origin from public.quotes q where q.id=new.source_quote_id and q.company_id=new.company_id;
 end if;
 return new;
end $$;
revoke all on function private.catalog_order_origin() from public,anon,authenticated,service_role;
create trigger catalog_order_origin before insert on public.orders for each row execute function private.catalog_order_origin();

create function public.catalog_record_events(p_company text,p_session uuid,p_events jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare e jsonb; v_count integer;
begin
 if p_company is null or p_session is null or jsonb_typeof(p_events) is distinct from 'array' or jsonb_array_length(p_events)>20 then raise exception 'Invalid events' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company||p_session::text,10));
 insert into public.catalog_sessions(company_id,id) values(p_company,p_session) on conflict do nothing;
 select count(*) into v_count from public.catalog_events where company_id=p_company and session_id=p_session;
 if v_count>3000 then raise exception 'Session limit' using errcode='22023'; end if;
 update public.catalog_sessions set last_seen_at=now() where company_id=p_company and id=p_session;
 for e in select value from jsonb_array_elements(p_events) loop
 if e->>'type' not in('session_started','page_viewed','product_viewed','product_clicked','cart_item_added','cart_item_removed','checkout_started','search_performed','category_viewed','banner_clicked','coupon_applied') then raise exception 'Invalid event'; end if;
 if e->>'productId' is not null and not exists(select 1 from public.products where id=e->>'productId' and company_id=p_company and active and catalog_active) then raise exception 'Invalid product'; end if;
 if e->>'categoryId' is not null and not exists(select 1 from public.categories where id=e->>'categoryId' and company_id=p_company and show_in_catalog) then raise exception 'Invalid category'; end if;
 if e->>'bannerId' is not null and not exists(select 1 from public.store_banners where id=e->>'bannerId' and company_id=p_company and active) then raise exception 'Invalid banner'; end if;
 -- Retain printing terms (A4, 4x0, cartão de visita), reject contact/document patterns.
 if e->>'term' is not null and (length(e->>'term')>60 or e->>'term' !~ '^[[:alnum:] -]{2,60}$' or e->>'term'~'[0-9]{5}' or length(regexp_replace(e->>'term','[^0-9]','','g'))>=8 or e->>'term'~*'\m(email|e-mail|telefone|whatsapp|cpf|cnpj|senha|password|endereço|rua|avenida|cep|hiv|diagnóstico|religião)\M|cartão de crédito') then raise exception 'Invalid search'; end if;
 insert into public.catalog_events(company_id,id,session_id,event_type,product_id,category_id,banner_id,search_term,result_count)
 values(p_company,(e->>'id')::uuid,p_session,e->>'type',e->>'productId',e->>'categoryId',e->>'bannerId',e->>'term',(e->>'results')::integer)
 on conflict do nothing;
 end loop;
end $$;
revoke all on function public.catalog_record_events(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.catalog_record_events(text,uuid,jsonb) to service_role;

-- Trusted server passes canonical lines, never browser totals. Preview does not consume.
create function private.catalog_coupon(p_company text,p_code text,p_session uuid,p_items jsonb,p_consume boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.catalog_coupons%rowtype; subtotal numeric; eligible numeric; discount numeric; uses integer;
begin
 if nullif(btrim(p_code),'') is null then return null; end if;
 select * into c from public.catalog_coupons where company_id=p_company and code=upper(btrim(p_code)) for update;
 if not found or not c.active or (c.starts_at is not null and c.starts_at>now()) or(c.ends_at is not null and c.ends_at<=now()) then raise exception 'Cupom indisponível.' using errcode='22023'; end if;
 select coalesce(sum((i->>'total_price')::numeric),0),coalesce(sum(case when
 (cardinality(c.product_ids)=0 and cardinality(c.category_ids)=0) or i->>'product_id'=any(c.product_ids) or i->>'category_id'=any(c.category_ids)
 then (i->>'total_price')::numeric else 0 end),0) into subtotal,eligible from jsonb_array_elements(p_items)i;
 if subtotal<c.minimum or eligible<=0 then raise exception 'Cupom não se aplica a este carrinho.' using errcode='22023'; end if;
 select count(*) into uses from public.catalog_coupon_uses where company_id=p_company and coupon_id=c.id;
 if c.global_limit is not null and uses>=c.global_limit then raise exception 'Limite do cupom atingido.' using errcode='22023'; end if;
 select count(*) into uses from public.catalog_coupon_uses where company_id=p_company and coupon_id=c.id and session_id=p_session;
 if c.session_limit is not null and uses>=c.session_limit then raise exception 'Limite por sessão atingido.' using errcode='22023'; end if;
 discount:=least(eligible,case when c.kind='percent' then round(eligible*c.amount/100,2) else c.amount end);
 return jsonb_build_object('id',c.id,'code',c.code,'type',c.kind,'amount',discount,'subtotal',subtotal,'total',subtotal-discount);
end $$;
revoke all on function private.catalog_coupon(text,text,uuid,jsonb,boolean) from public,anon,authenticated,service_role;

create function public.catalog_checkout(p_company text,p_session uuid,p_operation uuid,p_hash text,p_customer jsonb,p_items jsonb,p_coupon text,p_tracking_session uuid default null,p_preview boolean default false,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare op public.catalog_checkout_operations%rowtype; q public.quotes%rowtype; customer_id text; item jsonb; snapshot jsonb; subtotal numeric; origin jsonb; product public.products%rowtype;
begin
 if p_company is null or p_session is null or p_operation is null or p_hash is null or p_hash!~'^[0-9a-f]{64}$' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Invalid checkout' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company||p_operation::text,11));
 select * into op from public.catalog_checkout_operations where company_id=p_company and id=p_operation;
 if found then
 if op.request_hash<>p_hash then raise exception 'Operação já usada com outro carrinho.' using errcode='40001'; end if;
 return op.receipt;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_company||p_session::text,14));
 if not p_preview and (select count(*) from public.catalog_checkout_operations where company_id=p_company and session_id=p_session and created_at>now()-interval '1 hour')>=20 then raise exception 'Limite de envios atingido. Tente mais tarde.' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
 select * into product from public.products p where p.id=item->>'product_id' and p.company_id=p_company and p.active and p.catalog_active for share;
 if not found or product.updated_at is distinct from (item->>'product_version')::timestamptz or coalesce((item->>'quantity')::numeric,0)<=0 or coalesce((item->>'total_price')::numeric,0)<=0 then raise exception 'Produto indisponível.' using errcode='22023'; end if;
 end loop;
 select round(sum((i->>'total_price')::numeric),2) into subtotal from jsonb_array_elements(p_items)i;
 snapshot:=private.catalog_coupon(p_company,p_coupon,p_session,p_items,not p_preview);
 if p_preview then return jsonb_build_object('subtotal',subtotal,'discount',coalesce((snapshot->>'amount')::numeric,0),'total',subtotal-coalesce((snapshot->>'amount')::numeric,0),'coupon',snapshot); end if;
 if coalesce(length(btrim(p_customer->>'name')),0) not between 2 and 120 or coalesce(length(p_customer->>'phone'),0) not between 8 and 20 then raise exception 'Preencha nome e telefone.' using errcode='22023'; end if;
 if p_tracking_session is not null and not exists(select 1 from public.catalog_sessions where company_id=p_company and id=p_tracking_session) then raise exception 'Invalid tracking session'; end if;
 if p_actor is not null then
 select a.customer_id into customer_id from public.store_customer_accounts a join public.customers cu on cu.id=a.customer_id and cu.company_id=a.company_id where a.company_id=p_company and a.auth_user_id=p_actor and a.status='active' for share of a,cu;
 if not found then raise exception 'Conta Store indisponível.' using errcode='42501'; end if;
 else
 -- Do not attach guests to an existing customer by unverified phone/email.
 insert into public.customers(company_id,name,document,phone,address,tags,notes)
 values(p_company,btrim(p_customer->>'name'),'',p_customer->>'phone',coalesce(p_customer->'address','{}'),array['Catalogo Online'],'Criado pelo checkout da Store.') returning id into customer_id;
 end if;
 origin:=jsonb_build_object('channel','store','session_id',p_tracking_session,'coupon',snapshot);
 insert into public.quotes(company_id,customer_id,customer_name,status,total_amount,discount,valid_until,notes,delivery_type,delivery_address,delivery_fee,store_origin)
 values(p_company,customer_id,btrim(p_customer->>'name'),'pendente',subtotal-coalesce((snapshot->>'amount')::numeric,0),coalesce((snapshot->>'amount')::numeric,0),current_date+10,
 left(coalesce(p_customer->>'notes',''),2000),p_customer->>'delivery_type',left(p_customer->>'delivery_address',1000),0,origin) returning * into q;
 insert into public.quote_items(quote_id,product_id,product_name,quantity,unit_price,total_price,details)
 select q.id,i->>'product_id',i->>'product_name',(i->>'quantity')::numeric,(i->>'unit_price')::numeric,(i->>'total_price')::numeric,coalesce(i->'details','{}') from jsonb_array_elements(p_items)i;
 if snapshot is not null then insert into public.catalog_coupon_uses(company_id,coupon_id,session_id,quote_id,snapshot) values(p_company,(snapshot->>'id')::uuid,p_session,q.id,snapshot); end if;
 insert into public.catalog_checkout_operations(company_id,id,request_hash,quote_id,session_id,receipt) values(p_company,p_operation,p_hash,q.id,p_session,jsonb_build_object('number',q.number,'total',q.total_amount,'coupon',snapshot));
 return jsonb_build_object('number',q.number,'total',q.total_amount,'coupon',snapshot);
end $$;
revoke all on function public.catalog_checkout(text,uuid,uuid,text,jsonb,jsonb,text,uuid,boolean,uuid) from public,anon,authenticated;
grant execute on function public.catalog_checkout(text,uuid,uuid,text,jsonb,jsonb,text,uuid,boolean,uuid) to service_role;

create function private.catalog_audit(p_company text,p_action text,p_id text,p_old jsonb,p_new jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare actor public.profiles%rowtype;
begin
 select * into actor from public.profiles where auth_user_id=auth.uid() and company_id=p_company and active order by id limit 1;
 if not found then raise exception 'Catalog access denied' using errcode='42501'; end if;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
 values(p_company,auth.uid(),actor.id,actor.name,actor.role,p_action,'catalog',p_id,'catalog',p_old,p_new,jsonb_build_object('source','catalog_command'));
end $$;
revoke all on function private.catalog_audit(text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;

create function public.catalog_command(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id(); old_coupon public.catalog_coupons%rowtype; new_coupon public.catalog_coupons%rowtype;
 old_marketing public.catalog_marketing%rowtype; new_marketing public.catalog_marketing%rowtype; item jsonb; product public.products%rowtype; ids text[];
begin
 if not private.catalog_can_access() then raise exception 'Catalog access denied' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Invalid command' using errcode='22023'; end if;
 if p_action in('coupon_save','coupon_delete') then
 if p_payload->>'id' is not null then
 select * into old_coupon from public.catalog_coupons where company_id=c and id=(p_payload->>'id')::uuid for update;
 if not found or old_coupon.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Recarregue o cupom: ele foi alterado.' using errcode='40001'; end if;
 end if;
 if p_action='coupon_delete' then
 if old_coupon.id is null then raise exception 'Cupom indisponível.'; end if;
 delete from public.catalog_coupons where id=old_coupon.id and company_id=c;
 perform private.catalog_audit(c,'catalog.coupon_deleted',old_coupon.id::text,to_jsonb(old_coupon),'{}');
 return '{}';
 end if;
 select coalesce(array_agg(value),'{}') into ids from jsonb_array_elements_text(coalesce(p_payload->'product_ids','[]'));
 if cardinality(ids)>100 or exists(select 1 from unnest(ids) eligible(id) where not exists(select 1 from public.products p where p.company_id=c and p.id=eligible.id)) then raise exception 'Produtos inválidos.'; end if;
 if jsonb_array_length(coalesce(p_payload->'category_ids','[]'))>100 or exists(select 1 from jsonb_array_elements_text(coalesce(p_payload->'category_ids','[]')) i where not exists(select 1 from public.categories cat where cat.company_id=c and cat.id=i.value)) then raise exception 'Categorias inválidas.'; end if;
 insert into public.catalog_coupons(id,company_id,code,name,description,kind,amount,active,starts_at,ends_at,minimum,global_limit,session_limit,product_ids,category_ids,revision)
 values(coalesce(old_coupon.id,gen_random_uuid()),c,upper(btrim(p_payload->>'code')),btrim(p_payload->>'name'),coalesce(p_payload->>'description',''),p_payload->>'kind',(p_payload->>'amount')::numeric,coalesce((p_payload->>'active')::boolean,true),nullif(p_payload->>'starts_at','')::timestamptz,nullif(p_payload->>'ends_at','')::timestamptz,
 coalesce((p_payload->>'minimum')::numeric,0),nullif(p_payload->>'global_limit','')::integer,nullif(p_payload->>'session_limit','')::integer,ids,array(select jsonb_array_elements_text(coalesce(p_payload->'category_ids','[]'))),coalesce(old_coupon.revision,0)+1)
 on conflict(id) do update set code=excluded.code,name=excluded.name,description=excluded.description,kind=excluded.kind,amount=excluded.amount,active=excluded.active,starts_at=excluded.starts_at,ends_at=excluded.ends_at,minimum=excluded.minimum,global_limit=excluded.global_limit,session_limit=excluded.session_limit,product_ids=excluded.product_ids,category_ids=excluded.category_ids,revision=excluded.revision
 returning * into new_coupon;
 perform private.catalog_audit(c,case when old_coupon.id is null then 'catalog.coupon_created' when old_coupon.active and not new_coupon.active then 'catalog.coupon_disabled' else 'catalog.coupon_updated' end,new_coupon.id::text,coalesce(to_jsonb(old_coupon),'{}'),to_jsonb(new_coupon));
 return to_jsonb(new_coupon);
 elsif p_action='marketing_save' then
 perform pg_advisory_xact_lock(hashtextextended(c,13));
 select * into old_marketing from public.catalog_marketing where company_id=c for update;
 if coalesce(old_marketing.revision,0)<>coalesce((p_payload->>'revision')::integer,0) then raise exception 'Recarregue o marketing: ele foi alterado.' using errcode='40001'; end if;
 if jsonb_typeof(p_payload->'config') is distinct from 'object' or length((p_payload->'config')::text)>8000 then raise exception 'Configuração inválida.'; end if;
 insert into public.catalog_marketing(company_id,config,revision) values(c,p_payload->'config',coalesce(old_marketing.revision,0)+1)
 on conflict(company_id) do update set config=excluded.config,revision=excluded.revision,updated_at=now() returning * into new_marketing;
 perform private.catalog_audit(c,'catalog.marketing_updated',c,coalesce(to_jsonb(old_marketing),'{}'),to_jsonb(new_marketing));
 return to_jsonb(new_marketing);
 elsif p_action='reorder' then
 if not private.reports_can_access('/products') then raise exception 'Product access denied' using errcode='42501'; end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 500 then raise exception 'Invalid product order'; end if;
 perform pg_advisory_xact_lock(hashtextextended(c,12));
 select array_agg(i->>'id') into ids from jsonb_array_elements(p_payload->'items')i;
 if cardinality(ids)<>(select count(distinct id) from unnest(ids)id) then raise exception 'Duplicate products'; end if;
 for item in select value||jsonb_build_object('position',ordinality-1) from jsonb_array_elements(p_payload->'items') with ordinality loop
 select * into product from public.products where company_id=c and id=item->>'id' for update;
 if not found or product.updated_at is distinct from (item->>'updated_at')::timestamptz then raise exception 'Recarregue os produtos: houve outra alteração.' using errcode='40001'; end if;
 update public.products set catalog_sort_order=(item->>'position')::integer where company_id=c and id=product.id;
 end loop;
 perform private.catalog_audit(c,'catalog.products_reordered',c,'{}',jsonb_build_object('product_ids',ids));
 return '{}';
 end if;
 raise exception 'Invalid catalog action' using errcode='22023';
end $$;
revoke all on function public.catalog_command(text,jsonb) from public,anon;
grant execute on function public.catalog_command(text,jsonb) to authenticated;

create function public.catalog_source(p_from date,p_to date,p_mode text default 'dashboard',p_page integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id(); first_time timestamptz; last_time timestamptz; result jsonb;
begin
 if not private.catalog_can_access() then raise exception 'Catalog access denied' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_page not between 0 and 10000 then raise exception 'Invalid catalog window' using errcode='22023'; end if;
 first_time:=p_from::timestamp at time zone 'America/Bahia'; last_time:=(p_to+1)::timestamp at time zone 'America/Bahia';
 if p_mode='coupons' then
 return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select cp.*,(select count(*) from public.catalog_coupon_uses u where u.company_id=c and u.coupon_id=cp.id) uses from public.catalog_coupons cp where cp.company_id=c order by cp.created_at desc,cp.id limit 50 offset p_page*50)x),'[]'), 'total',(select count(*) from public.catalog_coupons where company_id=c));
 elsif p_mode='marketing' then
 return coalesce((select to_jsonb(m) from public.catalog_marketing m where company_id=c),jsonb_build_object('revision',0,'config','{}'::jsonb));
 elsif p_mode='orders' then
 if not private.reports_can_access('/orders') then raise exception 'Order access denied' using errcode='42501'; end if;
 return jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,number,status,total_amount,customer_id,customer_name,created_at from public.orders where company_id=c and store_origin->>'channel'='store' and created_at>=first_time and created_at<last_time order by created_at desc,id limit 50 offset p_page*50)x),'[]'),
 'summary',(select jsonb_build_object('total',count(*),'approved',count(*)filter(where status not in('cancelado','orcamento')),'pending',count(*)filter(where payment_status in('pendente','parcial') and status not in('cancelado','orcamento')),'revenue',coalesce(sum(total_amount)filter(where status not in('cancelado','orcamento')),0),
 'sessions',(select count(*) from public.catalog_sessions s where s.company_id=c and s.created_at>=first_time and s.created_at<last_time),
 'converted_sessions',count(distinct store_origin->>'session_id')filter(where status not in('cancelado','orcamento') and exists(select 1 from public.catalog_sessions s where s.company_id=c and s.id::text=store_origin->>'session_id' and s.created_at>=first_time and s.created_at<last_time))) from public.orders where company_id=c and store_origin->>'channel'='store' and created_at>=first_time and created_at<last_time));
 elsif p_mode<>'dashboard' then raise exception 'Invalid catalog mode'; end if;
 with sessions as materialized(select id,created_at from public.catalog_sessions where company_id=c and created_at>=first_time and created_at<last_time),
 events as materialized(select e.* from public.catalog_events e where e.company_id=c and e.created_at>=first_time and e.created_at<last_time),
 store_quotes as materialized(select q.* from public.quotes q where q.company_id=c and q.store_origin->>'channel'='store' and q.created_at>=first_time and q.created_at<last_time),
 store_orders as materialized(select o.* from public.orders o where o.company_id=c and o.store_origin->>'channel'='store' and o.created_at>=first_time and o.created_at<last_time and o.status not in('cancelado','orcamento')),
 cohort_events as materialized(select e.* from events e join sessions s on s.id=e.session_id),
 event_products as materialized(select product_id,count(*) filter(where event_type='product_viewed') views,count(distinct session_id)filter(where event_type='product_viewed') view_sessions,count(*)filter(where event_type='cart_item_added') cart from events where product_id is not null group by product_id),
 product_view_sessions as materialized(select distinct product_id,session_id::text session_id from events where event_type='product_viewed' and product_id is not null),
 item_totals as materialized(select i.order_id,sum(i.total_price) total from public.order_items i join store_orders o on o.id=i.order_id group by i.order_id),
 order_products as materialized(select i.product_id,count(distinct i.order_id) orders,sum(case when t.total>0 then i.total_price*o.total_amount/t.total else 0 end)revenue,
 count(distinct v.session_id) converted_sessions
 from public.order_items i join store_orders o on o.id=i.order_id join item_totals t on t.order_id=o.id left join product_view_sessions v on v.product_id=i.product_id and v.session_id=o.store_origin->>'session_id' where i.product_id is not null group by i.product_id),
 product_metrics as materialized(select p.id,p.name,coalesce(e.views,0)views,coalesce(e.view_sessions,0)view_sessions,coalesce(e.cart,0)cart,coalesce(o.orders,0)orders,coalesce(o.revenue,0)revenue,coalesce(o.converted_sessions,0)converted_sessions from public.products p left join event_products e on e.product_id=p.id left join order_products o on o.product_id=p.id where p.company_id=c and(e.product_id is not null or o.product_id is not null)),
 ranked_products as(select m.*,row_number()over(order by views desc,id)r_views,row_number()over(order by cart desc,id)r_cart,row_number()over(order by orders desc,id)r_orders,row_number()over(order by revenue desc,id)r_revenue,row_number()over(order by case when view_sessions>=20 then converted_sessions::numeric/view_sessions else -1 end desc,id)r_conversion from product_metrics m),
 daily_sessions as(select(created_at at time zone 'America/Bahia')::date as day,count(*) sessions from sessions group by 1),
 daily_orders as(select(created_at at time zone 'America/Bahia')::date as day,count(*) orders,sum(total_amount)revenue from store_orders group by 1),
 daily_conversion as(select(s.created_at at time zone 'America/Bahia')::date as day,count(distinct s.id)converted from sessions s join store_orders o on o.store_origin->>'session_id'=s.id::text group by 1)
 select jsonb_build_object(
 'summary',jsonb_build_object('sessions',(select count(*) from sessions),'pageViews',(select count(*) from events where event_type='page_viewed'),'productViews',(select count(*) from events where event_type='product_viewed'),'cartAdds',(select count(*) from events where event_type='cart_item_added'),'checkouts',(select count(distinct session_id) from events where event_type='checkout_started'),'quotes',(select count(*) from store_quotes),'orders',(select count(*) from store_orders),'revenue',(select coalesce(sum(total_amount),0) from store_orders),'activeProducts',(select count(*) from public.products where company_id=c and active and catalog_active)),
 'funnel',jsonb_build_object('sessions',(select count(*) from sessions),'products',(select count(distinct session_id) from cohort_events where event_type='product_viewed'),'cart',(select count(distinct session_id) from cohort_events where event_type='cart_item_added'),'checkout',(select count(distinct session_id) from cohort_events where event_type='checkout_started'),'quotes',(select count(distinct q.store_origin->>'session_id') from store_quotes q join sessions s on s.id::text=q.store_origin->>'session_id'),'orders',(select count(distinct o.store_origin->>'session_id') from store_orders o join sessions s on s.id::text=o.store_origin->>'session_id')),
 'daily',(select jsonb_agg(jsonb_build_object('date',d.day::date,'sessions',coalesce(s.sessions,0),'orders',coalesce(o.orders,0),'revenue',coalesce(o.revenue,0),'converted_sessions',coalesce(cv.converted,0)) order by d.day) from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d(day) left join daily_sessions s on s.day=d.day::date left join daily_orders o on o.day=d.day::date left join daily_conversion cv on cv.day=d.day::date),
 'searches',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select search_term term,count(*) searches,count(*) filter(where result_count=0) no_results,max(result_count) results from events where event_type='search_performed' and search_term is not null group by search_term order by count(*) desc,search_term limit 20)t),
 'products',(select coalesce(jsonb_agg(to_jsonb(t)-'r_views'-'r_cart'-'r_orders'-'r_revenue'-'r_conversion' order by views desc,id),'[]') from ranked_products t where least(r_views,r_cart,r_orders,r_revenue,r_conversion)<=20)
 ) into result;
 return result;
end $$;
revoke all on function public.catalog_source(date,date,text,integer) from public,anon;
grant execute on function public.catalog_source(date,date,text,integer) to authenticated;

create function public.catalog_public_marketing(p_company text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('config',coalesce((select config from public.catalog_marketing where company_id=p_company),'{}'),
 'purchases',coalesce((select jsonb_agg(to_jsonb(x)) from(
 select p.name,p.slug from public.order_items i join public.orders o on o.id=i.order_id join public.products p on p.id=i.product_id and p.company_id=o.company_id
 where o.company_id=p_company and o.store_origin->>'channel'='store' and o.status not in('cancelado','orcamento') and p.active and p.catalog_active and o.created_at>now()-interval '30 days'
 order by o.created_at desc,i.id limit 10)x),'[]'))
$$;
revoke all on function public.catalog_public_marketing(text) from public,anon,authenticated;
grant execute on function public.catalog_public_marketing(text) to service_role;

create function public.catalog_checkout_result(p_company text,p_operation uuid,p_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare op public.catalog_checkout_operations%rowtype;
begin
 select * into op from public.catalog_checkout_operations where company_id=p_company and id=p_operation;
 if not found then return null; end if;
 if op.request_hash is distinct from p_hash then raise exception 'Operação já usada com outro carrinho.' using errcode='40001'; end if;
 return op.receipt;
end $$;
revoke all on function public.catalog_checkout_result(text,uuid,text) from public,anon,authenticated;
grant execute on function public.catalog_checkout_result(text,uuid,text) to service_role;
