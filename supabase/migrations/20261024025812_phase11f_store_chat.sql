-- Store chat: anonymous access is exclusively through service RPCs after hostname/token resolution.
create table public.store_chat_conversations (
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),
 customer_id text references public.customers(id) on delete set null,assigned_profile_id text references public.profiles(id) on delete set null,
 status text not null default 'open' check(status in ('open','waiting','in_progress','closed')),
 product_id text references public.products(id) on delete set null,order_id text references public.orders(id) on delete set null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),last_message_at timestamptz not null default now(),
 first_response_at timestamptz,claimed_at timestamptz,closed_at timestamptz,handling_seconds numeric not null default 0 check(handling_seconds>=0),
 message_seq bigint not null default 0,visitor_read_seq bigint not null default 0,whatsapp_escalations integer not null default 0,
 unique(company_id,id)
);
create index chat_inbox on public.store_chat_conversations(company_id,status,last_message_at desc);
create index chat_assignee on public.store_chat_conversations(company_id,assigned_profile_id,last_message_at desc);
create index chat_customer on public.store_chat_conversations(customer_id);
create index chat_product on public.store_chat_conversations(product_id);
create index chat_order on public.store_chat_conversations(order_id);
create table public.store_chat_messages (
 id uuid primary key default gen_random_uuid(),company_id text not null,conversation_id uuid not null,
 seq bigint not null,command_id uuid not null,sender_type text not null check(sender_type in ('visitor','customer','agent','system')),
 sender_profile_id text references public.profiles(id) on delete set null,content text not null check(length(btrim(content)) between 1 and 2000),
 created_at timestamptz not null default now(),
 foreign key(company_id,conversation_id) references public.store_chat_conversations(company_id,id),
 unique(conversation_id,seq),unique(conversation_id,command_id)
);
create index chat_messages_tenant on public.store_chat_messages(company_id,conversation_id,seq);
create index chat_messages_sender on public.store_chat_messages(sender_profile_id);
create table public.store_chat_quick_replies (
 id uuid primary key default gen_random_uuid(),company_id text not null references public.companies(id),
 title text not null check(length(btrim(title)) between 1 and 80),content text not null check(length(btrim(content)) between 1 and 2000),
 active boolean not null default true,revision integer not null default 1
);
create index chat_replies_company on public.store_chat_quick_replies(company_id);
create table public.store_chat_settings (
 company_id text primary key references public.companies(id),greeting text not null default 'Olá! Como podemos ajudar?' check(length(btrim(greeting)) between 1 and 2000),
 away_message text not null default 'Recebemos sua mensagem. Responderemos no horário de atendimento.' check(length(btrim(away_message)) between 1 and 2000),
 revision integer not null default 1
);
create table private.store_chat_sessions (
 token_hash text primary key check(token_hash ~ '^[0-9a-f]{64}$'),company_id text not null,conversation_id uuid not null unique,
 actor_id uuid,expires_at timestamptz not null default now()+interval '7 days',
 foreign key(company_id,conversation_id) references public.store_chat_conversations(company_id,id)
);
create index chat_sessions_tenant on private.store_chat_sessions(company_id);
create table private.store_chat_reads (
 company_id text not null,conversation_id uuid not null,profile_id text not null references public.profiles(id) on delete cascade,seq bigint not null default 0,
 primary key(conversation_id,profile_id),foreign key(company_id,conversation_id) references public.store_chat_conversations(company_id,id)
);
create index chat_reads_profile on private.store_chat_reads(company_id,profile_id);
create table private.store_chat_quotes (
 company_id text not null,conversation_id uuid not null,quote_id text not null,
 primary key(conversation_id,quote_id),foreign key(company_id,conversation_id) references public.store_chat_conversations(company_id,id)
);
create index chat_quotes_tenant on private.store_chat_quotes(company_id);
create index chat_quotes_quote on private.store_chat_quotes(quote_id);

