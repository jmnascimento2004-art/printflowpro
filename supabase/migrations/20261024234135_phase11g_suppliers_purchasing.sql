-- Additive purchasing integration. All commercial writes pass through one idempotent command.
alter table public.suppliers
 add column person_type text not null default 'PJ' check(person_type in ('PF','PJ')),
 add column document text not null default '',
 add column state_registration text not null default '',
 add column municipal_registration text not null default '',
 add column whatsapp text not null default '',
 add column website text not null default '',
 add column address jsonb not null default '{}' check(jsonb_typeof(address)='object'),
 add column contacts jsonb not null default '[]' check(jsonb_typeof(contacts)='array' and jsonb_array_length(contacts)<=20),
 add column active boolean not null default true,
 add constraint suppliers_tenant_id unique(company_id,id);
create unique index supplier_document_once on public.suppliers(company_id,document) where document<>'';
alter table public.products add constraint purchase_product_tenant unique(company_id,id);

create function private.purchase_valid_document(doc text,kind text) returns boolean language plpgsql immutable set search_path='' as $$
declare base integer;step integer;pos integer;weight integer;total integer;digit integer;begin
 if doc='' then return true;end if;
 if doc is null or doc !~ '^[0-9]+$' or doc ~ '^([0-9])\1+$' then return false;end if;
 base:=case when kind='PF' then 9 when kind='PJ' then 12 else 0 end;
 if base=0 or length(doc)<>base+2 then return false;end if;
 for step in 0..1 loop total:=0;
  for pos in 1..base+step loop
   weight:=case when kind='PF' then base+step+2-pos else ((base+step-pos)%8)+2 end;
   total:=total+substr(doc,pos,1)::integer*weight;
  end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if substr(doc,base+step+1,1)::integer<>digit then return false;end if;
 end loop;
 return true;
end $$;
revoke all on function private.purchase_valid_document(text,text) from public,anon,authenticated;

create function private.purchase_allowed(p_path text default '/purchases') returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select p.role=any(coalesce(r.roles,case p_path
 when '/suppliers' then array['admin','gerente','financeiro','estoque']
 when '/purchases' then array['admin','gerente','financeiro','estoque','producao']
 when '/purchases/approve' then array['admin','gerente','financeiro']
 when '/purchases/receive' then array['admin','gerente','estoque']
 when '/stock' then array['admin','gerente','financeiro','producao','estoque'] else array[]::text[] end))
 from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path=p_path
 where p.auth_user_id=(select auth.uid()) and p.active order by p.id limit 1),false)
$$;
revoke all on function private.purchase_allowed(text) from public,anon;
grant execute on function private.purchase_allowed(text) to authenticated;

create table public.supplier_products(
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 supplier_id text not null, product_id text not null, vendor_sku text not null default '', description text not null default '',
 unit text not null, reference_price numeric(14,4) not null default 0 check(reference_price>=0 and reference_price<=999999999),
 minimum_quantity numeric(10,2) not null default 0 check(minimum_quantity>=0), lead_days integer not null default 0 check(lead_days between 0 and 3650),
 preferred boolean not null default false, updated_at timestamptz not null default now(),
 foreign key(company_id,supplier_id) references public.suppliers(company_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id), unique(company_id,supplier_id,product_id)
);
create unique index supplier_preferred_once on public.supplier_products(company_id,product_id) where preferred;
create table public.purchase_requests(
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id),
 status text not null default 'draft' check(status in ('draft','requested','approved','rejected','converted')),
 reason text not null, priority text not null default 'normal' check(priority in ('low','normal','high','urgent')),
 notes text not null default '', actor uuid not null default auth.uid(), approver uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(company_id,id)
);
create table public.purchase_request_items(
 id uuid primary key default gen_random_uuid(), company_id text not null, request_id uuid not null, product_id text,
 description text not null, unit text not null, quantity numeric(10,2) not null check(quantity>0),
 foreign key(company_id,request_id) references public.purchase_requests(company_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id)
);
create index purchase_request_lines on public.purchase_request_items(company_id,request_id);
create table public.purchase_orders(
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), number bigint not null,
 supplier_id text not null, supplier_snapshot jsonb not null default '{}', request_id uuid,
 status text not null default 'draft' check(status in ('draft','issued','confirmed','partially_received','received','cancelled')),
 ordered_date date not null default current_date, expected_date date, payment_terms text not null default '', notes text not null default '',
 subtotal numeric(14,2) not null default 0 check(subtotal>=0), discount numeric(14,2) not null default 0 check(discount>=0),
 freight numeric(14,2) not null default 0 check(freight>=0), expenses numeric(14,2) not null default 0 check(expenses>=0),
 total numeric(14,2) not null default 0 check(total>=0), invoice_number text not null default '', invoice_series text not null default '', invoice_date date, invoice_key text not null default '',
 actor uuid not null default auth.uid(), confirmed_by uuid, confirmed_at timestamptz, cancelled_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(company_id,supplier_id) references public.suppliers(company_id,id),
 foreign key(company_id,request_id) references public.purchase_requests(company_id,id), unique(company_id,id), unique(company_id,number), unique(company_id,request_id)
);
create index purchase_orders_filter on public.purchase_orders(company_id,ordered_date desc,status);
create index purchase_supplier_orders on public.purchase_orders(company_id,supplier_id,ordered_date desc);
create table public.purchase_order_items(
 id uuid primary key default gen_random_uuid(), company_id text not null, order_id uuid not null, position integer not null,
 product_id text, description text not null, unit text not null, quantity numeric(10,2) not null check(quantity>0),
 unit_price numeric(14,4) not null check(unit_price>=0), line_total numeric(14,2) not null check(line_total>=0),
 acquisition_total numeric(14,2) not null default 0 check(acquisition_total>=0), stock_controlled boolean not null default false,
 foreign key(company_id,order_id) references public.purchase_orders(company_id,id),
 foreign key(company_id,product_id) references public.products(company_id,id), unique(company_id,id), unique(company_id,order_id,position), unique(company_id,order_id,id)
);
create table public.purchase_receipts(
 id uuid primary key default gen_random_uuid(), company_id text not null, order_id uuid not null,
 received_date date not null, notes text not null default '', actor uuid not null default auth.uid(),
 reversed_at timestamptz, reversed_by uuid, reversal_reason text, created_at timestamptz not null default now(),
 foreign key(company_id,order_id) references public.purchase_orders(company_id,id), unique(company_id,id),unique(company_id,order_id,id)
);
create index purchase_receipts_order on public.purchase_receipts(company_id,order_id);
create table public.purchase_receipt_items(
 id uuid primary key default gen_random_uuid(), company_id text not null, order_id uuid not null, receipt_id uuid not null, item_id uuid not null,
 quantity numeric(10,2) not null check(quantity>0), unit_cost numeric(16,6) not null check(unit_cost>=0),
 stock_movement_id text references public.stock_movements(id), reversal_movement_id text references public.stock_movements(id),
 foreign key(company_id,order_id,receipt_id) references public.purchase_receipts(company_id,order_id,id),
 foreign key(company_id,order_id,item_id) references public.purchase_order_items(company_id,order_id,id), unique(receipt_id,item_id)
);
create index purchase_receipt_lines on public.purchase_receipt_items(company_id,item_id);
create table public.purchase_installments(
 id uuid primary key default gen_random_uuid(), company_id text not null, order_id uuid not null, position integer not null,
 due_date date not null, amount numeric(14,2) not null check(amount>0), financial_id text references public.financial_transactions(id),
 foreign key(company_id,order_id) references public.purchase_orders(company_id,id), unique(company_id,order_id,position),unique(financial_id)
);
create index purchase_installments_order on public.purchase_installments(company_id,order_id);
create table public.purchase_attachments(
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),supplier_id text,order_id uuid,
 path text not null unique,name text not null check(length(name) between 1 and 180),mime text not null check(mime in ('application/pdf','application/xml','text/xml','image/jpeg','image/png')),
 bytes integer not null check(bytes between 1 and 5242880),actor uuid not null default auth.uid(),created_at timestamptz not null default now(),
 check(num_nonnulls(supplier_id,order_id)=1), foreign key(company_id,supplier_id) references public.suppliers(company_id,id),foreign key(company_id,order_id) references public.purchase_orders(company_id,id)
);
create index purchase_attachments_supplier on public.purchase_attachments(company_id,supplier_id);
create index purchase_attachments_order on public.purchase_attachments(company_id,order_id);
create table private.purchase_commands(company_id text not null,operation_id uuid not null,action text not null,payload jsonb not null,result jsonb not null,actor uuid not null,created_at timestamptz not null default now(),primary key(company_id,operation_id));
create table private.purchase_counters(company_id text primary key references public.companies(id),last_number bigint not null default 0);
alter table private.purchase_commands enable row level security;
alter table private.purchase_counters enable row level security;
revoke all on private.purchase_commands,private.purchase_counters from public,anon,authenticated;

