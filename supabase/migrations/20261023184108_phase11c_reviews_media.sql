-- Reviews and media extend canonical products; no changes to financial or pricing authority.
create table public.product_reviews (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 product_id text not null references public.products(id), customer_id text not null references public.customers(id),
 order_id text not null references public.orders(id), rating smallint not null check(rating between 1 and 5),
 comment text not null default '' check(char_length(comment)<=1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected','hidden')),
 verified_purchase boolean not null default true check(verified_purchase), revision integer not null default 1,
 submitted_at timestamptz not null default now(), moderated_at timestamptz, moderated_by uuid references auth.users(id),
 moderation_reason text not null default '' check(length(moderation_reason)<=300), unique(order_id,product_id)
);
create index product_review_tenant on public.product_reviews(company_id,submitted_at desc);
create index product_review_public on public.product_reviews(company_id,product_id,submitted_at desc) where status='approved';
create index product_review_customer on public.product_reviews(customer_id);
create index product_review_product on public.product_reviews(product_id);
create index product_review_moderator on public.product_reviews(moderated_by) where moderated_by is not null;
create table private.product_review_tokens (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 product_id text not null references public.products(id), order_id text not null references public.orders(id),
 customer_id text not null references public.customers(id), actor_user_id uuid not null references auth.users(id),
 token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'), expires_at timestamptz not null,
 used_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(), unique(order_id,product_id)
);
create index product_review_token_tenant on private.product_review_tokens(company_id);
create index product_review_token_product on private.product_review_tokens(product_id);
create index product_review_token_customer on private.product_review_tokens(customer_id);
create index product_review_token_actor on private.product_review_tokens(actor_user_id);
create table private.product_review_history (
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.product_reviews(id),
 company_id text not null references public.companies(id),status text not null,reason text not null,created_at timestamptz not null default now()
);
create index product_review_history_ref on private.product_review_history(review_id,created_at);
create index product_review_history_tenant on private.product_review_history(company_id);
-- Retained upload inventory: unbound draft/removed assets are tracked, never deleted blindly.
create table private.product_media_assets (
 path text primary key,company_id text not null references public.companies(id), actor_user_id uuid not null references auth.users(id),
 url text not null unique,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),bytes integer not null check(bytes between 1 and 2097152),
 created_at timestamptz not null default now()
);
create index product_media_asset_tenant on private.product_media_assets(company_id);
create index product_media_asset_actor on private.product_media_assets(actor_user_id);
create table private.product_review_limits (key text primary key,window_start timestamptz not null,count integer not null);
alter table public.product_reviews enable row level security;
alter table private.product_review_tokens enable row level security;
alter table private.product_review_history enable row level security;
alter table private.product_media_assets enable row level security;
alter table private.product_review_limits enable row level security;
revoke all on public.product_reviews from public,anon,authenticated;
revoke all on private.product_review_tokens,private.product_review_history,private.product_media_assets,private.product_review_limits from public,anon,authenticated,service_role;
grant all on public.product_reviews to service_role;

create function private.product_route_access(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.role=any(coalesce(r.roles,case when p_path in ('/products','/orders') then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[] else array['admin','gerente']::text[] end)) from public.profiles p
 left join public.role_permissions r on r.company_id=p.company_id and r.path=p_path
 where p.auth_user_id=auth.uid() and p.active and p.company_id=private.current_company_id() order by p.id limit 1),false)
$$;
revoke all on function private.product_route_access(text) from public,anon,authenticated,service_role;
create function private.product_review_eligible(p_company text,p_order text,p_product text,p_customer text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o join public.order_items i on i.order_id=o.id
 join public.products p on p.id=i.product_id and p.company_id=o.company_id
 join public.customers c on c.id=o.customer_id and c.company_id=o.company_id
 where o.id=p_order and o.company_id=p_company and o.customer_id=p_customer and o.status in ('entregue','finalizado')
 and p.id=p_product and p.active and p.catalog_active and i.quantity>0)
