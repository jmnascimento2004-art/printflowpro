-- Explicit product click KPI; no change to prices, grants or canonical documents.
create or replace function public.catalog_source(p_from date,p_to date,p_mode text default 'dashboard',p_page integer default 0) returns jsonb
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
 'summary',jsonb_build_object('sessions',(select count(*) from sessions),'pageViews',(select count(*) from events where event_type='page_viewed'),'productViews',(select count(*) from events where event_type='product_viewed'),'productClicks',(select count(*) from events where event_type='product_clicked'),'cartAdds',(select count(*) from events where event_type='cart_item_added'),'checkouts',(select count(distinct session_id) from events where event_type='checkout_started'),'quotes',(select count(*) from store_quotes),'orders',(select count(*) from store_orders),'revenue',(select coalesce(sum(total_amount),0) from store_orders),'activeProducts',(select count(*) from public.products where company_id=c and active and catalog_active)),
 'funnel',jsonb_build_object('sessions',(select count(*) from sessions),'products',(select count(distinct session_id) from cohort_events where event_type='product_viewed'),'cart',(select count(distinct session_id) from cohort_events where event_type='cart_item_added'),'checkout',(select count(distinct session_id) from cohort_events where event_type='checkout_started'),'quotes',(select count(distinct q.store_origin->>'session_id') from store_quotes q join sessions s on s.id::text=q.store_origin->>'session_id'),'orders',(select count(distinct o.store_origin->>'session_id') from store_orders o join sessions s on s.id::text=o.store_origin->>'session_id')),
 'daily',(select jsonb_agg(jsonb_build_object('date',d.day::date,'sessions',coalesce(s.sessions,0),'orders',coalesce(o.orders,0),'revenue',coalesce(o.revenue,0),'converted_sessions',coalesce(cv.converted,0)) order by d.day) from generate_series(p_from::timestamp,p_to::timestamp,interval '1 day')d(day) left join daily_sessions s on s.day=d.day::date left join daily_orders o on o.day=d.day::date left join daily_conversion cv on cv.day=d.day::date),
 'searches',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from(select search_term term,count(*) searches,count(*) filter(where result_count=0) no_results,max(result_count) results from events where event_type='search_performed' and search_term is not null group by search_term order by count(*) desc,search_term limit 20)t),
 'products',(select coalesce(jsonb_agg(to_jsonb(t)-'r_views'-'r_cart'-'r_orders'-'r_revenue'-'r_conversion' order by views desc,id),'[]') from ranked_products t where least(r_views,r_cart,r_orders,r_revenue,r_conversion)<=20)
 ) into result;
 return result;
end $$;