-- No direct client mutations of the normalized purchasing graph.
do $$ declare t text;begin foreach t in array array['supplier_products','purchase_requests','purchase_request_items','purchase_orders','purchase_order_items','purchase_receipts','purchase_receipt_items','purchase_installments','purchase_attachments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy purchase_read on public.%I for select to authenticated using(company_id=(select private.current_company_id()) and (select private.purchase_allowed(%L)))',t,case when t='supplier_products' then '/suppliers' else '/purchases' end);
 end loop;end $$;
revoke insert,update,delete on public.suppliers from authenticated;
-- Legacy permissive tenant policies remain for compatibility; this restrictive
-- boundary also protects the newly expanded private supplier registry via REST.
create policy suppliers_private_registry on public.suppliers as restrictive for select to authenticated
 using(company_id=(select private.current_company_id()) and (select private.purchase_allowed('/suppliers')));

create function private.purchase_audit(p_action text,p_entity text,p_id text,p_new jsonb,p_operation uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype;begin
 select * into strict a from public.profiles where auth_user_id=auth.uid() and active order by id limit 1;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values,metadata)
 values(a.company_id,auth.uid(),a.id,a.name,a.role,p_action,p_entity,p_id,'purchases',p_new,jsonb_build_object('operation_id',p_operation));
end $$;
revoke all on function private.purchase_audit(text,text,text,jsonb,uuid) from public,anon,authenticated;

create function private.purchase_status(c text,o uuid) returns void language plpgsql security definer set search_path='' as $$
declare ordered numeric; received numeric;begin
 select sum(quantity) into ordered from public.purchase_order_items where company_id=c and order_id=o;
 select coalesce(sum(i.quantity),0) into received from public.purchase_receipt_items i join public.purchase_receipts r on r.id=i.receipt_id and r.company_id=i.company_id where i.company_id=c and i.order_id=o and r.reversed_at is null;
 update public.purchase_orders set status=case when received=0 then 'confirmed' when received=ordered then 'received' else 'partially_received' end,updated_at=clock_timestamp() where company_id=c and id=o;
end $$;
revoke all on function private.purchase_status(text,uuid) from public,anon,authenticated;

