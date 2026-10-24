-- NFS-e QA only. No external fiscal authority or financial/operational writes.
create table public.fiscal_settings (
 company_id text primary key references public.companies(id),
 provider text not null default 'mock' check(provider='mock'),
 environment text not null default 'homologacao' check(environment='homologacao'),
 real_emission_enabled boolean not null default false check(not real_emission_enabled),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object'), updated_at timestamptz not null default now()
);
create table public.fiscal_customer_data (
 customer_id text primary key references public.customers(id), company_id text not null references public.companies(id),
 municipality_code text not null default '' check(municipality_code='' or municipality_code ~ '^[0-9]{7}$'), updated_at timestamptz not null default now()
);
create index fiscal_customer_tenant on public.fiscal_customer_data(company_id);
create table public.fiscal_product_data (
 product_id text primary key references public.products(id), company_id text not null references public.companies(id),
 service_code text not null default '' check(length(service_code)<=20), cnae text not null default '' check(cnae='' or cnae ~ '^[0-9]{7}$'),
 updated_at timestamptz not null default now()
);
create index fiscal_product_tenant on public.fiscal_product_data(company_id);
create table public.fiscal_documents (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), order_id text not null references public.orders(id),
 customer_id text not null references public.customers(id), document_type text not null default 'nfse' check(document_type='nfse'),
 provider text not null default 'mock' check(provider='mock'), environment text not null default 'homologacao' check(environment='homologacao'),
 status text not null check(status in ('queued','processing','authorized_qa','rejected','cancelled_qa','error')),
 external_id text not null unique, number text, series text not null, access_key text check(access_key is null),
 amount numeric(16,2) not null check(amount>0), snapshot jsonb not null, provider_sequence integer not null default 0,
 protocol text, cancellation_protocol text, rejection_code text, rejection_message text, requested_at timestamptz not null default now(), issued_at timestamptz,
 cancelled_at timestamptz, cancel_requested_at timestamptz, cancel_reason text, cancel_actor uuid, created_by uuid not null,
 idempotency_key uuid not null, unique(company_id,idempotency_key), unique(company_id,id)
);
create index fiscal_document_order on public.fiscal_documents(order_id,company_id);
create index fiscal_document_status_date on public.fiscal_documents(company_id,status,requested_at desc);
create index fiscal_document_type_date on public.fiscal_documents(company_id,document_type,issued_at desc);
create index fiscal_document_customer on public.fiscal_documents(customer_id);
create unique index fiscal_document_active_order on public.fiscal_documents(company_id,order_id) where status in ('queued','processing','authorized_qa');
-- 1:N history is allowed; mock issues one full-Order service document at a time.
create table public.fiscal_document_events (
 id uuid primary key default gen_random_uuid(), company_id text not null references public.companies(id), document_id uuid not null,
 event_id text not null unique, state text not null, sequence integer not null, summary text not null, actor uuid,
 created_at timestamptz not null default now(), foreign key(company_id,document_id) references public.fiscal_documents(company_id,id)
);
create index fiscal_event_document on public.fiscal_document_events(company_id,document_id,created_at);
create table private.fiscal_qa_orders (order_id text primary key references public.orders(id),company_id text not null references public.companies(id));
create index fiscal_qa_company on private.fiscal_qa_orders(company_id);
create table private.fiscal_provider_secret (id boolean primary key default true check(id),secret text not null);
insert into private.fiscal_provider_secret values(true,encode(extensions.gen_random_bytes(48),'hex'));
alter table private.fiscal_qa_orders enable row level security;
alter table private.fiscal_provider_secret enable row level security;
revoke all on private.fiscal_qa_orders,private.fiscal_provider_secret from public,anon,authenticated;

