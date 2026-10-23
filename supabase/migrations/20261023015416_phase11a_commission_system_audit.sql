-- Match the existing Phase 4E audit identity contract for service and maintenance.
create or replace function private.commission_audit(p_company text,p_action text,p_id text,p_old jsonb,p_new jsonb,p_operation uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare a public.profiles%rowtype; actor uuid := auth.uid(); actor_name text; actor_role text;
begin
 if actor is null then
  -- Direct maintenance has no business actor, as in phase4b_audit_business_mutation.
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then return; end if;
  actor_name := 'SYSTEM'; actor_role := 'system';
 else
  select * into a from public.profiles where auth_user_id=actor and company_id=p_company and active order by id limit 1;
  if not found then raise exception using errcode='42501',message='Commission audit actor not authorized'; end if;
  actor_name := a.name; actor_role := a.role;
 end if;
 insert into public.audit_logs(company_id,actor_user_id,actor_profile_id,actor_name,actor_role,action,entity_type,entity_id,module,old_values,new_values,metadata)
 values(p_company,actor,a.id,actor_name,actor_role,p_action,'commission',p_id,'financial',coalesce(p_old,'{}'),coalesce(p_new,'{}'),jsonb_build_object('operation_id',p_operation));
end $$;
revoke all on function private.commission_audit(text,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