create function public.purchase_command(p_operation_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id(); memo private.purchase_commands%rowtype; s public.suppliers%rowtype; o public.purchase_orders%rowtype;
 q public.purchase_requests%rowtype; product public.products%rowtype; line public.purchase_order_items%rowtype; receipt public.purchase_receipts%rowtype;
 x jsonb; y record; result jsonb; v_id uuid; v_text text; v_number bigint; v_sub numeric:=0; v_total numeric; v_qty numeric; v_price numeric; v_position integer:=0;
 v_received numeric; v_allocated numeric:=0; v_cost numeric; v_stock jsonb; v_fin jsonb; v_account uuid; v_category uuid; v_method text; v_financial public.financial_transactions%rowtype;v_old_name text;v_old_active boolean;
begin
 if auth.uid() is null or c is null or not private.purchase_allowed(case when p_action in ('supplier_save','supplier_link','attachment_add') and p_payload->>'supplier_id' is not null or p_action='supplier_save' then '/suppliers' else '/purchases' end) then raise exception 'Sem permissão para esta operação.' using errcode='42501';end if;
 if p_operation_id is null or p_action is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>200000 then raise exception 'Comando inválido.' using errcode='22023';end if;
 perform private.saas_assert_write(c,null);
 -- Replay is a read of a privileged receipt, never an authorization credential.
 if p_action in ('receive','receipt_reverse') and (not private.purchase_allowed('/purchases/receive') or not private.purchase_allowed('/stock')) then raise exception 'Sem permissão para receber ou reverter estoque.' using errcode='42501';end if;
 if ((p_action='order_transition' and p_payload->>'status' in ('confirmed','cancelled')) or (p_action='request_transition' and p_payload->>'status' in ('approved','rejected'))) and not private.purchase_allowed('/purchases/approve') then raise exception 'Sem permissão para aprovar compras.' using errcode='42501';end if;
 if (p_action='payables_generate' or (p_action='order_transition' and p_payload->>'status'='cancelled' and exists(select 1 from public.purchase_installments where company_id=c and order_id=(p_payload->>'id')::uuid and financial_id is not null))) and not private.finance_can_access() then raise exception 'Contas a pagar exigem acesso ao Financeiro.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('purchase:'||c,0));
 select * into memo from private.purchase_commands where company_id=c and operation_id=p_operation_id;
 if found then
  if memo.actor is distinct from auth.uid() then raise exception 'Sem permissão para repetir operação de outro usuário.' using errcode='42501';end if;
  if memo.action<>p_action or memo.payload<>p_payload then raise exception 'Chave de operação reutilizada.' using errcode='22023';end if;
  return memo.result;
 end if;

 if p_action='supplier_save' then
  if length(btrim(coalesce(p_payload->>'name',''))) not between 2 and 160 then raise exception 'Informe o nome do fornecedor.' using errcode='22023';end if;
  v_text:=nullif(p_payload->>'id','');
  if v_text is not null then select * into s from public.suppliers where company_id=c and id=v_text for update;
   if not found then raise exception 'Fornecedor indisponível.' using errcode='P0002';end if;
   if s.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Registro atualizado por outra pessoa.' using errcode='40001';end if;
  end if;
  if exists(select 1 from public.suppliers where company_id=c and lower(btrim(name))=lower(btrim(p_payload->>'name')) and id<>coalesce(v_text,'')) then raise exception 'Já existe fornecedor com esse nome.' using errcode='23505';end if;
  if not private.purchase_valid_document(coalesce(p_payload->>'document',''),coalesce(p_payload->>'person_type','PJ')) then raise exception 'Documento deve conter CPF ou CNPJ válido, somente números.' using errcode='22023';end if;
  if length(coalesce(p_payload->>'phone',''))>30 or length(coalesce(p_payload->>'email',''))>180 or length(coalesce(p_payload->>'notes',''))>4000 or octet_length(coalesce(p_payload->'address','{}')::text)>3000 or octet_length(coalesce(p_payload->'contacts','[]')::text)>10000 then raise exception 'Dados do fornecedor acima do limite.' using errcode='22023';end if;
  v_old_name:=s.name;v_old_active:=s.active;
  insert into public.suppliers(id,company_id,name,person_type,document,contact_name,phone,email,notes,state_registration,municipal_registration,whatsapp,website,address,contacts,active)
  values(coalesce(s.id,gen_random_uuid()::text),c,btrim(p_payload->>'name'),coalesce(p_payload->>'person_type','PJ'),coalesce(p_payload->>'document',''),left(coalesce(p_payload->>'contact_name',''),160),coalesce(p_payload->>'phone',''),coalesce(p_payload->>'email',''),coalesce(p_payload->>'notes',''),left(coalesce(p_payload->>'state_registration',''),60),left(coalesce(p_payload->>'municipal_registration',''),60),left(coalesce(p_payload->>'whatsapp',''),30),left(coalesce(p_payload->>'website',''),250),coalesce(p_payload->'address','{}'),coalesce(p_payload->'contacts','[]'),coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,person_type=excluded.person_type,document=excluded.document,contact_name=excluded.contact_name,phone=excluded.phone,email=excluded.email,notes=excluded.notes,state_registration=excluded.state_registration,municipal_registration=excluded.municipal_registration,whatsapp=excluded.whatsapp,website=excluded.website,address=excluded.address,contacts=excluded.contacts,active=excluded.active returning * into s;
  result:=jsonb_build_object('supplier',to_jsonb(s));
  -- Existing canonical audit covers insert/name edits. Add only fields outside its
  -- legacy name-only projection, avoiding duplicate supplier.created/updated events.
  if v_text is not null and ((not s.active and v_old_active) or s.name is not distinct from v_old_name) then
   perform private.purchase_audit(case when not s.active and v_old_active then 'supplier.disabled' else 'supplier.updated' end,'suppliers',s.id,jsonb_build_object('name',s.name,'active',s.active),p_operation_id);
  end if;
 elsif p_action='supplier_link' then
  select * into s from public.suppliers where company_id=c and id=p_payload->>'supplier_id' and active for update;
  select * into product from public.products where company_id=c and id=p_payload->>'product_id' and active for update;
  if s.id is null or product.id is null or p_payload->>'unit' is distinct from product.pricing_type then raise exception 'Fornecedor e produto ativos e unidade canônica são obrigatórios.' using errcode='22023';end if;
  if coalesce((p_payload->>'preferred')::boolean,false) then update public.supplier_products set preferred=false where company_id=c and product_id=product.id and preferred;end if;
  insert into public.supplier_products(company_id,supplier_id,product_id,vendor_sku,description,unit,reference_price,minimum_quantity,lead_days,preferred)
  values(c,s.id,product.id,left(coalesce(p_payload->>'vendor_sku',''),100),left(coalesce(p_payload->>'description',''),500),product.pricing_type,coalesce((p_payload->>'reference_price')::numeric,0),coalesce((p_payload->>'minimum_quantity')::numeric,0),coalesce((p_payload->>'lead_days')::integer,0),coalesce((p_payload->>'preferred')::boolean,false))
  on conflict(company_id,supplier_id,product_id) do update set vendor_sku=excluded.vendor_sku,description=excluded.description,reference_price=excluded.reference_price,minimum_quantity=excluded.minimum_quantity,lead_days=excluded.lead_days,preferred=excluded.preferred,updated_at=clock_timestamp() returning id into v_id;
  result:=jsonb_build_object('id',v_id);perform private.purchase_audit('supplier.product_linked','supplier_products',v_id::text,jsonb_build_object('supplier_id',s.id,'product_id',product.id),p_operation_id);
 elsif p_action in ('request_save','request_transition') then
  if nullif(p_payload->>'id','') is not null then
   select * into q from public.purchase_requests where company_id=c and id=(p_payload->>'id')::uuid for update;
   if not found then raise exception 'Solicitação indisponível.' using errcode='P0002';end if;
   if q.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Solicitação atualizada por outra pessoa.' using errcode='40001';end if;
  elsif p_action='request_transition' then raise exception 'Solicitação obrigatória.' using errcode='22023';end if;
  if p_action='request_save' then
   if q.id is not null and q.status<>'draft' then raise exception 'Somente rascunho pode ser editado.' using errcode='22023';end if;
   if length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 500 or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Informe motivo e itens da solicitação.' using errcode='22023';end if;
   if q.id is null then insert into public.purchase_requests(company_id,reason) values(c,p_payload->>'reason') returning * into q;else delete from public.purchase_request_items where company_id=c and request_id=q.id;end if;
   update public.purchase_requests set reason=p_payload->>'reason',priority=coalesce(p_payload->>'priority','normal'),notes=left(coalesce(p_payload->>'notes',''),2000),updated_at=clock_timestamp() where id=q.id;
   for x in select value from jsonb_array_elements(p_payload->'items') loop
    product:=null;
    if nullif(x->>'product_id','') is not null then select * into product from public.products where company_id=c and id=x->>'product_id' and active;if not found then raise exception 'Produto indisponível.' using errcode='22023';end if;end if;
    if length(btrim(coalesce(x->>'description',''))) not between 1 and 500 or length(coalesce(x->>'unit','')) not between 1 and 30 or (product.id is not null and x->>'unit' is distinct from product.pricing_type) then raise exception 'Descrição ou unidade inválida.' using errcode='22023';end if;
    insert into public.purchase_request_items(company_id,request_id,product_id,description,unit,quantity) values(c,q.id,product.id,x->>'description',x->>'unit',(x->>'quantity')::numeric);
   end loop;
   perform private.purchase_audit(case when nullif(p_payload->>'id','') is null then 'purchase_request.created' else 'purchase_request.updated' end,'purchase_requests',q.id::text,jsonb_build_object('status','draft'),p_operation_id);
  else
   if p_payload->>'status' in ('approved','rejected') and not private.purchase_allowed('/purchases/approve') then raise exception 'Sem permissão para aprovar.' using errcode='42501';end if;
   if not ((q.status='draft' and p_payload->>'status'='requested') or (q.status='requested' and p_payload->>'status' in ('approved','rejected'))) then raise exception 'Transição de solicitação inválida.' using errcode='22023';end if;
   update public.purchase_requests set status=p_payload->>'status',approver=case when p_payload->>'status' in ('approved','rejected') then auth.uid() end,updated_at=clock_timestamp() where id=q.id;
   perform private.purchase_audit('purchase_request.'||(p_payload->>'status'),'purchase_requests',q.id::text,jsonb_build_object('status',p_payload->>'status'),p_operation_id);
  end if;
  result:=jsonb_build_object('id',q.id);
 elsif p_action='order_save' then
  if nullif(p_payload->>'id','') is not null then
   select * into o from public.purchase_orders where company_id=c and id=(p_payload->>'id')::uuid for update;
   if not found then raise exception 'Compra indisponível.' using errcode='P0002';end if;
   if o.status<>'draft' then raise exception 'Somente rascunho pode ser editado.' using errcode='22023';end if;
   if o.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Compra atualizada por outra pessoa.' using errcode='40001';end if;
  end if;
  select * into s from public.suppliers where company_id=c and id=p_payload->>'supplier_id' and active for update;
  if not found then raise exception 'Selecione um fornecedor ativo.' using errcode='22023';end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 or jsonb_typeof(p_payload->'installments') is distinct from 'array' or jsonb_array_length(p_payload->'installments') not between 1 and 60 then raise exception 'Informe de 1 a 100 itens e de 1 a 60 parcelas.' using errcode='22023';end if;
  if o.id is null then
   if nullif(p_payload->>'request_id','') is not null then
    select * into q from public.purchase_requests where company_id=c and id=(p_payload->>'request_id')::uuid for update;
    if not found or q.status<>'approved' then raise exception 'Solicitação deve estar aprovada.' using errcode='22023';end if;
   end if;
   insert into private.purchase_counters(company_id,last_number) values(c,1) on conflict(company_id) do update set last_number=private.purchase_counters.last_number+1 returning last_number into v_number;
   insert into public.purchase_orders(company_id,number,supplier_id,request_id) values(c,v_number,s.id,q.id) returning * into o;
   if q.id is not null then update public.purchase_requests set status='converted',updated_at=clock_timestamp() where id=q.id;end if;
  else delete from public.purchase_order_items where company_id=c and order_id=o.id;delete from public.purchase_installments where company_id=c and order_id=o.id;end if;
  for x in select value from jsonb_array_elements(p_payload->'items') loop
   product:=null;v_position:=v_position+1;v_qty:=(x->>'quantity')::numeric;v_price:=(x->>'unit_price')::numeric;
   if v_qty is null or v_qty<=0 or v_qty<>round(v_qty,2) or v_price is null or v_price<0 or v_price<>round(v_price,4) then raise exception 'Quantidade ou preço inválido.' using errcode='22023';end if;
   if nullif(x->>'product_id','') is not null then select * into product from public.products where company_id=c and id=x->>'product_id' and active for update;if not found then raise exception 'Produto indisponível.' using errcode='22023';end if;end if;
   if length(btrim(coalesce(x->>'description',''))) not between 1 and 500 or length(coalesce(x->>'unit','')) not between 1 and 30 or (product.id is not null and x->>'unit' is distinct from product.pricing_type) then raise exception 'Descrição ou unidade inválida.' using errcode='22023';end if;
   insert into public.purchase_order_items(company_id,order_id,position,product_id,description,unit,quantity,unit_price,line_total,stock_controlled)
   values(c,o.id,v_position,product.id,x->>'description',x->>'unit',v_qty,v_price,round(v_qty*v_price,2),coalesce(product.stock_controlled,false));
   v_sub:=v_sub+round(v_qty*v_price,2);
  end loop;
  foreach v_text in array array['discount','freight','expenses'] loop
   if coalesce((p_payload->>v_text)::numeric,0)<0 or coalesce((p_payload->>v_text)::numeric,0)<>round(coalesce((p_payload->>v_text)::numeric,0),2) then raise exception 'Total: desconto, frete e despesas exigem valores não negativos com duas casas.' using errcode='22023';end if;
  end loop;
  v_total:=v_sub-coalesce((p_payload->>'discount')::numeric,0)+coalesce((p_payload->>'freight')::numeric,0)+coalesce((p_payload->>'expenses')::numeric,0);
  if v_sub<=0 or v_total<=0 or coalesce((p_payload->>'discount')::numeric,0)>v_sub or v_total>9999999999 or v_total<>round(v_total,2) then raise exception 'Total ou desconto inválido.' using errcode='22023';end if;
  v_received:=0;
  for line in select * from public.purchase_order_items where company_id=c and order_id=o.id order by position loop
   v_received:=v_received+line.line_total;
   v_cost:=round(v_total*v_received/v_sub,2)-v_allocated;v_allocated:=v_allocated+v_cost;
   update public.purchase_order_items set acquisition_total=v_cost where id=line.id;
  end loop;
  v_position:=0;v_allocated:=0;
  for x in select value from jsonb_array_elements(p_payload->'installments') loop
   v_position:=v_position+1;
   if (x->>'amount')::numeric is null or (x->>'amount')::numeric<>round((x->>'amount')::numeric,2) then raise exception 'Parcela inválida.' using errcode='22023';end if;
   insert into public.purchase_installments(company_id,order_id,position,due_date,amount) values(c,o.id,v_position,(x->>'due_date')::date,(x->>'amount')::numeric);
   v_allocated:=v_allocated+(x->>'amount')::numeric;
  end loop;
  if v_allocated<>v_total then raise exception 'A soma das parcelas deve coincidir com o total.' using errcode='22023';end if;
  update public.purchase_orders set supplier_id=s.id,supplier_snapshot=jsonb_build_object('name',s.name,'person_type',s.person_type,'document',s.document,'phone',s.phone,'whatsapp',s.whatsapp,'email',s.email,'address',s.address,'contact_name',s.contact_name),ordered_date=(p_payload->>'ordered_date')::date,expected_date=nullif(p_payload->>'expected_date','')::date,payment_terms=left(coalesce(p_payload->>'payment_terms',''),1000),notes=left(coalesce(p_payload->>'notes',''),4000),subtotal=v_sub,discount=coalesce((p_payload->>'discount')::numeric,0),freight=coalesce((p_payload->>'freight')::numeric,0),expenses=coalesce((p_payload->>'expenses')::numeric,0),total=v_total,updated_at=clock_timestamp() where id=o.id;
  result:=jsonb_build_object('id',o.id);perform private.purchase_audit(case when nullif(p_payload->>'id','') is null then 'purchase_order.created' else 'purchase_order.updated' end,'purchase_orders',o.id::text,jsonb_build_object('number',o.number,'total',v_total,'status','draft'),p_operation_id);
 elsif p_action in ('order_transition','receive','receipt_reverse','payables_generate','invoice_save') then
  select * into o from public.purchase_orders where company_id=c and id=(p_payload->>'id')::uuid for update;
  if not found then raise exception 'Compra indisponível.' using errcode='P0002';end if;
  if o.updated_at is distinct from (p_payload->>'updated_at')::timestamptz then raise exception 'Compra atualizada por outra pessoa.' using errcode='40001';end if;
  if p_action='order_transition' then
   if p_payload->>'status'='issued' and o.status='draft' then update public.purchase_orders set status='issued',updated_at=clock_timestamp() where id=o.id;
   elsif p_payload->>'status'='confirmed' and o.status in ('draft','issued') then
    if not private.purchase_allowed('/purchases/approve') then raise exception 'Sem permissão para confirmar.' using errcode='42501';end if;
    select * into s from public.suppliers where company_id=c and id=o.supplier_id and active for update;if not found then raise exception 'Fornecedor inativo.' using errcode='22023';end if;
    update public.purchase_orders set status='confirmed',confirmed_by=auth.uid(),confirmed_at=clock_timestamp(),updated_at=clock_timestamp() where id=o.id;
   elsif p_payload->>'status'='cancelled' and o.status<>'cancelled' then
    if not private.purchase_allowed('/purchases/approve') then raise exception 'Sem permissão para cancelar.' using errcode='42501';end if;
    if exists(select 1 from public.purchase_receipts where company_id=c and order_id=o.id and reversed_at is null) then raise exception 'Reverta os recebimentos antes de cancelar.' using errcode='22023';end if;
    if exists(select 1 from public.purchase_installments where company_id=c and order_id=o.id and financial_id is not null) then
     if not private.finance_can_access() then raise exception 'Cancelamento com parcelas exige Financeiro.' using errcode='42501';end if;
     perform pg_advisory_xact_lock(hashtextextended('finance:'||c,0));
     for v_financial in select f.* from public.financial_transactions f join public.purchase_installments i on i.financial_id=f.id where i.company_id=c and i.order_id=o.id order by i.position for update of f loop
      if v_financial.status='pago' then raise exception 'Estorne o pagamento no Financeiro antes de cancelar.' using errcode='22023';end if;
      if v_financial.cancelled_at is null then perform public.finance_command(gen_random_uuid(),'payable_cancel',jsonb_build_object('id',v_financial.id,'updated_at',v_financial.updated_at));end if;
     end loop;
    end if;
    update public.purchase_orders set status='cancelled',cancelled_at=clock_timestamp(),updated_at=clock_timestamp() where id=o.id;
   else raise exception 'Transição de compra inválida.' using errcode='22023';end if;
   perform private.purchase_audit('purchase_order.'||(p_payload->>'status'),'purchase_orders',o.id::text,jsonb_build_object('status',p_payload->>'status'),p_operation_id);
  elsif p_action='receive' then
   if not private.purchase_allowed('/purchases/receive') or not private.purchase_allowed('/stock') then raise exception 'Recebimento exige permissão de Compras e Estoque.' using errcode='42501';end if;
   if o.status not in ('confirmed','partially_received') or jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'Compra ou itens não permitem recebimento.' using errcode='22023';end if;
   if (p_payload->>'received_date')::date>(now() at time zone 'America/Bahia')::date or (p_payload->>'received_date')::date<o.ordered_date then raise exception 'Recebimento deve ocorrer entre a data do pedido e hoje.' using errcode='22023';end if;
   insert into public.purchase_receipts(company_id,order_id,received_date,notes) values(c,o.id,(p_payload->>'received_date')::date,left(coalesce(p_payload->>'notes',''),2000)) returning * into receipt;
   -- Product lock ordering is stable across purchase commands and stock operations.
   perform p.id from public.products p join public.purchase_order_items i on i.product_id=p.id and i.company_id=p.company_id where i.company_id=c and i.order_id=o.id order by p.id for update of p;
   for x in select value from jsonb_array_elements(p_payload->'items') order by value->>'item_id' loop
    select * into line from public.purchase_order_items where company_id=c and order_id=o.id and id=(x->>'item_id')::uuid for update;
    if not found then raise exception 'Item não pertence à compra.' using errcode='22023';end if;
    v_qty:=(x->>'quantity')::numeric;
    select coalesce(sum(i.quantity),0) into v_received from public.purchase_receipt_items i join public.purchase_receipts r on r.company_id=i.company_id and r.id=i.receipt_id where i.company_id=c and i.item_id=line.id and r.reversed_at is null;
    if v_qty is null or v_qty<=0 or v_qty<>round(v_qty,2) or v_received+v_qty>line.quantity then raise exception 'Quantidade excede o saldo ou é inválida.' using errcode='22023';end if;
    v_cost:=round(line.acquisition_total/line.quantity,6);v_text:=null;
    if line.stock_controlled then
     select * into product from public.products where id=line.product_id and company_id=c;
     if not product.stock_controlled or product.pricing_type<>line.unit then raise exception 'Controle/unidade do produto mudou; regularize antes de receber.' using errcode='22023';end if;
     v_stock:=public.adjust_inventory_stock(line.product_id,v_qty,'entrada','Compra PC-'||lpad(o.number::text,4,'0')||' · recebimento '||receipt.id,round(v_cost,2),null);
     if v_stock->>'status'<>'UPDATED' then raise exception 'Falha na entrada de estoque.' using errcode='22023';end if;
     v_text:=v_stock#>>'{movement,id}';
    end if;
    insert into public.purchase_receipt_items(company_id,order_id,receipt_id,item_id,quantity,unit_cost,stock_movement_id) values(c,o.id,receipt.id,line.id,v_qty,v_cost,v_text);
   end loop;
   perform private.purchase_status(c,o.id);perform private.purchase_audit('purchase.received','purchase_receipts',receipt.id::text,jsonb_build_object('order_id',o.id,'date',receipt.received_date),p_operation_id);
  elsif p_action='receipt_reverse' then
   if not private.purchase_allowed('/purchases/receive') or not private.purchase_allowed('/stock') then raise exception 'Reversão exige permissão de Compras e Estoque.' using errcode='42501';end if;
   select * into receipt from public.purchase_receipts where company_id=c and order_id=o.id and id=(p_payload->>'receipt_id')::uuid for update;
   if not found or receipt.reversed_at is not null or length(btrim(coalesce(p_payload->>'reason',''))) not between 3 and 500 then raise exception 'Recebimento já revertido ou motivo inválido.' using errcode='22023';end if;
   perform p.id from public.products p join public.purchase_order_items i on i.product_id=p.id and i.company_id=p.company_id where i.company_id=c and i.order_id=o.id order by p.id for update of p;
   for y in select ri.*,i.product_id from public.purchase_receipt_items ri join public.purchase_order_items i on i.company_id=ri.company_id and i.id=ri.item_id where ri.company_id=c and ri.receipt_id=receipt.id order by i.product_id,ri.id loop
    if y.stock_movement_id is not null then
     v_stock:=public.adjust_inventory_stock(y.product_id,y.quantity,'saida','Estorno compra PC-'||lpad(o.number::text,4,'0')||' · '||receipt.id,round(y.unit_cost,2),null);
     if v_stock->>'status'<>'UPDATED' then raise exception 'Estoque insuficiente para reverter recebimento.' using errcode='22023';end if;
     update public.purchase_receipt_items set reversal_movement_id=v_stock#>>'{movement,id}' where id=y.id;
    end if;
   end loop;
   update public.purchase_receipts set reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=p_payload->>'reason' where id=receipt.id;
   perform private.purchase_status(c,o.id);perform private.purchase_audit('purchase.reversed','purchase_receipts',receipt.id::text,jsonb_build_object('order_id',o.id,'reason',p_payload->>'reason'),p_operation_id);
  elsif p_action='payables_generate' then
   if not private.finance_can_access() then raise exception 'Contas a pagar exigem acesso ao Financeiro.' using errcode='42501';end if;
   if o.status not in ('confirmed','partially_received','received') then raise exception 'Confirme a compra antes de gerar parcelas.' using errcode='22023';end if;
   if exists(select 1 from public.purchase_installments where company_id=c and order_id=o.id and financial_id is not null) then raise exception 'Contas a pagar já geradas.' using errcode='22023';end if;
   v_account:=(p_payload->>'account_id')::uuid;v_category:=(p_payload->>'category_id')::uuid;v_method:=p_payload->>'method';
   for y in select * from public.purchase_installments where company_id=c and order_id=o.id order by position for update loop
    v_fin:=public.finance_command(gen_random_uuid(),'payable_create',jsonb_build_object('account_id',v_account,'category_id',v_category,'supplier_id',o.supplier_id,'amount',y.amount,'description','Compra PC-'||lpad(o.number::text,4,'0')||' · parcela '||y.position,'method',v_method,'date',y.due_date,'notes',o.payment_terms));
    update public.purchase_installments set financial_id=v_fin#>>'{transaction,id}' where id=y.id;
   end loop;
   update public.purchase_orders set updated_at=clock_timestamp() where id=o.id;
   perform private.purchase_audit('purchase.payables_generated','purchase_orders',o.id::text,jsonb_build_object('number',o.number),p_operation_id);
  elsif p_action='invoice_save' then
   if o.status='cancelled' then raise exception 'Compra cancelada.' using errcode='22023';end if;
   if coalesce(p_payload->>'invoice_key','')<>'' and p_payload->>'invoice_key' !~ '^[0-9]{44}$' then raise exception 'Chave fiscal deve conter 44 números.' using errcode='22023';end if;
   update public.purchase_orders set invoice_number=left(coalesce(p_payload->>'invoice_number',''),60),invoice_series=left(coalesce(p_payload->>'invoice_series',''),30),invoice_date=nullif(p_payload->>'invoice_date','')::date,invoice_key=coalesce(p_payload->>'invoice_key',''),updated_at=clock_timestamp() where id=o.id;
   perform private.purchase_audit('purchase.invoice_updated','purchase_orders',o.id::text,jsonb_build_object('number',o.number),p_operation_id);
  end if;
  result:=jsonb_build_object('id',o.id,'receipt_id',receipt.id);
 elsif p_action='attachment_add' then
  if p_payload->>'supplier_id' is not null then select * into s from public.suppliers where company_id=c and id=p_payload->>'supplier_id';if not found then raise exception 'Fornecedor indisponível.' using errcode='P0002';end if;
  else select * into o from public.purchase_orders where company_id=c and id=(p_payload->>'order_id')::uuid;if not found then raise exception 'Compra indisponível.' using errcode='P0002';end if;end if;
  v_text:=c||(case when s.id is not null then '/supplier/'||s.id else '/order/'||o.id::text end)||'/';
  if left(p_payload->>'path',length(v_text)) is distinct from v_text or not exists(select 1 from storage.objects where bucket_id='purchase-documents' and name=p_payload->>'path' and (metadata->>'size')::bigint=(p_payload->>'bytes')::bigint and metadata->>'mimetype'=p_payload->>'mime') then raise exception 'Arquivo privado indisponível.' using errcode='22023';end if;
  insert into public.purchase_attachments(company_id,supplier_id,order_id,path,name,mime,bytes) values(c,s.id,o.id,p_payload->>'path',p_payload->>'name',p_payload->>'mime',(p_payload->>'bytes')::integer) returning id into v_id;
  result:=jsonb_build_object('id',v_id);perform private.purchase_audit('purchase.attachment_added','purchase_attachments',v_id::text,jsonb_build_object('supplier_id',s.id,'order_id',o.id),p_operation_id);
 else raise exception 'Operação desconhecida.' using errcode='22023';end if;
 result:=jsonb_build_object('status','UPDATED','company_id',c)||result;
 if receipt.id is not null then
  result:=result||jsonb_build_object(
   'products',coalesce((select jsonb_agg(to_jsonb(p)) from public.products p where p.company_id=c and p.id in(select i.product_id from public.purchase_order_items i join public.purchase_receipt_items ri on ri.item_id=i.id and ri.company_id=i.company_id where ri.company_id=c and ri.receipt_id=receipt.id)),'[]'),
   'movements',coalesce((select jsonb_agg(to_jsonb(m)) from public.stock_movements m where m.company_id=c and m.id in(select ri.stock_movement_id from public.purchase_receipt_items ri where ri.company_id=c and ri.receipt_id=receipt.id union all select ri.reversal_movement_id from public.purchase_receipt_items ri where ri.company_id=c and ri.receipt_id=receipt.id)),'[]'));
 end if;
 if p_action='payables_generate' or (p_action='order_transition' and p_payload->>'status'='cancelled' and private.finance_can_access()) then
  result:=result||jsonb_build_object('financial',coalesce((select jsonb_agg(to_jsonb(f)) from public.financial_transactions f join public.purchase_installments i on i.financial_id=f.id and i.company_id=f.company_id where i.company_id=c and i.order_id=o.id),'[]'));
 end if;
 insert into private.purchase_commands(company_id,operation_id,action,payload,result,actor) values(c,p_operation_id,p_action,p_payload,result,auth.uid());
 return result;
end $$;
revoke all on function public.purchase_command(uuid,text,jsonb) from public,anon;
grant execute on function public.purchase_command(uuid,text,jsonb) to authenticated;

-- Bucket is private. Uploads and signed downloads use the authenticated tenant context.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('purchase-documents','purchase-documents',false,5242880,array['application/pdf','application/xml','text/xml','image/jpeg','image/png']);
drop policy purchase_read on public.purchase_attachments;
create policy purchase_read on public.purchase_attachments for select to authenticated using(company_id=(select private.current_company_id()) and ((supplier_id is not null and (select private.purchase_allowed('/suppliers'))) or (order_id is not null and (select private.purchase_allowed('/purchases')))));
create policy purchase_storage_read on storage.objects for select to authenticated using(bucket_id='purchase-documents' and (storage.foldername(name))[1]=(select private.current_company_id()) and exists(select 1 from public.purchase_attachments a where a.path=storage.objects.name and a.company_id=(select private.current_company_id()) and ((a.supplier_id is not null and (select private.purchase_allowed('/suppliers'))) or (a.order_id is not null and (select private.purchase_allowed('/purchases'))))));
-- No direct upload grants: server checks bytes, type, entity, write subscription and permission first.

create function public.purchase_file_access(p_kind text,p_id text,p_write boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();a public.purchase_attachments%rowtype;begin
 if auth.uid() is null or c is null then raise exception 'Acesso negado.' using errcode='42501';end if;
 if p_kind='attachment' then
  select * into a from public.purchase_attachments where company_id=c and id=p_id::uuid;
  if not found or not private.purchase_allowed(case when a.supplier_id is not null then '/suppliers' else '/purchases' end) then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
  return jsonb_build_object('company_id',c,'path',a.path,'name',a.name);
 elsif p_kind='supplier' then
  if not private.purchase_allowed('/suppliers') or not exists(select 1 from public.suppliers where company_id=c and id=p_id) then raise exception 'Fornecedor indisponível.' using errcode='42501';end if;
 elsif p_kind='order' then
  if not private.purchase_allowed() or not exists(select 1 from public.purchase_orders where company_id=c and id=p_id::uuid) then raise exception 'Compra indisponível.' using errcode='42501';end if;
 else raise exception 'Destino inválido.' using errcode='22023';end if;
 if p_write then perform private.saas_assert_write(c,null);end if;
 return jsonb_build_object('company_id',c);
end $$;
revoke all on function public.purchase_file_access(text,text,boolean) from public,anon;
grant execute on function public.purchase_file_access(text,text,boolean) to authenticated;

create function public.purchase_source(p_from date default null,p_to date default null,p_order uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();buy boolean:=private.purchase_allowed();sup boolean:=private.purchase_allowed('/suppliers');ids uuid[];begin
 if auth.uid() is null or c is null or not (buy or sup) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 then raise exception 'Selecione um período de até 366 dias.' using errcode='22023';end if;
 select array_agg(o.id) into ids from public.purchase_orders o where o.company_id=c and buy and ((p_order is not null and o.id=p_order) or (p_order is null and (o.ordered_date between p_from and p_to or exists(select 1 from public.purchase_receipts r where r.company_id=c and r.order_id=o.id and r.received_date between p_from and p_to))));
 if coalesce(array_length(ids,1),0)>10000 or (select count(*) from public.products where company_id=c)>10000 or (select count(*) from public.suppliers where company_id=c)>10000 then raise exception 'Mais de 10.000 registros. Reduza o período antes de continuar.' using errcode='54000';end if;
 return jsonb_build_object(
 'permissions',jsonb_build_object('suppliers',sup,'purchases',buy,'approve',buy and private.purchase_allowed('/purchases/approve'),'receive',buy and private.purchase_allowed('/purchases/receive') and private.purchase_allowed('/stock'),'finance',buy and private.finance_can_access()),
 'company',(select jsonb_build_object('name',name,'document',document,'phone',phone,'email',email,'street',street,'number',number,'neighborhood',neighborhood,'city',city,'state',state,'cep',cep) from public.companies where id=c),
 'suppliers',coalesce((select jsonb_agg(case when sup then to_jsonb(s) else jsonb_build_object('id',s.id,'name',s.name,'active',s.active) end order by s.name) from public.suppliers s where s.company_id=c),'[]'),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'pricing_type',pricing_type,'active',active,'stock_controlled',stock_controlled,'current_stock',current_stock,'min_stock',min_stock) order by name) from public.products where company_id=c),'[]'),
 'links',coalesce((select jsonb_agg(to_jsonb(l)) from public.supplier_products l where l.company_id=c),'[]'),
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from public.purchase_requests r where company_id=c and buy and (created_at::date between p_from and p_to or status in ('draft','requested','approved'))),'[]'),
 'request_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.purchase_request_items i join public.purchase_requests r on r.company_id=i.company_id and r.id=i.request_id where i.company_id=c and buy and (r.created_at::date between p_from and p_to or r.status in ('draft','requested','approved'))),'[]'),
 'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.number desc) from public.purchase_orders o where company_id=c and id=any(ids)),'[]'),
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by position) from public.purchase_order_items i where company_id=c and order_id=any(ids)),'[]'),
 'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by created_at desc) from public.purchase_receipts r where company_id=c and order_id=any(ids)),'[]'),
 'receipt_items',coalesce((select jsonb_agg(to_jsonb(i)) from public.purchase_receipt_items i where company_id=c and order_id=any(ids)),'[]'),
 'installments',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('status',f.status,'cancelled_at',f.cancelled_at)) from public.purchase_installments i left join public.financial_transactions f on f.company_id=i.company_id and f.id=i.financial_id where i.company_id=c and i.order_id=any(ids)),'[]'),
 'attachments',coalesce((select jsonb_agg(to_jsonb(a)-'path') from public.purchase_attachments a where company_id=c and ((supplier_id is not null and sup) or (order_id=any(ids) and buy))),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'entity_id',a.entity_id,'actor_name',a.actor_name,'actor_role',a.actor_role,'created_at',a.created_at) order by a.created_at desc) from public.audit_logs a where a.company_id=c and a.module='purchases' and a.entity_id in(select unnest(ids)::text union all select id::text from public.purchase_receipts where company_id=c and order_id=any(ids) union all select id::text from public.purchase_attachments where company_id=c and order_id=any(ids))),'[]'),
 'accounts',case when buy and private.finance_can_access() then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.financial_accounts where company_id=c and active),'[]') else '[]'::jsonb end,
 'categories',case when buy and private.finance_can_access() then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.financial_categories where company_id=c and active and type='despesa'),'[]') else '[]'::jsonb end
 );
end $$;
revoke all on function public.purchase_source(date,date,uuid) from public,anon;
grant execute on function public.purchase_source(date,date,uuid) to authenticated;
