-- Only manual commitments are persisted. ERP deadlines remain in their source tables.
create or replace function private.agenda_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role = any(coalesce(r.roles,
    array['admin','gerente','financeiro','vendas','producao','arte_finalista','estoque']::text[]))
    from public.profiles p left join public.role_permissions r
      on r.company_id=p.company_id and r.path='/agenda'
    where p.auth_user_id=(select auth.uid()) and p.active order by p.id limit 1),false)
$$;
revoke all on function private.agenda_allowed() from public, anon;
grant execute on function private.agenda_allowed() to authenticated;

create table public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '' check (length(description)<=4000),
  event_type text not null check (event_type in ('compromisso','reuniao','visita','instalacao','retirada','entrega','outro')),
  start_at timestamptz not null,
  end_at timestamptz,
  customer_id text references public.customers(id),
  responsible_profile_id text not null references public.profiles(id),
  status text not null default 'agendado' check (status in ('agendado','concluido','cancelado')),
  reminder_minutes integer check (reminder_minutes between 0 and 10080),
  recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','monthly')),
  recurrence_until date,
  created_by uuid not null,
  completed_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (isfinite(start_at) and (end_at is null or (isfinite(end_at) and end_at>start_at and end_at<=start_at+interval '7 days'))),
  check ((recurrence='none' and recurrence_until is null) or
    (recurrence<>'none' and recurrence_until is not null and recurrence_until >= (start_at at time zone 'America/Bahia')::date
    and recurrence_until <= (start_at at time zone 'America/Bahia')::date+730))
);
create index agenda_events_company_start_idx on public.agenda_events(company_id,start_at);
create index agenda_events_company_recurring_idx on public.agenda_events(company_id,recurrence_until) where recurrence<>'none';
create index agenda_events_responsible_idx on public.agenda_events(company_id,responsible_profile_id,start_at);
alter table public.agenda_events enable row level security;
revoke all on public.agenda_events from public,anon,authenticated;
grant select,insert,update on public.agenda_events to authenticated;
create policy agenda_read on public.agenda_events for select to authenticated
 using (company_id=(select private.current_company_id()) and (select private.agenda_allowed()));
create policy agenda_insert on public.agenda_events for insert to authenticated
 with check (company_id=(select private.current_company_id()) and (select private.agenda_allowed()));
create policy agenda_update on public.agenda_events for update to authenticated
 using (company_id=(select private.current_company_id()) and (select private.agenda_allowed()))
 with check (company_id=(select private.current_company_id()) and (select private.agenda_allowed()));

-- This trigger needs privileged access only to validate references and append the existing audit log.
create function private.agenda_validate_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare actor public.profiles; action_name text; old_safe jsonb := '{}'; new_safe jsonb;
begin
 select * into actor from public.profiles where auth_user_id=(select auth.uid()) and active order by id limit 1;
 if actor.id is null or actor.company_id<>new.company_id or not private.agenda_allowed() then
   raise exception using errcode='42501',message='Agenda access denied';
 end if;
 if not exists(select 1 from public.profiles where id=new.responsible_profile_id and company_id=actor.company_id and active and auth_user_id is not null) then
   raise exception using errcode='23514',message='Invalid agenda responsible';
 end if;
 if new.customer_id is not null and not exists(select 1 from public.customers where id=new.customer_id and company_id=actor.company_id) then
   raise exception using errcode='23514',message='Invalid agenda customer';
 end if;
 if tg_op='UPDATE' then
   if new.id<>old.id or new.company_id<>old.company_id then raise exception using errcode='23514',message='Agenda identity is immutable'; end if;
   new.created_by:=old.created_by; new.created_at:=old.created_at;
   old_safe:=jsonb_build_object('status',old.status,'start_at',old.start_at,'end_at',old.end_at,'responsible_profile_id',old.responsible_profile_id,'recurrence',old.recurrence,'reminder_minutes',old.reminder_minutes);
 else new.created_by:=auth.uid(); new.created_at:=clock_timestamp(); end if;
 new.updated_at:=clock_timestamp();
 if new.status='concluido' then
   if tg_op='UPDATE' and old.status='concluido' then new.completed_at:=old.completed_at; new.completed_by:=old.completed_by;
   else new.completed_at:=clock_timestamp(); new.completed_by:=auth.uid(); end if;
 else new.completed_at:=null; new.completed_by:=null; end if;
 action_name:=case when tg_op='INSERT' then 'agenda.event_created' when new.status='concluido' and old.status is distinct from new.status then 'agenda.event_completed'
   when new.status='cancelado' and old.status is distinct from new.status then 'agenda.event_cancelled' else 'agenda.event_updated' end;
 new_safe:=jsonb_build_object('status',new.status,'start_at',new.start_at,'end_at',new.end_at,'responsible_profile_id',new.responsible_profile_id,'recurrence',new.recurrence,'reminder_minutes',new.reminder_minutes);
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
 values(new.company_id,auth.uid(),actor.id,actor.name,actor.role,action_name,'agenda_events',new.id::text,'agenda',old_safe,new_safe,'{"source":"authenticated_database_mutation"}');
 return new;
end $$;
revoke all on function private.agenda_validate_audit() from public,anon,authenticated;
create trigger agenda_validate_audit before insert or update on public.agenda_events for each row execute function private.agenda_validate_audit();

-- Acknowledgement is per user and occurrence, never a second copy of an event.
create table public.agenda_reminder_acks (
  event_id uuid not null references public.agenda_events(id) on delete cascade,
  occurrence_at timestamptz not null,
  user_id uuid not null default auth.uid(),
  acknowledged_at timestamptz not null default now(),
  primary key(event_id,occurrence_at,user_id)
);
alter table public.agenda_reminder_acks enable row level security;
revoke all on public.agenda_reminder_acks from public,anon,authenticated;
grant select,insert on public.agenda_reminder_acks to authenticated;
create policy agenda_ack_read on public.agenda_reminder_acks for select to authenticated
 using (user_id=(select auth.uid()) and exists(select 1 from public.agenda_events e where e.id=event_id));
create policy agenda_ack_insert on public.agenda_reminder_acks for insert to authenticated
 with check (user_id=(select auth.uid()) and exists(select 1 from public.agenda_events e where e.id=event_id));