$$;
revoke all on function private.product_review_eligible(text,text,text,text) from public,anon,authenticated,service_role;
create function public.product_reviews_command(p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();o public.orders%rowtype;r public.product_reviews%rowtype;t text;host text;actor uuid;next_status text;reason text;old_status text;
begin
 if not private.catalog_can_access() then raise exception 'Catalog access denied' using errcode='42501';end if;
 if p_action in ('invite','revoke') then
  if not private.product_route_access('/orders') then raise exception 'Order access denied' using errcode='42501';end if;
  select * into o from public.orders where id=p_payload->>'order_id' and company_id=c for update;
  if not found then raise exception 'Compra indisponível.' using errcode='22023';end if;
  if p_action='revoke' then
   update private.product_review_tokens set revoked_at=now() where company_id=c and order_id=o.id and product_id=p_payload->>'product_id' and used_at is null;
   perform private.catalog_audit(c,'product_review.invitation_revoked',o.id,'{}','{}');return '{}';
  end if;
  if not private.product_review_eligible(c,o.id,p_payload->>'product_id',o.customer_id) or exists(select 1 from public.product_reviews where order_id=o.id and product_id=p_payload->>'product_id') then raise exception 'Compra não elegível ou já avaliada.' using errcode='22023';end if;
  select a.auth_user_id into actor from public.store_customer_accounts a where a.company_id=c and a.customer_id=o.customer_id and a.status='active' order by a.id limit 1;
  if actor is null then raise exception 'Cliente precisa de conta ativa na Store.' using errcode='22023';end if;
  t:=encode(extensions.gen_random_bytes(32),'hex');
  insert into private.product_review_tokens(company_id,order_id,product_id,customer_id,actor_user_id,token_hash,expires_at)
  values(c,o.id,p_payload->>'product_id',o.customer_id,actor,encode(extensions.digest(t,'sha256'),'hex'),now()+interval '30 days')
  on conflict(order_id,product_id) do update set token_hash=excluded.token_hash,actor_user_id=excluded.actor_user_id,customer_id=excluded.customer_id,expires_at=excluded.expires_at,revoked_at=null where product_review_tokens.used_at is null;
  if not found then raise exception 'Convite já utilizado.' using errcode='22023';end if;
  perform private.catalog_audit(c,'product_review.invitation_created',o.id,'{}',jsonb_build_object('product_id',p_payload->>'product_id'));
  select coalesce(nullif(store_domain,''),nullif(custom_domain,''),admin_domain) into host from public.companies where id=c;
  -- Raw token is returned once; persisted authority is only its hash.
  return jsonb_build_object('token',t,'host',host);
 elsif p_action in ('approve','reject','hide','restore') then
  select * into r from public.product_reviews where id=(p_payload->>'id')::uuid and company_id=c for update;
  if not found then raise exception 'Avaliação indisponível.' using errcode='P0002';end if;
  if r.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Recarregue a avaliação.' using errcode='40001';end if;
  old_status:=r.status;reason:=btrim(coalesce(p_payload->>'reason',''));
  if length(reason)>300 or (p_action in ('reject','hide') and reason='') then raise exception 'Informe o motivo (até 300 caracteres).' using errcode='22023';end if;
  next_status:=case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' else 'pending' end;
  if (p_action='restore' and r.status not in ('hidden','rejected')) or (p_action='hide' and r.status<>'approved') or (p_action in ('approve','reject') and r.status<>'pending') then raise exception 'Transição de moderação inválida.' using errcode='22023';end if;
  update public.product_reviews set status=next_status,moderated_at=now(),moderated_by=auth.uid(),moderation_reason=reason,revision=revision+1 where id=r.id;
  insert into private.product_review_history(review_id,company_id,status,reason) values(r.id,c,next_status,reason);
  perform private.catalog_audit(c,'product_review.'||case p_action when 'approve' then 'approved' when 'reject' then 'rejected' when 'hide' then 'hidden' else 'restored' end,r.id::text,jsonb_build_object('status',old_status),jsonb_build_object('status',next_status));
  return '{}';
 end if;
 raise exception 'Ação inválida.' using errcode='22023';
end $$;
revoke all on function public.product_reviews_command(text,jsonb) from public,anon;
grant execute on function public.product_reviews_command(text,jsonb) to authenticated;

create function public.product_reviews_source() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();can_order boolean;
begin
 if not private.catalog_can_access() then raise exception 'Catalog access denied' using errcode='42501';end if;
 can_order:=private.product_route_access('/orders');
 return jsonb_build_object('canOrder',can_order,'rows',coalesce((select jsonb_agg(to_jsonb(x)) from (
 select r.id,r.product_id,p.name product,r.rating,r.comment,r.status,r.revision,r.verified_purchase,r.submitted_at,r.moderation_reason,
 left(trim(cu.name),1)||'***' author,case when can_order then r.order_id end order_id,case when can_order then o.number end order_number,
 coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'reason',h.reason,'date',h.created_at) order by h.created_at) from private.product_review_history h where h.review_id=r.id),'[]') history
 from public.product_reviews r join public.products p on p.id=r.product_id and p.company_id=c join public.customers cu on cu.id=r.customer_id and cu.company_id=c join public.orders o on o.id=r.order_id and o.company_id=c where r.company_id=c order by r.submitted_at desc limit 1000) x),'[]'),
 'eligible',case when can_order then coalesce((select jsonb_agg(to_jsonb(x)) from (select distinct o.id order_id,o.number,p.id product_id,p.name product,left(trim(cu.name),1)||'***' author
 from public.orders o join public.order_items i on i.order_id=o.id join public.products p on p.id=i.product_id and p.company_id=c join public.customers cu on cu.id=o.customer_id and cu.company_id=c
 where o.company_id=c and o.status in ('entregue','finalizado') and p.active and p.catalog_active and i.quantity>0
 and exists(select 1 from public.store_customer_accounts a where a.company_id=c and a.customer_id=o.customer_id and a.status='active')
 and not exists(select 1 from public.product_reviews r where r.order_id=o.id and r.product_id=p.id) order by o.id,p.id limit 1000) x),'[]') else '[]'::jsonb end,
 'host',(select coalesce(nullif(store_domain,''),nullif(custom_domain,''),admin_domain) from public.companies where id=c));