create function private.chat_access(c text,actor uuid default auth.uid(),path text default '/attendance') returns boolean language sql stable security definer set search_path='' as $$
 select actor is not null and exists(select 1 from public.profiles p left join public.role_permissions r on r.company_id=p.company_id and r.path=chat_access.path
 where p.company_id=c and p.auth_user_id=actor and p.active and p.role=any(coalesce(r.roles,
 case when chat_access.path='/attendance' then array['admin','gerente','vendas']::text[] when chat_access.path='/quotes' then array['admin','gerente','financeiro','vendas']::text[]
 when chat_access.path='/orders' then array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[] else array[]::text[] end)))
$$;
revoke all on function private.chat_access(text,uuid,text) from public,anon;
grant execute on function private.chat_access(text,uuid,text) to authenticated;
create function private.chat_audit(c text,a text,eid text,actor uuid,summary jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles%rowtype;begin
 if actor is not null then select * into p from public.profiles where company_id=c and auth_user_id=actor and active order by id limit 1;end if;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,new_values)
 values(c,actor,p.id,coalesce(p.name,'SYSTEM'),coalesce(p.role,'system'),a,'store_chat',eid,'attendance',summary);
end $$;
revoke all on function private.chat_audit(text,text,text,uuid,jsonb) from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['store_chat_conversations','store_chat_messages','store_chat_quick_replies','store_chat_settings'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy chat_staff_read on public.%I for select to authenticated using(private.chat_access(company_id))',t);
 end loop;
 foreach t in array array['store_chat_sessions','store_chat_reads','store_chat_quotes'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;

-- A locked conversation serializes sequence allocation, claims, read cursors and flood checks.
create function private.chat_append(c text,cid uuid,cmd uuid,kind text,body text,pid text default null) returns void language plpgsql security definer set search_path='' as $$
declare cv public.store_chat_conversations%rowtype;previous public.store_chat_messages%rowtype;begin
 select * into cv from public.store_chat_conversations where company_id=c and id=cid for update;
 if not found or cmd is null or kind is null or kind not in ('visitor','customer','agent','system') or body is null or length(btrim(body)) not between 1 and 2000 then raise exception 'Mensagem inválida';end if;
 select * into previous from public.store_chat_messages where conversation_id=cid and command_id=cmd;
 if found then
 if previous.content is distinct from btrim(body) or previous.sender_type<>kind or previous.sender_profile_id is distinct from pid then raise exception 'Comando já utilizado';end if;return;end if;
 if kind in ('visitor','customer') and (select count(*) from public.store_chat_messages where conversation_id=cid and sender_type in ('visitor','customer') and created_at>clock_timestamp()-interval '1 minute')>=12 then raise exception 'Aguarde antes de enviar mais mensagens';end if;
 update public.store_chat_conversations set message_seq=message_seq+1,updated_at=clock_timestamp(),last_message_at=clock_timestamp(),
 first_response_at=case when kind='agent' then coalesce(first_response_at,clock_timestamp()) else first_response_at end
 where id=cid returning * into cv;
 insert into public.store_chat_messages(company_id,conversation_id,seq,command_id,sender_type,sender_profile_id,content) values(c,cid,cv.message_seq,cmd,kind,pid,btrim(body));
end $$;
revoke all on function private.chat_append(text,uuid,uuid,text,text,text) from public,anon,authenticated;

-- Service only: the HTTP boundary derives company/actor and hashes an HttpOnly random token.
create function public.store_chat_visitor(p_company text,p_token_hash text,p_actor uuid default null,p_action text default 'read',p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare s private.store_chat_sessions%rowtype;cv public.store_chat_conversations%rowtype;customer text;cfg public.store_chat_settings%rowtype;pid text;oid text;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Chat indisponível' using errcode='42501';end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_action not in ('read','create','send','read_cursor','whatsapp') then raise exception 'Chat indisponível';end if;
 perform pg_advisory_xact_lock(hashtextextended('chat-session:'||p_token_hash,0));
 select a.customer_id into customer from public.store_customer_accounts a join public.customers cu on cu.id=a.customer_id and cu.company_id=a.company_id
 where a.company_id=p_company and a.auth_user_id=p_actor and a.status='active';
 select * into s from private.store_chat_sessions where token_hash=p_token_hash and company_id=p_company for update;
 if found then
 if s.expires_at<=now() or (s.actor_id is not null and (s.actor_id is distinct from p_actor or customer is null)) then raise exception 'Sessão de atendimento expirada' using errcode='42501';end if;
 select * into cv from public.store_chat_conversations where company_id=p_company and id=s.conversation_id for update;
 if s.actor_id is null and customer is not null then
 update private.store_chat_sessions set actor_id=p_actor where token_hash=p_token_hash;
 update public.store_chat_conversations set customer_id=customer where id=cv.id returning * into cv;
 end if;
 elsif p_action='create' then
 perform private.saas_assert_write(p_company,'catalog');
 pid:=nullif(p_payload->>'product_id','');oid:=nullif(p_payload->>'order_id','');
 if pid is not null and not exists(select 1 from public.products where id=pid and company_id=p_company and active and catalog_active) then raise exception 'Contexto indisponível';end if;
 if oid is not null and (customer is null or not exists(select 1 from public.orders where id=oid and company_id=p_company and customer_id=customer)) then raise exception 'Contexto indisponível';end if;
 insert into public.store_chat_conversations(company_id,customer_id,product_id,order_id) values(p_company,customer,pid,oid) returning * into cv;
 insert into private.store_chat_sessions(token_hash,company_id,conversation_id,actor_id) values(p_token_hash,p_company,cv.id,case when customer is not null then p_actor end);
 select * into cfg from public.store_chat_settings where company_id=p_company;
 perform private.chat_append(p_company,cv.id,gen_random_uuid(),'system',coalesce(cfg.greeting,'Olá! Como podemos ajudar?'));
 else
 if p_action='read' then return jsonb_build_object('conversation',null,'messages','[]'::jsonb);end if;raise exception 'Chat indisponível' using errcode='42501';
 end if;
 if p_action in ('create','send') then
 perform private.saas_assert_write(p_company,'catalog');
 if exists(select 1 from public.store_chat_messages where conversation_id=cv.id and command_id=(p_payload->>'command_id')::uuid) then
 perform private.chat_append(p_company,cv.id,(p_payload->>'command_id')::uuid,case when customer is null then 'visitor' else 'customer' end,p_payload->>'content');
 elsif cv.status='closed' then
 update public.store_chat_conversations set status='waiting',assigned_profile_id=null,closed_at=null,claimed_at=null where id=cv.id;
 perform private.chat_audit(p_company,'chat.conversation_reopened',cv.id::text,null,'{}');
 elsif cv.status='open' then update public.store_chat_conversations set status='waiting' where id=cv.id;end if;
 perform private.chat_append(p_company,cv.id,(p_payload->>'command_id')::uuid,case when customer is null then 'visitor' else 'customer' end,p_payload->>'content');
 elsif p_action='read_cursor' then
 update public.store_chat_conversations set visitor_read_seq=greatest(visitor_read_seq,least(message_seq,coalesce((p_payload->>'seq')::bigint,0))) where id=cv.id;
 elsif p_action='whatsapp' then
 update public.store_chat_conversations set whatsapp_escalations=whatsapp_escalations+1 where id=cv.id;
 end if;
 select * into cv from public.store_chat_conversations where id=cv.id;
 -- Explicit DTO: no token, assignee, customer ID or internal order data crosses this boundary.
 return jsonb_build_object('conversation',jsonb_build_object('id',cv.id,'status',cv.status,'message_seq',cv.message_seq,'product_id',cv.product_id,'order_id',cv.order_id),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.seq),'[]'::jsonb) from (select id,seq,sender_type,content,created_at from public.store_chat_messages where conversation_id=cv.id and (nullif(p_payload->>'before_seq','') is null or seq<(p_payload->>'before_seq')::bigint) order by seq desc limit 200) m));
