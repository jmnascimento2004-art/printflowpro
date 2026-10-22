-- Read-only analytical boundary. No balances, DRE tables or financial writes.
create function private.reports_can_access(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.role=any(coalesce(r.roles,case p_path
 when '/financial' then array['admin','gerente','financeiro']
 when '/crm' then array['admin','gerente','financeiro','vendas']
 when '/orders' then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']
 when '/products' then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']
 else array[]::text[] end)) from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path=p_path
 where p.auth_user_id=(select auth.uid()) and p.active order by p.id limit 1),false)
$$;
revoke all on function private.reports_can_access(text) from public,anon,authenticated;

-- Expression matches the query's civil cash date, including historical fallback.
create index reports_cash_date on public.financial_transactions(company_id,(coalesce((paid_at at time zone 'America/Bahia')::date,due_date,(created_at at time zone 'America/Bahia')::date))) where status='pago' and entry_role='movement' and cancelled_at is null;
create index if not exists reports_orders_date on public.orders(company_id,created_at,id);

-- Match the canonical display-number rules (PED/ORD aliases and numeric-only padding).
create function private.reports_order_key(p_number text) returns text language sql immutable strict set search_path='' as $$
 select case when btrim(p_number) ~* '^(ped|ord)-' then regexp_replace(lower(btrim(p_number)),'^(ped|ord)-','ped-')
 when btrim(p_number) ~ '^[0-9]+$' then 'ped-'||lpad(btrim(p_number),greatest(length(btrim(p_number)),4),'0') else lower(btrim(p_number)) end
$$;
revoke all on function private.reports_order_key(text) from public,anon,authenticated;
create index reports_order_number on public.orders(company_id,private.reports_order_key(number));

