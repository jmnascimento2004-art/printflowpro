-- Targeted, idempotent repair for the single production gap confirmed by the
-- read-only Production/Orders inventory on 2026-08-20. No existing queue row
-- or operational stage is modified.

do $$
declare
  v_candidate_count integer;
  v_company_id text;
  v_order_id text;
  v_order_status text;
  v_item_count integer;
  v_existing_count integer;
  v_inserted_count integer;
begin
  select count(*)::integer, min(c.id), min(o.id), min(o.status)
  into v_candidate_count, v_company_id, v_order_id, v_order_status
  from public.companies c
  join public.orders o on o.company_id = c.id
  where lower(btrim(c.name)) = 'cibeleprint'
    and upper(btrim(o.number)) = 'PED-0024';

  if v_candidate_count = 0 then
    raise notice 'ORDER_PRODUCTION_REPAIR_TARGET_NOT_PRESENT';
    return;
  end if;

  if v_candidate_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_PRODUCTION_REPAIR_TARGET_AMBIGUOUS';
  end if;

  if v_order_status not in ('producao', 'impressao', 'acabamento') then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_PRODUCTION_REPAIR_TARGET_NOT_ELIGIBLE';
  end if;

  select count(*)::integer
  into v_item_count
  from public.order_items i
  where i.order_id = v_order_id;

  if v_item_count < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_PRODUCTION_REPAIR_TARGET_HAS_NO_ITEMS';
  end if;

  select count(*)::integer
  into v_existing_count
  from public.production_queue q
  where q.company_id = v_company_id
    and q.order_id = v_order_id;

  if v_existing_count = v_item_count then
    raise notice 'ORDER_PRODUCTION_REPAIR_ALREADY_COMPLETE';
    return;
  end if;

  if v_existing_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_PRODUCTION_REPAIR_PARTIAL_STATE';
  end if;

  select count(*)::integer
  into v_inserted_count
  from private.ensure_production_queue_for_order(v_order_id, v_company_id);

  if v_inserted_count <> v_item_count then
    raise exception using
      errcode = 'P0001',
      message = 'ORDER_PRODUCTION_REPAIR_INSERT_COUNT_MISMATCH';
  end if;

  insert into public.audit_logs (
    company_id,
    actor_user_id,
    actor_profile_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    module,
    old_values,
    new_values,
    metadata
  ) values (
    v_company_id,
    null,
    null,
    'SYSTEM',
    'system',
    'production.queue_repaired',
    'orders',
    v_order_id,
    'production',
    '{}'::jsonb,
    jsonb_build_object('queue_item_count', v_inserted_count),
    jsonb_build_object(
      'order_number', 'PED-0024',
      'source', 'targeted_idempotent_repair_20260820174500'
    )
  );
end;
$$;