create function private.fiscal_allowed(p_admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.finance_can_access() and exists(select 1 from public.profiles p
 where p.auth_user_id=auth.uid() and p.company_id=private.current_company_id() and p.active
 and (not p_admin or p.role in ('admin','gerente')))
$$;
revoke all on function private.fiscal_allowed(boolean) from public,anon;
grant execute on function private.fiscal_allowed(boolean) to authenticated;
do $$declare t text;begin
 foreach t in array array['fiscal_settings','fiscal_customer_data','fiscal_product_data','fiscal_documents','fiscal_document_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy fiscal_read on public.%I for select to authenticated using(company_id=(select private.current_company_id()) and (select private.fiscal_allowed()))',t);
 end loop;
end $$;

create function private.fiscal_document_valid(p_document text) returns boolean language plpgsql immutable set search_path='' as $$
declare d text:=regexp_replace(coalesce(p_document,''),'[^0-9]','','g'); i integer; j integer; s integer; w integer; v integer;
begin
 if length(d) not in (11,14) or d=repeat(left(d,1),length(d)) then return false;end if;
 for j in 0..1 loop
 s:=0;
 for i in 1..(length(d)-2+j) loop
 if length(d)=11 then w:=11+j-i;else w:=((length(d)-2+j-i)%8)+2;end if;
 s:=s+substr(d,i,1)::integer*w;
 end loop;
 v:=case when s%11<2 then 0 else 11-s%11 end;
 if substr(d,length(d)-1+j,1)::integer<>v then return false;end if;
 end loop;return true;
end $$;
revoke all on function private.fiscal_document_valid(text) from public,anon,authenticated;

create function private.fiscal_audit(c text,a text,d text,summary jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype;begin
 select * into p from public.profiles where company_id=c and auth_user_id=auth.uid() and active order by id limit 1;
 if auth.uid() is null and coalesce(auth.jwt()->>'role','')<>'service_role' then return;end if;
 if auth.uid() is not null and p.id is null then raise exception 'Fiscal denied' using errcode='42501';end if;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values)
 values(c,auth.uid(),p.id,case when auth.uid() is null then 'SYSTEM' else p.name end,case when auth.uid() is null then 'system' else p.role end,a,'fiscal',d,'financial',summary);
end $$;
revoke all on function private.fiscal_audit(text,text,text,jsonb) from public,anon,authenticated;

create function private.fiscal_prepare(c text,oid text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders%rowtype; u public.customers%rowtype; issuer public.companies%rowtype; cfg jsonb; errs jsonb:='[]'; rows jsonb; snapshot jsonb;begin
 select * into o from public.orders where id=oid and company_id=c;
 if not found then raise exception 'Fiscal: Pedido indisponível.' using errcode='22023';end if;
 select * into u from public.customers where id=o.customer_id and company_id=c;
 select * into issuer from public.companies where id=c;
 select data into cfg from public.fiscal_settings where company_id=c;
 cfg:=coalesce(cfg,'{}');
 if not private.fiscal_document_valid(issuer.document) then errs:=errs||jsonb_build_array('CPF/CNPJ da empresa inválido.');end if;
 if nullif(btrim(issuer.name),'') is null or nullif(btrim(issuer.street),'') is null or nullif(btrim(issuer.number),'') is null or nullif(btrim(issuer.city),'') is null or coalesce(issuer.state,'') !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' or regexp_replace(coalesce(issuer.cep,''),'[^0-9]','','g') !~ '^[0-9]{8}$' then errs:=errs||jsonb_build_array('Endereço fiscal da empresa incompleto.');end if;
 if btrim(coalesce(cfg->>'municipal_registration',''))='' then errs:=errs||jsonb_build_array('Inscrição municipal não configurada.');end if;
 if coalesce(cfg->>'municipality_code','') !~ '^[0-9]{7}$' then errs:=errs||jsonb_build_array('Município IBGE da empresa não configurado.');end if;
 if coalesce(cfg->>'tax_regime','') not in ('simples_nacional','lucro_presumido','lucro_real','outro') then errs:=errs||jsonb_build_array('Regime tributário fiscal não configurado.');end if;
 if coalesce(cfg->>'cnae','') !~ '^[0-9]{7}$' or btrim(coalesce(cfg->>'nature',''))='' then errs:=errs||jsonb_build_array('CNAE e natureza do serviço são obrigatórios.');end if;
 if not private.fiscal_document_valid(u.document) then errs:=errs||jsonb_build_array('CPF/CNPJ do cliente inválido.');end if;
 if coalesce(nullif(btrim(u.legal_name),''),btrim(u.name),'')='' or coalesce(u.address->>'street','')='' or coalesce(u.address->>'number','')='' or coalesce(u.address->>'city','')='' or coalesce(u.address->>'state','') !~ '^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$' or regexp_replace(coalesce(u.address->>'zip_code',''),'[^0-9]','','g') !~ '^[0-9]{8}$' then errs:=errs||jsonb_build_array('Endereço fiscal do cliente incompleto.');end if;
 if not exists(select 1 from public.fiscal_customer_data where company_id=c and customer_id=u.id and municipality_code ~ '^[0-9]{7}$') then errs:=errs||jsonb_build_array('Município IBGE do cliente não configurado.');end if;
 if nullif(u.email,'') is not null and u.email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then errs:=errs||jsonb_build_array('E-mail do cliente inválido.');end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'product_id',i.product_id,'description',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,'total',i.total_price,'service_code',coalesce(nullif(f.service_code,''),cfg->>'default_service_code'),'cnae',coalesce(nullif(f.cnae,''),cfg->>'cnae')) order by i.id),'[]') into rows
 from public.order_items i left join public.products p on p.id=i.product_id and p.company_id=c left join public.fiscal_product_data f on f.product_id=p.id and f.company_id=c where i.order_id=o.id;
 if jsonb_array_length(rows)=0 then errs:=errs||jsonb_build_array('Pedido sem itens fiscais.');end if;
 if exists(select 1 from jsonb_array_elements(rows) x where btrim(coalesce(x->>'service_code',''))='' or (x->>'quantity')::numeric<=0 or (x->>'total')::numeric<0) then errs:=errs||jsonb_build_array('Há item sem código de serviço ou com quantidade/valor inválido.');end if;
 if o.status='cancelado' or o.total_amount<=0 then errs:=errs||jsonb_build_array('Pedido cancelado ou sem valor não pode solicitar NFS-e.');end if;
 if not exists(select 1 from private.fiscal_qa_orders where order_id=o.id and company_id=c) then errs:=errs||jsonb_build_array('Mock fiscal aceita somente Pedidos sintéticos autorizados para QA.');end if;
 snapshot:=jsonb_build_object('document_type','nfse','environment','homologacao','mock',true,'order',jsonb_build_object('id',o.id,'number',o.number,'amount',o.total_amount,'shipping',o.shipping_cost,'notes',o.notes,'additional_services',o.additional_services,'source',o.store_origin),'issuer',jsonb_build_object('name',issuer.name,'document',issuer.document,'street',issuer.street,'number',issuer.number,'city',issuer.city,'state',issuer.state,'cep',issuer.cep,'fiscal',cfg),'customer',jsonb_build_object('id',u.id,'name',coalesce(nullif(u.legal_name,''),u.name),'document',u.document,'address',u.address,'email',u.email,'municipality_code',(select municipality_code from public.fiscal_customer_data where customer_id=u.id and company_id=c)),'items',rows);
 return jsonb_build_object('errors',errs,'snapshot',snapshot,'fingerprint',encode(extensions.digest(snapshot::text,'sha256'),'hex'));