create function public.reports_source(p_mode text,p_from date,p_to date,p_filters jsonb default '{}',p_page integer default 0,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id(); v_report jsonb; n integer;
begin
 if auth.uid() is null or c is null then raise exception 'Report access denied' using errcode='42501'; end if;
 if p_mode not in ('finance','sales','products','customers') or p_mode is null then raise exception 'Invalid report' using errcode='22023'; end if;
 if not(case when p_mode='finance' then private.reports_can_access('/financial')
 when p_mode='sales' then private.reports_can_access('/orders')
 when p_mode='products' then private.reports_can_access('/products') and private.reports_can_access('/orders')
 else private.reports_can_access('/crm') and private.reports_can_access('/orders') end) then raise exception 'Report access denied' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_page is null or p_page<0 or p_page>10000 or p_limit is null or p_limit<1 or p_limit>10000 or jsonb_typeof(p_filters) is distinct from 'object' then raise exception 'Invalid report window' using errcode='22023'; end if;
 if p_mode='finance' then
 with cash as materialized (
 select f.*,coalesce((f.paid_at at time zone 'America/Bahia')::date,f.due_date,(f.created_at at time zone 'America/Bahia')::date) as date,
 coalesce(original.type,f.type) as original_type,
 coalesce(original.economic_kind,f.economic_kind) as classification,
 coalesce(original.category_id,f.category_id)::text as category_key,
 coalesce(cat.name,original.category,f.category) as category_name,
 a.name as account,coalesce(oid.customer_name,legacy.customer_name,'') as customer,coalesce(oid.customer_id,legacy.customer_id) as customer_id,coalesce(oid.id,legacy.id) as linked_order_id,coalesce(oid.number,legacy.number) as linked_order_number,
 coalesce(f.supplier_id,original.supplier_id) as supplier_key,
 coalesce(s.name,'') as supplier,
 coalesce(original.source,f.source) as origin,
 case when f.type='receita' then f.amount else -f.amount end as signed
 from public.financial_transactions f
 left join public.financial_transactions original on original.id=f.reversal_of and original.company_id=c
 left join public.financial_categories cat on cat.id=coalesce(original.category_id,f.category_id) and cat.company_id=c
 join public.financial_accounts a on a.id=f.account_id and a.company_id=c
 left join public.orders oid on oid.id=coalesce(f.order_id,original.order_id) and oid.company_id=c
 left join lateral (select z.id,z.number,z.customer_name,z.customer_id from public.orders z where z.company_id=c
 and coalesce(f.order_id,original.order_id) is null and coalesce(f.order_number,original.order_number) is not null
 and private.reports_order_key(z.number)=private.reports_order_key(coalesce(f.order_number,original.order_number)) order by z.id limit 1) legacy on true
 left join public.suppliers s on s.id=coalesce(f.supplier_id,original.supplier_id) and s.company_id=c
 where f.company_id=c and f.status='pago' and f.entry_role='movement' and f.cancelled_at is null
 and coalesce((f.paid_at at time zone 'America/Bahia')::date,f.due_date,(f.created_at at time zone 'America/Bahia')::date) between p_from and p_to
 and (coalesce(p_filters->>'account','')='' or f.account_id::text=p_filters->>'account')
 and (coalesce(p_filters->>'method','')='' or f.payment_method=p_filters->>'method')
 and (coalesce(p_filters->>'category','')='' or coalesce(original.category_id,f.category_id)::text=p_filters->>'category' or (coalesce(original.category_id,f.category_id) is null and 'legacy:'||coalesce(original.category,f.category)=p_filters->>'category'))
 and (coalesce(p_filters->>'origin','')='' or coalesce(original.source,f.source)=p_filters->>'origin')
 and (coalesce(p_filters->>'type','')='' or coalesce(original.type,f.type)=p_filters->>'type')
 and (coalesce(p_filters->>'customer','')='' or coalesce(oid.customer_id,legacy.customer_id)=p_filters->>'customer')
 and (coalesce(p_filters->>'supplier','')='' or coalesce(f.supplier_id,original.supplier_id)=p_filters->>'supplier')
 ), rows as materialized (
 select cash.*,case when classification='operating' and original_type='receita' then signed else 0 end as income,
 case when classification='operating' and original_type='despesa' then -signed else 0 end as expense,
 case when classification='operating' then signed else 0 end as result from cash
 ), groups as (
 select dimension,key,max(label) as label,count(*) as count,sum(income) as income,sum(expense) as expense,sum(result) as result
 from rows cross join lateral (values
 ('category',coalesce(category_key,'legacy:'||category_name),category_name),('account',account_id::text,account),
 ('origin',origin,origin),('method',payment_method,payment_method),('type',original_type,original_type),
 ('customer',coalesce(customer_id,'unknown'),coalesce(nullif(customer,''),'Sem cliente')),
 ('supplier',coalesce(supplier_key,'unknown'),coalesce(nullif(supplier,''),'Sem fornecedor'))
 ) d(dimension,key,label) where classification='operating' group by dimension,key
 )
 select jsonb_build_object(
 'summary',(select jsonb_build_object('income',coalesce(sum(income),0),'expense',coalesce(sum(expense),0),'result',coalesce(sum(result),0),
 'cashNet',coalesce(sum(signed),0),'excluded',coalesce(sum(signed) filter(where classification<>'operating'),0),
 'days',count(distinct date) filter(where classification='operating'),'count',count(*) filter(where classification='operating'),
 'transfer',coalesce(sum(signed) filter(where classification='transfer'),0),'opening',coalesce(sum(signed) filter(where classification='opening'),0),
 'capital',coalesce(sum(signed) filter(where classification='capital'),0),'adjustment',coalesce(sum(signed) filter(where classification='adjustment'),0)) from rows),
 'groups',coalesce((select jsonb_agg(to_jsonb(g) order by dimension,result desc,key) from (select * from groups order by dimension,key limit 1001) g),'[]'),
 'daily',coalesce((select jsonb_agg(to_jsonb(d) order by date) from (select date,sum(income) income,sum(expense) expense,sum(result) result from rows where classification='operating' group by date) d),'[]'),
 'rows',coalesce((select jsonb_agg(to_jsonb(r) order by date desc,id) from (select id,date,description,original_type as type,category_name as category,coalesce(category_key,'legacy:'||category_name) as category_key,origin,account,customer,supplier,payment_method,signed as amount,result,classification,linked_order_id as order_id,linked_order_number as order_number,reversal_of from rows order by date desc,id limit p_limit offset p_page*p_limit) r),'[]'),
 'total',(select count(*) from rows),
 'options',jsonb_build_object(
 'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from (select id,name from public.financial_accounts where company_id=c order by name,id limit 501) account_options),'[]'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by name) from (select id,name from public.financial_categories where company_id=c order by name,id limit 501) category_options),'[]'))
 ) into v_report;
 if jsonb_array_length(v_report->'groups')>1000 then raise exception 'Narrow the report filters' using errcode='54000'; end if;
 if jsonb_array_length(v_report#>'{options,accounts}')>500 or jsonb_array_length(v_report#>'{options,categories}')>500 then raise exception 'Finance catalog exceeds report limit' using errcode='54000'; end if;
 return v_report;
 end if;
 -- Commercial sources are period-scoped and bounded before JSON serialization.
 select count(*) into n from public.orders where company_id=c and created_at >= p_from::timestamp at time zone 'America/Bahia' and created_at < (p_to+1)::timestamp at time zone 'America/Bahia';
 if p_mode='products' and (select count(*) from public.order_items i join public.orders o on o.id=i.order_id where o.company_id=c and o.created_at>=p_from::timestamp at time zone 'America/Bahia' and o.created_at<(p_to+1)::timestamp at time zone 'America/Bahia')>50000 then raise exception 'Narrow the report period' using errcode='54000'; end if;
 if n>10000 then raise exception 'Narrow the report period' using errcode='54000'; end if;
 with selected as materialized (select o.* from public.orders o where o.company_id=c
 and o.created_at>=p_from::timestamp at time zone 'America/Bahia' and o.created_at<(p_to+1)::timestamp at time zone 'America/Bahia'
 and (coalesce(p_filters->>'customer','')='' or o.customer_id=p_filters->>'customer')
 and (coalesce(p_filters->>'status','')='' or o.status=p_filters->>'status'))
 select jsonb_build_object('orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'number',o.number,'customer_id',o.customer_id,'customer_name',o.customer_name,'status',o.status,'total_amount',o.total_amount,'created_at',o.created_at,
 'items',case when p_mode='products' then coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'quantity',i.quantity,'total_price',i.total_price)) from public.order_items i where i.order_id=o.id),'[]') else '[]'::jsonb end)) from selected o),'[]'),
 'customers',case when p_mode='customers' then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'tags',tags,'document','','billing_type',billing_type,'credit_status',credit_status,'corporate_additional_info','{}'::jsonb)) from public.customers cu where cu.company_id=c and exists(select 1 from selected o where o.customer_id=cu.id)),'[]') else '[]'::jsonb end) into v_report;
 return v_report;