end $$;
revoke all on function public.product_reviews_source() from public,anon;
grant execute on function public.product_reviews_source() to authenticated;

create function public.product_reviews_public(p_company text,p_product text,p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if not exists(select 1 from public.products where id=p_product and company_id=p_company and active and catalog_active) then return null;end if;
 return jsonb_build_object('count',(select count(*) from public.product_reviews where company_id=p_company and product_id=p_product and status='approved'),
 'average',(select round(avg(rating),1) from public.product_reviews where company_id=p_company and product_id=p_product and status='approved'),
 'rows',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.id,r.rating,r.comment,left(trim(c.name),1)||'***' author,true verified_purchase,to_char(r.submitted_at at time zone 'America/Bahia','MM/YYYY') date
 from public.product_reviews r join public.customers c on c.id=r.customer_id and c.company_id=p_company where r.company_id=p_company and r.product_id=p_product and r.status='approved'
 order by r.submitted_at desc,r.id limit 10 offset least(greatest(p_page,0),1000)*10) x),'[]'));
end $$;
revoke all on function public.product_reviews_public(text,text,integer) from public,anon,authenticated;
grant execute on function public.product_reviews_public(text,text,integer) to service_role;

create function public.product_review_token(p_company text,p_token text,p_actor uuid default null,p_review jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare t private.product_review_tokens%rowtype;p public.products%rowtype;c public.companies%rowtype;r public.product_reviews%rowtype;comment text;rating numeric;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_token is null or p_token!~'^[a-f0-9]{64}$' then return null;end if;
 select * into t from private.product_review_tokens where company_id=p_company and token_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found or t.revoked_at is not null or t.expires_at<=now() then return null;end if;
 perform 1 from public.orders where id=t.order_id and company_id=p_company for update;
 select * into t from private.product_review_tokens where id=t.id and company_id=p_company and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found then return null;end if;
 if t.revoked_at is not null or t.expires_at<=now() then return null;end if;
 select * into p from public.products where id=t.product_id and company_id=p_company and active and catalog_active for share;
 if not found or not private.product_review_eligible(p_company,t.order_id,t.product_id,t.customer_id) then return null;end if;
 select * into c from public.companies where id=p_company;
 if p_review is not null then
  if p_actor is null or p_actor<>t.actor_user_id or not exists(select 1 from public.store_customer_accounts where company_id=p_company and customer_id=t.customer_id and auth_user_id=p_actor and status='active') then raise exception 'Entre com a conta vinculada à compra.' using errcode='42501';end if;
  if t.used_at is not null then raise exception 'Avaliação já enviada.' using errcode='22023';end if;
  if jsonb_typeof(p_review->'rating') is distinct from 'number' or exists(select 1 from jsonb_object_keys(p_review) k where k not in ('rating','comment')) or (p_review?'comment' and jsonb_typeof(p_review->'comment')<>'string') then raise exception 'Avaliação inválida.' using errcode='22023';end if;
  rating:=(p_review->>'rating')::numeric;
  comment:=btrim(regexp_replace(coalesce(p_review->>'comment',''),'<[^>]*>','','g'));
  if rating<>trunc(rating) or rating not between 1 and 5 or char_length(comment)>1000 or comment~*'@|([0-9][ .()+/-]*){8,}|https?://' then raise exception 'Nota/comentário inválidos; não inclua dados pessoais.' using errcode='22023';end if;
  insert into public.product_reviews(company_id,product_id,customer_id,order_id,rating,comment) values(p_company,p.id,t.customer_id,t.order_id,rating::smallint,comment) returning * into r;
  update private.product_review_tokens set used_at=now() where id=t.id;t.used_at:=now();
  insert into private.product_review_history(review_id,company_id,status,reason) values(r.id,p_company,'pending','Submissão do cliente');
 end if;
 return jsonb_build_object('company',c.name,'logo',coalesce(nullif(c.logo_light,''),nullif(c.logo_url,''),nullif(c.logo_dark,'')),'product',p.name,'image',p.image_url,'productId',p.id,'submitted',t.used_at is not null,'authenticated',p_actor=t.actor_user_id);
end $$;
revoke all on function public.product_review_token(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.product_review_token(text,text,uuid,jsonb) to service_role;

create function public.product_review_rate(p_key text,p_limit integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 insert into private.product_review_limits values(left(p_key,160),date_trunc('minute',now()),1) on conflict(key) do update set count=case when product_review_limits.window_start=date_trunc('minute',now()) then product_review_limits.count+1 else 1 end,window_start=date_trunc('minute',now()) returning count into n;
 delete from private.product_review_limits where window_start<now()-interval '1 day';return n<=least(greatest(p_limit,1),120);
end $$;
revoke all on function public.product_review_rate(text,integer) from public,anon,authenticated;
grant execute on function public.product_review_rate(text,integer) to service_role;

create function public.product_media_access(p_scope text default 'products') returns text language plpgsql stable security definer set search_path='' as $$
begin
 if p_scope not in ('products','catalog','avatars') or not (case when p_scope='products' then private.product_route_access('/products') or private.catalog_can_access() else private.catalog_can_access() end) then raise exception 'Media access denied' using errcode='42501';end if;
 return private.current_company_id();
end $$;
revoke all on function public.product_media_access(text) from public,anon;
grant execute on function public.product_media_access(text) to authenticated;
create function public.product_media_register(p_company text,p_actor uuid,p_path text,p_url text,p_sha text,p_bytes integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if not exists(select 1 from public.profiles where auth_user_id=p_actor and company_id=p_company and active) or split_part(p_path,'/',1)<>p_company or split_part(p_path,'/',2) not in ('products','catalog','avatars') or p_path not like '%/'||p_sha||'.webp' or p_path~'\.\.' or position('/storage/v1/object/public/product-images/'||p_path in p_url)=0 then raise exception 'Invalid asset' using errcode='22023';end if;
 insert into private.product_media_assets(path,company_id,actor_user_id,url,sha256,bytes) values(p_path,p_company,p_actor,p_url,p_sha,p_bytes) on conflict(path) do nothing;
end $$;
revoke all on function public.product_media_register(text,uuid,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.product_media_register(text,uuid,text,text,text,integer) to service_role;

create function private.product_media_known(p_company text,p_url text,p_old jsonb) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((coalesce(p_url='',false) or p_url=p_old->>'image_url' or exists(select 1 from jsonb_array_elements(coalesce(p_old->'gallery_images','[]')) i where i->>'url'=p_url) or
 -- Legacy objects remain canonical-compatible; new uploads become server-only after rollout.
 exists(select 1 from storage.objects o where o.bucket_id='product-images' and split_part(o.name,'/',1)=p_company and split_part(o.name,'/',2)='products' and p_url like '%/storage/v1/object/public/product-images/'||o.name) or
 exists(select 1 from private.product_media_assets a where a.company_id=p_company and a.url=p_url and a.path like p_company||'/products/%') or
 exists(select 1 from public.products p where p.company_id=p_company and (p.image_url=p_url or exists(select 1 from jsonb_array_elements(coalesce(p.pricing_details->'gallery_images','[]')) i where i->>'url'=p_url))) or
 (p_url~'^https://[a-zA-Z0-9.-]+/[^[:space:]<>]*$' and position('/storage/v1/object/public/product-images/' in p_url)=0)),false)
$$;
revoke all on function private.product_media_known(text,text,jsonb) from public,anon,authenticated,service_role;
create function private.product_media_validate() returns trigger language plpgsql security definer set search_path='' as $$
declare gallery jsonb;old_media jsonb;img jsonb;n integer;covers integer:=0;i integer:=0;urls text[]:='{}';video text;old_video text;actor public.profiles%rowtype;
begin
 if tg_op='UPDATE' then
  if new.pricing_details->'gallery_images' is not distinct from old.pricing_details->'gallery_images' and new.pricing_details->'video_url' is not distinct from old.pricing_details->'video_url' and new.image_url is not distinct from old.image_url then return new;end if;
  old_media:=jsonb_build_object('image_url',old.image_url,'gallery_images',coalesce(old.pricing_details->'gallery_images','[]'));old_video:=old.pricing_details->>'video_url';
 end if;
 gallery:=coalesce(new.pricing_details->'gallery_images','[]');
 if tg_op='INSERT' and gallery='[]'::jsonb and coalesce(new.image_url,'')='' and coalesce(new.pricing_details->>'video_url','')='' then return new;end if;
 if jsonb_typeof(gallery)<>'array' or jsonb_array_length(gallery)>3 then raise exception 'Limite de 3 imagens por produto.' using errcode='22023';end if;
 n:=jsonb_array_length(gallery);
 for img in select value from jsonb_array_elements(gallery) loop
  if jsonb_typeof(img)<>'object' or coalesce(img->>'url','')='' or length(coalesce(img->>'alt',''))>200 or (img->>'url')=any(urls) or coalesce((img->>'position')::integer,-1)<>i or not private.product_media_known(new.company_id,img->>'url',old_media) then raise exception 'Mídia inválida ou de outra empresa.' using errcode='22023';end if;
  if coalesce((img->>'is_primary')::boolean,false) then covers:=covers+1;new.image_url:=img->>'url';end if;
  urls:=array_append(urls,img->>'url');i:=i+1;
 end loop;
 if n>0 and covers<>1 then raise exception 'Selecione uma única capa.' using errcode='22023';end if;
 if n=0 and tg_op='UPDATE' and jsonb_array_length(coalesce(old.pricing_details->'gallery_images','[]'))>0 then new.image_url:=null;
 elsif n=0 and coalesce(new.image_url,'')<>'' and not private.product_media_known(new.company_id,new.image_url,old_media) then raise exception 'Imagem não autorizada.' using errcode='22023';end if;
 video:=nullif(new.pricing_details->>'video_url','');
 if video is not null and video!~'^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$' and video!~'^https://vimeo\.com/[0-9]{6,12}$' then raise exception 'Vídeo inválido.' using errcode='22023';end if;
 if auth.uid() is not null then
  if not (private.product_route_access('/products') or private.catalog_can_access()) then raise exception 'Media access denied' using errcode='42501';end if;
  select * into actor from public.profiles where auth_user_id=auth.uid() and company_id=new.company_id and active order by id limit 1;
  if not found then raise exception 'Media access denied' using errcode='42501';end if;
  insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
  values(new.company_id,auth.uid(),actor.id,actor.name,actor.role,
   case when tg_op='INSERT' then 'product_media.created' when n<jsonb_array_length(coalesce(old.pricing_details->'gallery_images','[]')) then 'product_media.deleted' when n>jsonb_array_length(coalesce(old.pricing_details->'gallery_images','[]')) then 'product_media.created' when new.image_url is distinct from old.image_url then 'product_media.cover_changed' when video is distinct from old_video then 'product_media.video_changed' else 'product_media.reordered' end,
   'products',new.id,'products','{}',jsonb_build_object('images',n,'cover_sha256',encode(extensions.digest(coalesce(new.image_url,''),'sha256'),'hex'),'video',video is not null),'{}');
 end if;
 return new;
end $$;
revoke all on function private.product_media_validate() from public,anon,authenticated,service_role;
create trigger product_media_validate before insert or update on public.products for each row execute function private.product_media_validate();

-- Expand phase: preserve old Production upload clients with tenant/route-scoped INSERT.
-- A separate contract migration removes these temporary policies after Production code deployment.
drop policy if exists "Authenticated upload product images" on storage.objects;
drop policy if exists "Authenticated update product images" on storage.objects;
drop policy if exists "Authenticated delete product images" on storage.objects;

create function private.product_media_legacy_write(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(split_part(p_name,'/',1)=private.current_company_id() and
 case split_part(p_name,'/',2) when 'products' then private.product_route_access('/products') or private.catalog_can_access() when 'catalog' then private.catalog_can_access() when 'avatars' then private.catalog_can_access() else false end,false)
$$;
revoke all on function private.product_media_legacy_write(text) from public,anon;
grant execute on function private.product_media_legacy_write(text) to authenticated;
create policy phase11c_legacy_insert on storage.objects for insert to authenticated with check(bucket_id='product-images' and (select private.product_media_legacy_write(name)));
-- Old avatar replacement removes the previous avatar only; no product/gallery deletion.
create policy phase11c_legacy_avatar_delete on storage.objects for delete to authenticated using(bucket_id='product-images' and split_part(name,'/',2)='avatars' and (select private.product_media_legacy_write(name)));

alter table public.catalog_events drop constraint catalog_events_event_type_check;
alter table public.catalog_events add constraint catalog_events_event_type_check check(event_type in ('session_started','page_viewed','product_viewed','product_clicked','cart_item_added','cart_item_removed','checkout_started','search_performed','category_viewed','banner_clicked','coupon_applied','review_viewed','review_submitted','media_viewed','video_opened'));
create or replace function public.catalog_record_events(p_company text,p_session uuid,p_events jsonb) returns void
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
 if e->>'type' not in('session_started','page_viewed','product_viewed','product_clicked','cart_item_added','cart_item_removed','checkout_started','search_performed','category_viewed','banner_clicked','coupon_applied','review_viewed','review_submitted','media_viewed','video_opened') then raise exception 'Invalid event'; end if;
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