end $$;
revoke all on function private.fiscal_prepare(text,text) from public,anon,authenticated;

create function public.fiscal_command(p_action text,p_payload jsonb,p_operation_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id(); cfg jsonb; prep jsonb; d public.fiscal_documents%rowtype; oid text:=p_payload->>'order_id'; rid text:=p_payload->>'id';begin
 if not private.fiscal_allowed() or c is null then raise exception 'Fiscal denied' using errcode='42501';end if;
 if jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>16384 or p_operation_id is null then raise exception 'Fiscal: Solicitação inválida.' using errcode='22023';end if;
 if coalesce(p_payload->>'environment','homologacao')<>'homologacao' or coalesce(p_payload->>'provider','mock')<>'mock' or coalesce(p_payload->>'real_emission_enabled','false')<>'false' then raise exception 'FISCAL_REAL_EMISSION_REQUIRES_EXPLICIT_AUTHORIZATION' using errcode='22023';end if;
 if p_action='settings' then
 if not private.fiscal_allowed(true) or not private.current_user_can_access_path('/settings') then raise exception 'Fiscal denied' using errcode='42501';end if;
 cfg:=coalesce(p_payload->'data','{}');
 if jsonb_typeof(cfg)<>'object' or exists(select 1 from jsonb_object_keys(cfg) k where k not in ('municipal_registration','municipality_code','tax_regime','cnae','series','nature','default_service_code')) or exists(select 1 from jsonb_each(cfg) x where jsonb_typeof(x.value)<>'string' or length(x.value#>>'{}')>160) then raise exception 'Fiscal: Configuração inválida.' using errcode='22023';end if;
 if coalesce(cfg->>'municipality_code','')<>'' and cfg->>'municipality_code' !~ '^[0-9]{7}$' then raise exception 'Fiscal: Código IBGE deve conter sete dígitos.' using errcode='22023';end if;
 if coalesce(cfg->>'cnae','')<>'' and cfg->>'cnae' !~ '^[0-9]{7}$' then raise exception 'Fiscal: CNAE deve conter sete dígitos.' using errcode='22023';end if;
 insert into public.fiscal_settings(company_id,data) values(c,cfg) on conflict(company_id) do update set data=excluded.data,updated_at=clock_timestamp();
 perform private.fiscal_audit(c,'fiscal.settings_updated',c,'{"environment":"homologacao","provider":"mock"}');return '{"ok":true}';
 elsif p_action='customer' then
 if not exists(select 1 from public.customers where id=rid and company_id=c) then raise exception 'Fiscal denied' using errcode='42501';end if;
 insert into public.fiscal_customer_data(customer_id,company_id,municipality_code) values(rid,c,coalesce(p_payload->>'municipality_code','')) on conflict(customer_id) do update set municipality_code=excluded.municipality_code,updated_at=clock_timestamp();return '{"ok":true}';
 elsif p_action='product' then
 if not exists(select 1 from public.products where id=rid and company_id=c) then raise exception 'Fiscal denied' using errcode='42501';end if;
 insert into public.fiscal_product_data(product_id,company_id,service_code,cnae) values(rid,c,coalesce(p_payload->>'service_code',''),coalesce(p_payload->>'cnae','')) on conflict(product_id) do update set service_code=excluded.service_code,cnae=excluded.cnae,updated_at=clock_timestamp();return '{"ok":true}';
 elsif p_action in ('prevalidate','request') then
 perform 1 from public.orders where company_id=c and id=oid for update;
 if not found then raise exception 'Fiscal denied' using errcode='42501';end if;
 if p_action='request' then
 select * into d from public.fiscal_documents where company_id=c and idempotency_key=p_operation_id;
 if found then if d.order_id<>oid then raise exception 'Fiscal: Chave de solicitação já utilizada.' using errcode='22023';end if;return to_jsonb(d);end if;
 select * into d from public.fiscal_documents where company_id=c and order_id=oid and status in ('queued','processing','authorized_qa');if found then return to_jsonb(d);end if;
 end if;
 prep:=private.fiscal_prepare(c,oid);if p_action='prevalidate' then return prep;end if;
 if jsonb_array_length(prep->'errors')>0 then return prep;end if;
 if p_payload->>'fingerprint' is distinct from prep->>'fingerprint' then raise exception 'Fiscal: Dados alterados após a pré-validação. Confira o resumo novamente.' using errcode='22023';end if;
 insert into public.fiscal_documents(company_id,order_id,customer_id,status,external_id,series,amount,snapshot,created_by,idempotency_key)
 select c,o.id,o.customer_id,'queued','mock-nfse-'||p_operation_id::text,coalesce(nullif(prep#>>'{snapshot,issuer,fiscal,series}',''),'QA'),o.total_amount,prep->'snapshot',auth.uid(),p_operation_id from public.orders o where o.company_id=c and o.id=oid returning * into d;
 insert into public.fiscal_document_events(company_id,document_id,event_id,state,sequence,summary,actor) values(c,d.id,'request:'||d.id,'queued',0,'Solicitação de simulação QA; sem validade fiscal.',auth.uid());
 perform private.fiscal_audit(c,'fiscal.document_requested',d.id::text,jsonb_build_object('order_id',oid,'environment','homologacao'));return to_jsonb(d);
 elsif p_action='cancel_prepare' then
 if not private.fiscal_allowed(true) then raise exception 'Fiscal denied' using errcode='42501';end if;
 select * into d from public.fiscal_documents where company_id=c and id=rid::uuid for update;
 if not found then raise exception 'Fiscal denied' using errcode='42501';end if;
 if d.status='cancelled_qa' then return to_jsonb(d);end if;
 if d.status='authorized_qa' and d.cancel_requested_at is not null then
 if d.cancel_reason is distinct from btrim(p_payload->>'reason') then raise exception 'Fiscal: Há cancelamento pendente. Retome com o motivo já registrado.' using errcode='22023';end if;
 return to_jsonb(d);end if;
 if d.status<>'authorized_qa' or d.issued_at<now()-interval '24 hours' then raise exception 'Fiscal: Cancelamento QA indisponível; prazo de teste de 24 horas ou status inválido.' using errcode='22023';end if;
 if length(btrim(coalesce(p_payload->>'reason',''))) not between 15 and 250 then raise exception 'Fiscal: Motivo deve ter entre 15 e 250 caracteres.' using errcode='22023';end if;
 if d.cancel_requested_at is null then
 update public.fiscal_documents set cancel_requested_at=clock_timestamp(),cancel_reason=btrim(p_payload->>'reason'),cancel_actor=auth.uid() where id=d.id returning * into d;
 perform private.fiscal_audit(c,'fiscal.document_cancel_requested',d.id::text,'{"environment":"homologacao"}');
 end if;return to_jsonb(d);
 end if;raise exception 'Fiscal: Ação inválida.' using errcode='22023';
end $$;
revoke all on function public.fiscal_command(text,jsonb,uuid) from public,anon;
grant execute on function public.fiscal_command(text,jsonb,uuid) to authenticated;

create function public.fiscal_source(p_order text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();begin
 if not private.fiscal_allowed() then raise exception 'Fiscal denied' using errcode='42501';end if;
 return jsonb_build_object('settings',coalesce((select data from public.fiscal_settings where company_id=c),'{}'),'canConfigure',private.fiscal_allowed(true) and private.current_user_can_access_path('/settings'),'canCancel',private.fiscal_allowed(true),
 'rows',coalesce((select jsonb_agg(to_jsonb(x) order by x.requested_at desc) from (select d.*,d.snapshot#>>'{order,number}' as order_number,d.snapshot#>>'{customer,name}' as customer_name from public.fiscal_documents d join public.orders o on o.id=d.order_id and o.company_id=c join public.customers u on u.id=d.customer_id and u.company_id=c where d.company_id=c and (p_order is null or d.order_id=p_order) order by d.requested_at desc limit 500) x),'[]'),
 'orders',coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,o.number,o.customer_name,o.total_amount,exists(select 1 from private.fiscal_qa_orders q where q.order_id=o.id and q.company_id=c) as qa from public.orders o where o.company_id=c and (p_order is null or o.id=p_order) order by o.created_at desc limit 500) x),'[]'),
 'customers',coalesce((select jsonb_agg(to_jsonb(x)) from (select u.id,u.name,coalesce(f.municipality_code,'') as municipality_code from public.customers u left join public.fiscal_customer_data f on f.customer_id=u.id and f.company_id=c where u.company_id=c order by u.name limit 1000) x),'[]'),
 'products',coalesce((select jsonb_agg(to_jsonb(x)) from (select p.id,p.name,coalesce(f.service_code,'') as service_code,coalesce(f.cnae,'') as cnae from public.products p left join public.fiscal_product_data f on f.product_id=p.id and f.company_id=c where p.company_id=c order by p.name limit 1000) x),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select e.* from public.fiscal_document_events e join public.fiscal_documents d on d.id=e.document_id and d.company_id=c where e.company_id=c and (p_order is null or d.order_id=p_order) order by e.created_at desc limit 1000) x),'[]'));
end $$;
revoke all on function public.fiscal_source(text) from public,anon;
grant execute on function public.fiscal_source(text) to authenticated;

create function public.fiscal_mock_secret() returns text language sql security definer set search_path='' as $$select secret from private.fiscal_provider_secret where id$$;
revoke all on function public.fiscal_mock_secret() from public,anon,authenticated;
grant execute on function public.fiscal_mock_secret() to service_role;
create function public.fiscal_provider_event(p_event jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.fiscal_documents%rowtype; seq integer:=(p_event->>'sequence')::integer; st text:=p_event->>'state';eid text:=p_event->>'event_id';begin
 select * into d from public.fiscal_documents where external_id=p_event->>'external_id' for update;
 if not found then raise exception 'Unavailable document';end if;
 if not exists(select 1 from private.fiscal_qa_orders where company_id=d.company_id and order_id=d.order_id) then raise exception 'QA not allowed';end if;
 if exists(select 1 from public.fiscal_document_events where event_id=eid) then
 if not exists(select 1 from public.fiscal_document_events where event_id=eid and document_id=d.id and state=st and sequence=seq) then raise exception 'Fiscal event identity mismatch';end if;
 return jsonb_build_object('result','duplicate');end if;
 if seq<=d.provider_sequence then return jsonb_build_object('result','stale');end if;
 if not ((d.status='queued' and st='processing') or (d.status='processing' and st in ('authorized_qa','rejected')) or (d.status='authorized_qa' and d.cancel_requested_at is not null and st in ('cancelled_qa','cancel_rejected'))) then return jsonb_build_object('result','ignored');end if;
 update public.fiscal_documents set status=case when st='cancel_rejected' then status else st end,provider_sequence=seq,
 number=case when st='authorized_qa' then 'QA-'||left(id::text,8) else number end,
 protocol=case when st='authorized_qa' then 'MOCK-SEM-VALIDADE-FISCAL-'||seq else protocol end,
 cancellation_protocol=case when st='cancelled_qa' then 'MOCK-CANCELAMENTO-SEM-VALIDADE-FISCAL-'||seq else cancellation_protocol end,
 issued_at=case when st='authorized_qa' then clock_timestamp() else issued_at end,
 cancelled_at=case when st='cancelled_qa' then clock_timestamp() else cancelled_at end,
 rejection_code=case when st in ('rejected','cancel_rejected') then 'QA_REJECTED' else rejection_code end,
 rejection_message=case when st in ('rejected','cancel_rejected') then 'Simulação rejeitada pelo mock de QA.' else rejection_message end,
 cancel_requested_at=case when st='cancel_rejected' then null else cancel_requested_at end
 where id=d.id;
 insert into public.fiscal_document_events(company_id,document_id,event_id,state,sequence,summary,actor) values(d.company_id,d.id,eid,st,seq,'Retorno verificado do mock; sem autorização oficial.',null);
 if st in ('authorized_qa','rejected','cancelled_qa') then perform private.fiscal_audit(d.company_id,'fiscal.document_'||case st when 'authorized_qa' then 'authorized' when 'cancelled_qa' then 'cancelled' else 'rejected' end,d.id::text,jsonb_build_object('environment','homologacao','mock',true));end if;
 return jsonb_build_object('result','applied');
end $$;
revoke all on function public.fiscal_provider_event(jsonb) from public,anon,authenticated;
grant execute on function public.fiscal_provider_event(jsonb) to service_role;

-- Defense in depth: even privileged application writers cannot rewrite fiscal history.
create function private.fiscal_immutable() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'Fiscal history cannot be deleted';end if;
 if (to_jsonb(new)-array['status','provider_sequence','number','protocol','cancellation_protocol','rejection_code','rejection_message','issued_at','cancelled_at','cancel_requested_at','cancel_reason','cancel_actor']) is distinct from (to_jsonb(old)-array['status','provider_sequence','number','protocol','cancellation_protocol','rejection_code','rejection_message','issued_at','cancelled_at','cancel_requested_at','cancel_reason','cancel_actor']) then raise exception 'Fiscal snapshot is immutable';end if;
 if old.number is not null and new.number is distinct from old.number then raise exception 'Fiscal number is immutable';end if;
 return new;end $$;
revoke all on function private.fiscal_immutable() from public,anon,authenticated;
create trigger fiscal_immutable before update or delete on public.fiscal_documents for each row execute function private.fiscal_immutable();