end $$;
revoke all on function public.store_chat_visitor(text,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.store_chat_visitor(text,text,uuid,text,jsonb) to service_role;

create function public.store_chat_inbox(p_conversation uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();pid text;begin
 if not private.chat_access(c) then raise exception 'Atendimento não autorizado' using errcode='42501';end if;
 select id into pid from public.profiles where company_id=c and auth_user_id=auth.uid() and active order by id limit 1;
 if p_conversation is not null and not exists(select 1 from public.store_chat_conversations where company_id=c and id=p_conversation) then raise exception 'Conversa indisponível';end if;
 return jsonb_build_object('profile_id',pid,'can_manage',exists(select 1 from public.profiles where id=pid and role='admin'),
 'can_transfer',exists(select 1 from public.profiles where id=pid and role in ('admin','gerente')),'can_quote',private.chat_access(c,auth.uid(),'/quotes'),'can_order',private.chat_access(c,auth.uid(),'/orders'),
 'conversations',(select coalesce(jsonb_agg(to_jsonb(x) order by x.last_message_at desc),'[]'::jsonb) from (
 select cv.*,coalesce(cu.name,'Visitante') customer_name,cu.phone,cu.email,pr.name product_name,o.number order_number,agent.name agent_name,
 (select content from public.store_chat_messages where conversation_id=cv.id order by seq desc limit 1) last_message,
 (select count(*) from public.store_chat_messages where conversation_id=cv.id and sender_type in ('visitor','customer') and seq>coalesce(rd.seq,0)) unread,
 (select count(*) from private.store_chat_quotes where conversation_id=cv.id) quote_conversions
 from public.store_chat_conversations cv left join public.customers cu on cu.id=cv.customer_id and cu.company_id=c
 left join public.products pr on pr.id=cv.product_id and pr.company_id=c left join public.orders o on o.id=cv.order_id and o.company_id=c
 left join public.profiles agent on agent.id=cv.assigned_profile_id left join private.store_chat_reads rd on rd.conversation_id=cv.id and rd.profile_id=pid
 where cv.company_id=c order by cv.last_message_at desc limit 300) x),
 'messages',(select coalesce(jsonb_agg(to_jsonb(m) order by m.seq),'[]'::jsonb) from (select * from public.store_chat_messages where company_id=c and conversation_id=p_conversation order by seq desc limit 200) m),
 'agents',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name)),'[]'::jsonb) from public.profiles p where p.company_id=c and p.active and private.chat_access(c,p.auth_user_id)),
 'quick_replies',(select coalesce(jsonb_agg(to_jsonb(q) order by q.title),'[]'::jsonb) from public.store_chat_quick_replies q where company_id=c),
 'settings',coalesce((select to_jsonb(s) from public.store_chat_settings s where company_id=c),jsonb_build_object('greeting','Olá! Como podemos ajudar?','away_message','Recebemos sua mensagem. Responderemos no horário de atendimento.','revision',0)),
 'metrics',(select jsonb_build_object('new',count(*),'served',count(*) filter(where first_response_at is not null),'closed',count(*) filter(where status='closed'),
 'first_response_seconds',avg(extract(epoch from first_response_at-created_at)),'handling_seconds',avg(handling_seconds) filter(where status='closed'),'whatsapp',coalesce(sum(whatsapp_escalations),0),
 'quotes',(select count(*) from private.store_chat_quotes where company_id=c)) from public.store_chat_conversations where company_id=c));