end $$;
revoke all on function public.reports_source(text,date,date,jsonb,integer,integer) from public,anon;
grant execute on function public.reports_source(text,date,date,jsonb,integer,integer) to authenticated;

-- Current receivable exposure of orders created in the selected period. Not cash revenue.
create function public.reports_receivable_source(p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id(); v_report jsonb;
begin
 if auth.uid() is null or c is null or not private.reports_can_access('/financial') then raise exception 'Report access denied' using errcode='42501'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Invalid report window' using errcode='22023'; end if;
 if (select count(*) from public.orders where company_id=c and created_at>=p_from::timestamp at time zone 'America/Bahia' and created_at<(p_to+1)::timestamp at time zone 'America/Bahia')>10000 then raise exception 'Narrow the report period' using errcode='54000'; end if;
 with selected as materialized (select id,number,company_id,customer_id,customer_name,status,total_amount,paid_amount,created_at from public.orders where company_id=c and status<>'cancelado' and created_at>=p_from::timestamp at time zone 'America/Bahia' and created_at<(p_to+1)::timestamp at time zone 'America/Bahia'),
 entries as (select f.* from public.financial_transactions f where f.company_id=c and exists(select 1 from selected o where o.id=f.order_id or (f.order_id is null and private.reports_order_key(o.number)=private.reports_order_key(f.order_number))) limit 50001)
 select jsonb_build_object('orders',coalesce((select jsonb_agg(to_jsonb(o)) from selected o),'[]'),'transactions',coalesce((select jsonb_agg(to_jsonb(f)) from entries f),'[]'),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',cu.id,'name',cu.name,'billing_type',cu.billing_type,'payment_terms_days',cu.payment_terms_days)) from public.customers cu where cu.company_id=c and exists(select 1 from selected o where o.customer_id=cu.id or (o.customer_id is null and o.customer_name=cu.name))),'[]')) into v_report;
 if jsonb_array_length(v_report->'transactions')>50000 then raise exception 'Narrow the report period' using errcode='54000'; end if;
 return v_report;
end $$;
revoke all on function public.reports_receivable_source(date,date) from public,anon;
grant execute on function public.reports_receivable_source(date,date) to authenticated;