end $$;
revoke all on function public.store_chat_inbox(uuid) from public,anon;
grant execute on function public.store_chat_inbox(uuid) to authenticated;

create function public.store_chat_command(p_action text,p_conversation uuid default null,p_payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();p public.profiles%rowtype;cv public.store_chat_conversations%rowtype;target text;rev integer;eid uuid;begin
 if not private.chat_access(c) then raise exception 'Atendimento não autorizado' using errcode='42501';end if;
 select * into p from public.profiles where company_id=c and auth_user_id=auth.uid() and active order by id limit 1;
 if p_action not in ('read','claim','transfer','send','close','reopen','quick_reply','settings','quote_context') then raise exception 'Comando inválido';end if;
 if p_action in ('quick_reply','settings') then
 if p.role<>'admin' then raise exception 'Somente administradores';end if;
 perform private.saas_assert_write(c,'catalog');
 if p_action='quick_reply' then
 eid:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
 insert into public.store_chat_quick_replies(id,company_id,title,content,active) values(eid,c,p_payload->>'title',p_payload->>'content',coalesce((p_payload->>'active')::boolean,true))
 on conflict(id) do update set title=excluded.title,content=excluded.content,active=excluded.active,revision=store_chat_quick_replies.revision+1
 where store_chat_quick_replies.company_id=c and store_chat_quick_replies.revision=(p_payload->>'revision')::integer returning revision into rev;
 if rev is null then raise exception 'Conflito: atualize antes de salvar';end if;
 else
 insert into public.store_chat_settings(company_id,greeting,away_message) values(c,p_payload->>'greeting',p_payload->>'away_message') on conflict(company_id) do update set greeting=excluded.greeting,away_message=excluded.away_message,revision=store_chat_settings.revision+1
 where store_chat_settings.revision=(p_payload->>'revision')::integer returning revision into rev;
 if rev is null then raise exception 'Conflito: atualize antes de salvar';end if;eid:=null;
 end if;
 perform private.chat_audit(c,case when p_action='quick_reply' then 'chat.quick_reply_updated' else 'chat.settings_updated' end,coalesce(eid::text,c),auth.uid(),jsonb_build_object('revision',rev));
 return public.store_chat_inbox();
 end if;
 select * into cv from public.store_chat_conversations where company_id=c and id=p_conversation for update;
 if not found then raise exception 'Conversa indisponível';end if;
 if p_action='read' then
 insert into private.store_chat_reads(company_id,conversation_id,profile_id,seq) values(c,cv.id,p.id,greatest(0,least(cv.message_seq,coalesce((p_payload->>'seq')::bigint,0))))
 on conflict(conversation_id,profile_id) do update set seq=greatest(store_chat_reads.seq,excluded.seq);
 elsif p_action='quote_context' then
 if not private.chat_access(c,auth.uid(),'/quotes') then raise exception 'Orçamento não autorizado';end if;
 return jsonb_build_object('customer_id',cv.customer_id,'product_id',cv.product_id,'conversation_id',cv.id,'initial_message',(select content from public.store_chat_messages where conversation_id=cv.id and sender_type in ('visitor','customer') order by seq limit 1));
 else
 perform private.saas_assert_write(c,'catalog');
 if p_action='claim' then
 if cv.assigned_profile_id is not null or cv.status='closed' then raise exception 'A conversa já foi assumida ou encerrada';end if;
 update public.store_chat_conversations set assigned_profile_id=p.id,status='in_progress',claimed_at=coalesce(claimed_at,clock_timestamp()),updated_at=clock_timestamp() where id=cv.id;
 perform private.chat_audit(c,'chat.conversation_assigned',cv.id::text,auth.uid(),jsonb_build_object('profile_id',p.id));
 elsif p_action='transfer' then
 if p.role not in ('admin','gerente') or cv.status<>'in_progress' or cv.assigned_profile_id is distinct from nullif(p_payload->>'expected_profile_id','') then raise exception 'Transferência indisponível ou conflito';end if;
 target:=p_payload->>'profile_id';
 if not exists(select 1 from public.profiles where id=target and company_id=c and active and private.chat_access(c,auth_user_id)) then raise exception 'Atendente indisponível';end if;
 update public.store_chat_conversations set assigned_profile_id=target,updated_at=clock_timestamp() where id=cv.id;
 perform private.chat_audit(c,'chat.conversation_transferred',cv.id::text,auth.uid(),jsonb_build_object('from',cv.assigned_profile_id,'to',target));
 elsif p_action='send' then
 if cv.assigned_profile_id is distinct from p.id or cv.status<>'in_progress' then raise exception 'Assuma o atendimento antes de responder';end if;
 perform private.chat_append(c,cv.id,(p_payload->>'command_id')::uuid,'agent',p_payload->>'content',p.id);
 elsif p_action='close' then
 if cv.status='closed' or (cv.assigned_profile_id is distinct from p.id and p.role not in ('admin','gerente')) then raise exception 'Encerramento indisponível';end if;
 update public.store_chat_conversations set status='closed',closed_at=clock_timestamp(),updated_at=clock_timestamp(),handling_seconds=handling_seconds+case when claimed_at is null then 0 else greatest(0,extract(epoch from clock_timestamp()-claimed_at)) end where id=cv.id;
 perform private.chat_audit(c,'chat.conversation_closed',cv.id::text,auth.uid(),'{}');
 elsif p_action='reopen' then
 if cv.status<>'closed' then raise exception 'Conversa já aberta';end if;
 update public.store_chat_conversations set status='waiting',assigned_profile_id=null,closed_at=null,claimed_at=null,updated_at=clock_timestamp() where id=cv.id;
 perform private.chat_audit(c,'chat.conversation_reopened',cv.id::text,auth.uid(),'{}');
 end if;end if;
 return public.store_chat_inbox(cv.id);
end $$;
revoke all on function public.store_chat_command(text,uuid,jsonb) from public,anon;
grant execute on function public.store_chat_command(text,uuid,jsonb) to authenticated;

-- Only these tenant/RLS protected tables participate in DB -> UI invalidations.
alter publication supabase_realtime add table public.store_chat_conversations,public.store_chat_messages;

-- Add chat attribution around the existing reviewed aggregate save, including its Billing gate.
alter function public.save_quote_with_items_phase4b(jsonb,jsonb,timestamptz) set schema private;
alter function private.save_quote_with_items_phase4b(jsonb,jsonb,timestamptz) rename to chat_canonical_quote_save;
revoke all on function private.chat_canonical_quote_save(jsonb,jsonb,timestamptz) from public,anon,authenticated;
create function public.save_quote_with_items_phase4b(p_quote jsonb,p_items jsonb default '[]',p_expected_updated_at timestamptz default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c text:=private.current_company_id();cid uuid:=nullif(p_quote->>'chat_conversation_id','')::uuid;cv public.store_chat_conversations%rowtype;result jsonb;begin
 if cid is not null then
 if not private.chat_access(c) or not private.chat_access(c,auth.uid(),'/quotes') then raise exception 'Conversão não autorizada' using errcode='42501';end if;
 select * into cv from public.store_chat_conversations where company_id=c and id=cid for update;
 if not found or (cv.customer_id is not null and cv.customer_id is distinct from p_quote->>'customer_id') then raise exception 'Contexto do orçamento inválido';end if;
 end if;
 result:=private.chat_canonical_quote_save(p_quote-'chat_conversation_id',p_items,p_expected_updated_at);
 if cid is not null and result->>'result_status'='UPDATED' then
 insert into private.store_chat_quotes(company_id,conversation_id,quote_id) values(c,cid,p_quote->>'id') on conflict do nothing;
 end if;return result;
end $$;
revoke all on function public.save_quote_with_items_phase4b(jsonb,jsonb,timestamptz) from public,anon;
grant execute on function public.save_quote_with_items_phase4b(jsonb,jsonb,timestamptz) to authenticated;

create function public.store_chat_unread() returns bigint language sql stable security definer set search_path='' as $$
 select count(*) from public.store_chat_messages m
 join public.profiles p on p.company_id=m.company_id and p.auth_user_id=auth.uid() and p.active
 left join private.store_chat_reads r on r.conversation_id=m.conversation_id and r.profile_id=p.id
 where private.chat_access(m.company_id) and m.sender_type in ('visitor','customer') and m.seq>coalesce(r.seq,0)
$$;
revoke all on function public.store_chat_unread() from public,anon;
grant execute on function public.store_chat_unread() to authenticated;

create function public.store_chat_history(p_conversation uuid,p_before bigint) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c text:=private.current_company_id();begin
 if not private.chat_access(c) or not exists(select 1 from public.store_chat_conversations where company_id=c and id=p_conversation) then raise exception 'Histórico não autorizado' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(to_jsonb(m) order by seq),'[]'::jsonb) from (select id,seq,sender_type,content,created_at from public.store_chat_messages where company_id=c and conversation_id=p_conversation and seq<p_before order by seq desc limit 200) m);
end $$;
revoke all on function public.store_chat_history(uuid,bigint) from public,anon;
grant execute on function public.store_chat_history(uuid,bigint) to authenticated;

-- Restore the historical no-client-policy invariant on the unexposed migration-only table.
-- Phase11E's generic installation included it despite its zero-grant/no-policy contract.
drop policy if exists saas_rest_insert on public.company_footer_badge_defaults;
drop policy if exists saas_rest_update on public.company_footer_badge_defaults;
drop policy if exists saas_rest_delete on public.company_footer_badge_defaults;
