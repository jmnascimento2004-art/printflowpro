-- Phase 4E: global, tenant-scoped audit governance.
-- The audit row is appended by the authoritative database mutation and therefore
-- participates in the same transaction as the business change.

alter table public.audit_logs
  alter column actor_user_id drop not null;

alter table public.audit_logs
  add constraint audit_logs_actor_identity_check
  check (
    actor_user_id is not null
    or (actor_name = 'SYSTEM' and actor_role = 'system')
  );

revoke all on table public.audit_logs from service_role;
grant select on table public.audit_logs to service_role;

alter table public.audit_logs
  drop constraint if exists audit_logs_company_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_company_id_fkey
  foreign key (company_id) references public.companies(id) on delete restrict;

create index if not exists audit_logs_company_entity_created_idx
  on public.audit_logs(company_id, entity_type, entity_id, created_at desc, id desc);

create index if not exists audit_logs_company_actor_created_idx
  on public.audit_logs(company_id, actor_user_id, created_at desc, id desc)
  where actor_user_id is not null;

create or replace function private.phase4e_changed_values(
  p_source jsonb,
  p_other jsonb
)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_source, '{}'::jsonb)) item
  where coalesce(p_other, '{}'::jsonb) -> item.key is distinct from item.value
$$;

revoke all on function private.phase4e_changed_values(jsonb, jsonb)
from public, anon, authenticated;

create or replace function private.phase4b_audit_business_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := (select auth.uid());
  v_actor_profile_id text;
  v_actor_name text;
  v_actor_role text;
  v_actor_company_id text;
  v_is_system boolean := false;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_company_id text;
  v_entity_id text;
  v_module text;
  v_action text;
  v_old_safe jsonb := '{}'::jsonb;
  v_new_safe jsonb := '{}'::jsonb;
  v_old_delta jsonb := '{}'::jsonb;
  v_new_delta jsonb := '{}'::jsonb;
begin
  if v_actor_user_id is null then
    -- Only an authenticated service-role request is classified as SYSTEM. Direct
    -- maintenance SQL, migration replay and test fixture setup remain silent.
    if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
      return coalesce(new, old);
    end if;
    v_is_system := true;
    v_actor_name := 'SYSTEM';
    v_actor_role := 'system';
  else
    -- A self-update may deactivate the actor or change their role. Preserve the
    -- pre-mutation identity so the AFTER trigger never invents a business rule
    -- that blocks an otherwise valid profile change.
    if tg_table_name = 'profiles'
       and tg_op in ('UPDATE', 'DELETE')
       and v_old ->> 'auth_user_id' = v_actor_user_id::text then
      v_actor_profile_id := v_old ->> 'id';
      v_actor_name := coalesce(v_old ->> 'name', 'Usuário');
      v_actor_role := coalesce(v_old ->> 'role', 'unknown');
      v_actor_company_id := v_old ->> 'company_id';
    else
      select p.id, p.name, p.role, p.company_id
      into v_actor_profile_id, v_actor_name, v_actor_role, v_actor_company_id
      from public.profiles p
      where p.auth_user_id = v_actor_user_id
        and p.active = true
      order by p.id
      limit 1;

      if not found then
        raise exception using errcode = '42501', message = 'PHASE4E_ACTOR_NOT_AUTHORIZED';
      end if;
    end if;
  end if;

  v_company_id := coalesce(v_new ->> 'company_id', v_old ->> 'company_id');
  if tg_table_name = 'companies' then
    v_company_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  end if;
  v_entity_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_company_id);

  if v_company_id is null then
    return coalesce(new, old);
  end if;

  if not v_is_system and v_company_id is distinct from v_actor_company_id then
    raise exception using errcode = '42501', message = 'PHASE4E_TENANT_MISMATCH';
  end if;

  case tg_table_name
    when 'customers' then
      v_module := 'customers';
      v_action := case tg_op
        when 'INSERT' then 'customer.created'
        when 'DELETE' then 'customer.deleted'
        else 'customer.updated'
      end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'tags', v_old -> 'tags',
        'billing_type', v_old -> 'billing_type', 'credit_limit', v_old -> 'credit_limit',
        'credit_used', v_old -> 'credit_used', 'payment_terms_days', v_old -> 'payment_terms_days',
        'credit_status', v_old -> 'credit_status'
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'tags', v_new -> 'tags',
        'billing_type', v_new -> 'billing_type', 'credit_limit', v_new -> 'credit_limit',
        'credit_used', v_new -> 'credit_used', 'payment_terms_days', v_new -> 'payment_terms_days',
        'credit_status', v_new -> 'credit_status'
      );

    when 'suppliers' then
      v_module := 'suppliers';
      v_action := case tg_op
        when 'INSERT' then 'supplier.created'
        when 'DELETE' then 'supplier.deleted'
        else 'supplier.updated'
      end;
      v_old_safe := jsonb_build_object('name', v_old -> 'name');
      v_new_safe := jsonb_build_object('name', v_new -> 'name');

    when 'products' then
      if tg_op = 'UPDATE'
         and (v_old - 'updated_at' - 'current_stock') = (v_new - 'updated_at' - 'current_stock') then
        return coalesce(new, old);
      end if;
      v_module := 'products';
      v_action := case
        when tg_op = 'INSERT' then 'product.created'
        when tg_op = 'DELETE' then 'product.deleted'
        when v_old -> 'sales_price' is distinct from v_new -> 'sales_price'
          or v_old -> 'base_cost' is distinct from v_new -> 'base_cost'
          or v_old -> 'pricing_details' is distinct from v_new -> 'pricing_details'
          or v_old -> 'volume_pricing' is distinct from v_new -> 'volume_pricing'
          or v_old -> 'variant_options' is distinct from v_new -> 'variant_options'
          or v_old -> 'color_options' is distinct from v_new -> 'color_options'
          then 'product.price_changed'
        when v_old -> 'active' is distinct from v_new -> 'active'
          or v_old -> 'catalog_active' is distinct from v_new -> 'catalog_active'
          then 'product.status_changed'
        when v_old -> 'category_id' is distinct from v_new -> 'category_id'
          then 'product.category_changed'
        else 'product.updated'
      end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'sku', v_old -> 'sku', 'category_id', v_old -> 'category_id',
        'pricing_type', v_old -> 'pricing_type', 'base_cost', v_old -> 'base_cost',
        'sales_price', v_old -> 'sales_price', 'stock_controlled', v_old -> 'stock_controlled',
        'min_stock', v_old -> 'min_stock', 'active', v_old -> 'active',
        'catalog_active', v_old -> 'catalog_active', 'is_promo', v_old -> 'is_promo',
        'is_highlight', v_old -> 'is_highlight',
        'pricing_configuration_fingerprint', md5(concat(
          coalesce((v_old -> 'pricing_details')::text, ''),
          coalesce((v_old -> 'volume_pricing')::text, ''),
          coalesce((v_old -> 'variant_options')::text, ''),
          coalesce((v_old -> 'color_options')::text, '')
        ))
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'sku', v_new -> 'sku', 'category_id', v_new -> 'category_id',
        'pricing_type', v_new -> 'pricing_type', 'base_cost', v_new -> 'base_cost',
        'sales_price', v_new -> 'sales_price', 'stock_controlled', v_new -> 'stock_controlled',
        'min_stock', v_new -> 'min_stock', 'active', v_new -> 'active',
        'catalog_active', v_new -> 'catalog_active', 'is_promo', v_new -> 'is_promo',
        'is_highlight', v_new -> 'is_highlight',
        'pricing_configuration_fingerprint', md5(concat(
          coalesce((v_new -> 'pricing_details')::text, ''),
          coalesce((v_new -> 'volume_pricing')::text, ''),
          coalesce((v_new -> 'variant_options')::text, ''),
          coalesce((v_new -> 'color_options')::text, '')
        ))
      );

    when 'categories' then
      v_module := case
        when tg_op = 'UPDATE' and (
          v_old -> 'catalog_featured' is distinct from v_new -> 'catalog_featured'
          or v_old -> 'catalog_featured_title' is distinct from v_new -> 'catalog_featured_title'
          or v_old -> 'catalog_featured_sort_order' is distinct from v_new -> 'catalog_featured_sort_order'
          or v_old -> 'catalog_mega_menu_enabled' is distinct from v_new -> 'catalog_mega_menu_enabled'
          or v_old -> 'catalog_mega_menu_banner_enabled' is distinct from v_new -> 'catalog_mega_menu_banner_enabled'
          or v_old -> 'catalog_mega_menu_banner_link' is distinct from v_new -> 'catalog_mega_menu_banner_link'
        ) then 'catalog' else 'categories' end;
      v_action := case
        when tg_op = 'INSERT' then 'category.created'
        when tg_op = 'DELETE' then 'category.deleted'
        when v_old -> 'parent_id' is distinct from v_new -> 'parent_id' then 'category.hierarchy_changed'
        when v_old -> 'catalog_mega_menu_enabled' is distinct from v_new -> 'catalog_mega_menu_enabled'
          or v_old -> 'catalog_mega_menu_banner_enabled' is distinct from v_new -> 'catalog_mega_menu_banner_enabled'
          or v_old -> 'catalog_mega_menu_banner_link' is distinct from v_new -> 'catalog_mega_menu_banner_link'
          then 'catalog.mega_menu_changed'
        when v_old -> 'catalog_featured' is distinct from v_new -> 'catalog_featured'
          or v_old -> 'catalog_featured_title' is distinct from v_new -> 'catalog_featured_title'
          or v_old -> 'catalog_featured_sort_order' is distinct from v_new -> 'catalog_featured_sort_order'
          then 'catalog.category_featured_changed'
        else 'category.updated'
      end;
      v_old_safe := v_old - array[
        'company_id','created_at','updated_at','catalog_mega_menu_banner_image_url'
      ];
      v_new_safe := v_new - array[
        'company_id','created_at','updated_at','catalog_mega_menu_banner_image_url'
      ];

    when 'quotes' then
      v_module := 'quotes';
      v_action := case
        when tg_op = 'INSERT' then 'quote.created'
        when tg_op = 'DELETE' then 'quote.deleted'
        when v_old ->> 'status' is distinct from v_new ->> 'status'
          and v_new ->> 'status' = 'aprovado' then 'quote.approved'
        when v_old ->> 'status' is distinct from v_new ->> 'status'
          and v_new ->> 'status' = 'reprovado' then 'quote.rejected'
        when v_old ->> 'status' is distinct from v_new ->> 'status' then 'quote.status_changed'
        else 'quote.updated'
      end;
      v_old_safe := v_old - array[
        'company_id','customer_id','customer_name','notes','delivery_address','delivery_origin_address',
        'created_at','updated_at'
      ];
      v_new_safe := v_new - array[
        'company_id','customer_id','customer_name','notes','delivery_address','delivery_origin_address',
        'created_at','updated_at'
      ];

    when 'orders' then
      v_module := 'orders';
      v_action := case
        when tg_op = 'INSERT' then 'order.created'
        when tg_op = 'DELETE' then 'order.deleted'
        when v_old ->> 'status' is distinct from v_new ->> 'status' then 'order.status_changed'
        else 'order.updated'
      end;
      v_old_safe := v_old - array[
        'company_id','customer_id','customer_name','notes','delivery_address','delivery_origin_address',
        'created_at','updated_at'
      ];
      v_new_safe := v_new - array[
        'company_id','customer_id','customer_name','notes','delivery_address','delivery_origin_address',
        'created_at','updated_at'
      ];

    when 'production_queue' then
      if tg_op = 'UPDATE' and v_old -> 'status' is distinct from v_new -> 'status' then
        return coalesce(new, old);
      end if;
      v_module := 'production';
      v_action := case
        when tg_op = 'INSERT' then 'production.item_created'
        when tg_op = 'DELETE' then 'production.item_removed'
        when v_old -> 'responsible_name' is distinct from v_new -> 'responsible_name'
          then 'production.responsible_changed'
        when v_old -> 'priority' is distinct from v_new -> 'priority'
          then 'production.priority_changed'
        else 'production.item_updated'
      end;
      v_old_safe := jsonb_build_object(
        'order_number', v_old -> 'order_number', 'product_name', v_old -> 'product_name',
        'quantity', v_old -> 'quantity', 'status', v_old -> 'status',
        'priority', v_old -> 'priority', 'responsible_name', v_old -> 'responsible_name',
        'deadline', v_old -> 'deadline'
      );
      v_new_safe := jsonb_build_object(
        'order_number', v_new -> 'order_number', 'product_name', v_new -> 'product_name',
        'quantity', v_new -> 'quantity', 'status', v_new -> 'status',
        'priority', v_new -> 'priority', 'responsible_name', v_new -> 'responsible_name',
        'deadline', v_new -> 'deadline'
      );

    when 'financial_transactions' then
      v_module := 'financial';
      v_action := case tg_op
        when 'INSERT' then 'financial.transaction_created'
        when 'DELETE' then 'financial.transaction_deleted'
        else 'financial.payment_changed'
      end;
      v_old_safe := v_old - array['company_id','created_at','updated_at','description'];
      v_new_safe := v_new - array['company_id','created_at','updated_at','description'];

    when 'stock_movements' then
      v_module := 'stock';
      v_action := 'inventory.adjusted';
      v_old_safe := v_old - array['company_id','created_at'];
      v_new_safe := v_new - array['company_id','created_at'];

    when 'shipments' then
      v_module := 'shipment';
      v_action := case tg_op
        when 'INSERT' then 'shipment.created'
        when 'DELETE' then 'shipment.deleted'
        else 'shipment.status_changed'
      end;
      v_old_safe := v_old - array[
        'company_id','created_at','updated_at','address','customer_name'
      ];
      v_new_safe := v_new - array[
        'company_id','created_at','updated_at','address','customer_name'
      ];

    when 'settings' then
      v_module := 'settings';
      v_entity_id := v_company_id;
      v_action := case
        when v_old -> 'pix_key' is distinct from v_new -> 'pix_key'
          or v_old -> 'pix_key_type' is distinct from v_new -> 'pix_key_type'
          then 'settings.pix_updated'
        when v_old -> 'profit_margin' is distinct from v_new -> 'profit_margin'
          or v_old -> 'tax_rate' is distinct from v_new -> 'tax_rate'
          or v_old -> 'commission_rate' is distinct from v_new -> 'commission_rate'
          then 'settings.financial_updated'
        when v_old -> 'catalog_promotions_section_enabled' is distinct from v_new -> 'catalog_promotions_section_enabled'
          or v_old -> 'catalog_bestsellers_section_enabled' is distinct from v_new -> 'catalog_bestsellers_section_enabled'
          or v_old -> 'catalog_highlights_section_enabled' is distinct from v_new -> 'catalog_highlights_section_enabled'
          then 'catalog.configuration_changed'
        else 'settings.configuration_changed'
      end;
      v_old_safe := jsonb_build_object(
        'theme', v_old -> 'theme', 'profit_margin', v_old -> 'profit_margin',
        'tax_rate', v_old -> 'tax_rate', 'commission_rate', v_old -> 'commission_rate',
        'top_bar_hours', v_old -> 'top_bar_hours', 'top_bar_show_pickup', v_old -> 'top_bar_show_pickup',
        'footer_show_address', v_old -> 'footer_show_address',
        'footer_hours_message', v_old -> 'footer_hours_message', 'footer_hours_week', v_old -> 'footer_hours_week',
        'footer_hours_sat', v_old -> 'footer_hours_sat', 'footer_hours_sat_time', v_old -> 'footer_hours_sat_time',
        'footer_hours_sat_desc', v_old -> 'footer_hours_sat_desc',
        'saas_enabled', v_old -> 'saas_enabled', 'nfe_enabled', v_old -> 'nfe_enabled', 'ai_enabled', v_old -> 'ai_enabled',
        'delivery_motoboy_price_km', v_old -> 'delivery_motoboy_price_km',
        'delivery_car_price_km', v_old -> 'delivery_car_price_km', 'delivery_min_fee', v_old -> 'delivery_min_fee',
        'catalog_header_message', v_old -> 'catalog_header_message', 'free_pickup_alert', v_old -> 'free_pickup_alert',
        'catalog_footer_text', v_old -> 'catalog_footer_text',
        'catalog_promotions_section_enabled', v_old -> 'catalog_promotions_section_enabled',
        'catalog_bestsellers_section_enabled', v_old -> 'catalog_bestsellers_section_enabled',
        'catalog_highlights_section_enabled', v_old -> 'catalog_highlights_section_enabled',
        'pix_key_configured', nullif(v_old ->> 'pix_key', '') is not null,
        'catalog_whatsapp_configured', nullif(v_old ->> 'catalog_whatsapp', '') is not null,
        'sensitive_configuration_changed', false
      );
      v_new_safe := jsonb_build_object(
        'theme', v_new -> 'theme', 'profit_margin', v_new -> 'profit_margin',
        'tax_rate', v_new -> 'tax_rate', 'commission_rate', v_new -> 'commission_rate',
        'top_bar_hours', v_new -> 'top_bar_hours', 'top_bar_show_pickup', v_new -> 'top_bar_show_pickup',
        'footer_show_address', v_new -> 'footer_show_address',
        'footer_hours_message', v_new -> 'footer_hours_message', 'footer_hours_week', v_new -> 'footer_hours_week',
        'footer_hours_sat', v_new -> 'footer_hours_sat', 'footer_hours_sat_time', v_new -> 'footer_hours_sat_time',
        'footer_hours_sat_desc', v_new -> 'footer_hours_sat_desc',
        'saas_enabled', v_new -> 'saas_enabled', 'nfe_enabled', v_new -> 'nfe_enabled', 'ai_enabled', v_new -> 'ai_enabled',
        'delivery_motoboy_price_km', v_new -> 'delivery_motoboy_price_km',
        'delivery_car_price_km', v_new -> 'delivery_car_price_km', 'delivery_min_fee', v_new -> 'delivery_min_fee',
        'catalog_header_message', v_new -> 'catalog_header_message', 'free_pickup_alert', v_new -> 'free_pickup_alert',
        'catalog_footer_text', v_new -> 'catalog_footer_text',
        'catalog_promotions_section_enabled', v_new -> 'catalog_promotions_section_enabled',
        'catalog_bestsellers_section_enabled', v_new -> 'catalog_bestsellers_section_enabled',
        'catalog_highlights_section_enabled', v_new -> 'catalog_highlights_section_enabled',
        'pix_key_configured', nullif(v_new ->> 'pix_key', '') is not null,
        'catalog_whatsapp_configured', nullif(v_new ->> 'catalog_whatsapp', '') is not null,
        'sensitive_configuration_changed', tg_op = 'UPDATE' and (
          v_old -> 'pix_key' is distinct from v_new -> 'pix_key'
          or v_old -> 'pix_beneficiary_name' is distinct from v_new -> 'pix_beneficiary_name'
          or v_old -> 'bank_name' is distinct from v_new -> 'bank_name'
          or v_old -> 'top_bar_phone' is distinct from v_new -> 'top_bar_phone'
          or v_old -> 'company_address' is distinct from v_new -> 'company_address'
          or v_old -> 'catalog_whatsapp' is distinct from v_new -> 'catalog_whatsapp'
        )
      );

    when 'companies' then
      v_module := case
        when tg_op = 'UPDATE' and (
          v_old -> 'card_benefits_1_title' is distinct from v_new -> 'card_benefits_1_title'
          or v_old -> 'show_payments_pix' is distinct from v_new -> 'show_payments_pix'
          or v_old -> 'refund_policy' is distinct from v_new -> 'refund_policy'
        ) then 'catalog' else 'settings' end;
      v_action := case
        when v_module = 'catalog' then 'catalog.appearance_changed'
        else 'company.configuration_changed'
      end;
      select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
      into v_old_safe
      from jsonb_each(v_old) item
      where item.key in ('name','theme_color','store_domain','custom_domain_status','privacy_policy_version')
         or item.key ~ '^(show_|card_benefits_)';
      select coalesce(jsonb_object_agg(item.key, item.value), '{}'::jsonb)
      into v_new_safe
      from jsonb_each(v_new) item
      where item.key in ('name','theme_color','store_domain','custom_domain_status','privacy_policy_version')
         or item.key ~ '^(show_|card_benefits_)';
      v_old_safe := v_old_safe || jsonb_build_object(
        'contact_configured', nullif(v_old ->> 'phone', '') is not null or nullif(v_old ->> 'email', '') is not null,
        'privacy_contact_configured', nullif(v_old ->> 'privacy_email', '') is not null,
        'custom_domain_configured', nullif(v_old ->> 'custom_domain', '') is not null,
        'sensitive_configuration_changed', false
      );
      v_new_safe := v_new_safe || jsonb_build_object(
        'contact_configured', nullif(v_new ->> 'phone', '') is not null or nullif(v_new ->> 'email', '') is not null,
        'privacy_contact_configured', nullif(v_new ->> 'privacy_email', '') is not null,
        'custom_domain_configured', nullif(v_new ->> 'custom_domain', '') is not null,
        'sensitive_configuration_changed', tg_op = 'UPDATE' and (
          v_old -> 'document' is distinct from v_new -> 'document'
          or v_old -> 'phone' is distinct from v_new -> 'phone'
          or v_old -> 'email' is distinct from v_new -> 'email'
          or v_old -> 'cep' is distinct from v_new -> 'cep'
          or v_old -> 'street' is distinct from v_new -> 'street'
          or v_old -> 'number' is distinct from v_new -> 'number'
          or v_old -> 'neighborhood' is distinct from v_new -> 'neighborhood'
          or v_old -> 'city' is distinct from v_new -> 'city'
          or v_old -> 'state' is distinct from v_new -> 'state'
          or v_old -> 'privacy_email' is distinct from v_new -> 'privacy_email'
          or v_old -> 'privacy_contact_name' is distinct from v_new -> 'privacy_contact_name'
          or v_old -> 'privacy_contact_channel' is distinct from v_new -> 'privacy_contact_channel'
          or v_old -> 'privacy_retention_summary' is distinct from v_new -> 'privacy_retention_summary'
          or v_old -> 'privacy_third_parties' is distinct from v_new -> 'privacy_third_parties'
          or v_old -> 'custom_domain' is distinct from v_new -> 'custom_domain'
          or v_old -> 'instagram_url' is distinct from v_new -> 'instagram_url'
          or v_old -> 'facebook_url' is distinct from v_new -> 'facebook_url'
          or v_old -> 'youtube_url' is distinct from v_new -> 'youtube_url'
          or v_old -> 'refund_policy' is distinct from v_new -> 'refund_policy'
          or jsonb_build_array(v_old -> 'logo_url', v_old -> 'logo_light', v_old -> 'logo_dark', v_old -> 'favicon')
             is distinct from jsonb_build_array(v_new -> 'logo_url', v_new -> 'logo_light', v_new -> 'logo_dark', v_new -> 'favicon')
        )
      );

    when 'pickup_points' then
      v_module := 'settings';
      v_action := case
        when tg_op = 'INSERT' then 'pickup_point.created'
        when tg_op = 'DELETE' then 'pickup_point.deleted'
        when v_old -> 'active' is distinct from v_new -> 'active' then 'pickup_point.status_changed'
        else 'pickup_point.updated'
      end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'active', v_old -> 'active',
        'hours_week', v_old -> 'hours_week', 'hours_sat', v_old -> 'hours_sat'
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'active', v_new -> 'active',
        'hours_week', v_new -> 'hours_week', 'hours_sat', v_new -> 'hours_sat'
      );

    when 'store_banners' then
      v_module := 'catalog';
      v_action := case
        when tg_op = 'INSERT' then 'catalog.banner_created'
        when tg_op = 'DELETE' then 'catalog.banner_deleted'
        when v_old -> 'active' is distinct from v_new -> 'active' then 'catalog.banner_status_changed'
        when v_old -> 'sort_order' is distinct from v_new -> 'sort_order' then 'catalog.banner_order_changed'
        else 'catalog.banner_updated'
      end;
      v_old_safe := v_old - array[
        'company_id','created_at','updated_at','image_url','mobile_image_url'
      ];
      v_new_safe := v_new - array[
        'company_id','created_at','updated_at','image_url','mobile_image_url'
      ];

    when 'role_permissions' then
      v_module := 'settings';
      v_entity_id := coalesce(v_new ->> 'path', v_old ->> 'path', v_company_id);
      v_action := case tg_op
        when 'INSERT' then 'user.permission_created'
        when 'DELETE' then 'user.permission_deleted'
        else 'user.permission_changed'
      end;
      v_old_safe := jsonb_build_object('path', v_old -> 'path', 'roles', v_old -> 'roles');
      v_new_safe := jsonb_build_object('path', v_new -> 'path', 'roles', v_new -> 'roles');

    when 'profiles' then
      v_module := 'settings';
      v_action := case
        when tg_op = 'INSERT' then 'user.added'
        when tg_op = 'DELETE' then 'user.removed'
        when v_old -> 'role' is distinct from v_new -> 'role' then 'user.role_changed'
        when v_old -> 'active' is distinct from v_new -> 'active' then 'user.status_changed'
        else 'user.updated'
      end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'role', v_old -> 'role', 'active', v_old -> 'active'
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'role', v_new -> 'role', 'active', v_new -> 'active'
      );

    when 'cash_register_sessions' then
      v_module := 'pos';
      v_action := case
        when tg_op = 'INSERT' then 'cash_register.opened'
        when tg_op = 'DELETE' then 'cash_register.deleted'
        when v_new ->> 'status' = 'fechado' and v_old ->> 'status' = 'aberto'
          then 'cash_register.closed'
        else 'cash_register.balance_changed'
      end;
      v_old_safe := v_old - array[
        'company_id','created_at','updated_at','notes','opened_by'
      ];
      v_new_safe := v_new - array[
        'company_id','created_at','updated_at','notes','opened_by'
      ];

    when 'company_default_services' then
      v_module := 'settings';
      v_action := case tg_op
        when 'INSERT' then 'settings.default_service_created'
        when 'DELETE' then 'settings.default_service_deleted'
        else 'settings.default_service_updated'
      end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'default_price', v_old -> 'default_price',
        'is_active', v_old -> 'is_active'
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'default_price', v_new -> 'default_price',
        'is_active', v_new -> 'is_active'
      );

    when 'whatsapp_message_templates' then
      v_module := 'whatsapp';
      v_action := case
        when tg_op = 'INSERT' then 'whatsapp.template_created'
        when tg_op = 'DELETE' then 'whatsapp.template_deleted'
        when v_old -> 'active' is distinct from v_new -> 'active' then 'whatsapp.event_status_changed'
        else 'whatsapp.template_updated'
      end;
      v_old_safe := jsonb_build_object(
        'event_key', v_old -> 'event_key', 'name', v_old -> 'name', 'active', v_old -> 'active',
        'content_fingerprint', md5(coalesce(v_old ->> 'content', '')),
        'content_length', char_length(coalesce(v_old ->> 'content', ''))
      );
      v_new_safe := jsonb_build_object(
        'event_key', v_new -> 'event_key', 'name', v_new -> 'name', 'active', v_new -> 'active',
        'content_fingerprint', md5(coalesce(v_new ->> 'content', '')),
        'content_length', char_length(coalesce(v_new ->> 'content', ''))
      );

    when 'whatsapp_settings' then
      v_module := 'whatsapp';
      v_action := 'whatsapp.configuration_changed';
      v_old_safe := jsonb_build_object(
        'country_code', v_old -> 'country_code',
        'business_phone_configured', nullif(v_old ->> 'business_phone', '') is not null,
        'signature_configured', nullif(v_old ->> 'signature', '') is not null,
        'open_mode', v_old -> 'open_mode', 'confirm_before_open', v_old -> 'confirm_before_open',
        'include_company_name', v_old -> 'include_company_name'
      );
      v_new_safe := jsonb_build_object(
        'country_code', v_new -> 'country_code',
        'business_phone_configured', nullif(v_new ->> 'business_phone', '') is not null,
        'signature_configured', nullif(v_new ->> 'signature', '') is not null,
        'open_mode', v_new -> 'open_mode', 'confirm_before_open', v_new -> 'confirm_before_open',
        'include_company_name', v_new -> 'include_company_name'
      );

    when 'whatsapp_custom_messages' then
      v_module := 'whatsapp';
      v_action := case tg_op
        when 'INSERT' then 'whatsapp.custom_message_created'
        when 'DELETE' then 'whatsapp.custom_message_deleted'
        else 'whatsapp.custom_message_updated'
      end;
      v_old_safe := jsonb_build_object(
        'name', v_old -> 'name', 'context_type', v_old -> 'context_type',
        'content_fingerprint', md5(coalesce(v_old ->> 'content', '')),
        'content_length', char_length(coalesce(v_old ->> 'content', ''))
      );
      v_new_safe := jsonb_build_object(
        'name', v_new -> 'name', 'context_type', v_new -> 'context_type',
        'content_fingerprint', md5(coalesce(v_new ->> 'content', '')),
        'content_length', char_length(coalesce(v_new ->> 'content', ''))
      );

    else
      return coalesce(new, old);
  end case;

  if tg_op = 'UPDATE' then
    v_old_delta := private.phase4e_changed_values(v_old_safe, v_new_safe);
    v_new_delta := private.phase4e_changed_values(v_new_safe, v_old_safe);
    if v_old_delta = '{}'::jsonb and v_new_delta = '{}'::jsonb then
      return coalesce(new, old);
    end if;
    v_old_safe := v_old_delta;
    v_new_safe := v_new_delta;
  end if;

  -- Quote and order triggers are deferred. If their authoritative RPC already
  -- emitted the richer aggregate event in this same transaction, that event is
  -- canonical and the generic row event is not duplicated. Direct mutations
  -- (approval, deletion, payment side effects, etc.) still have no matching rich
  -- event and therefore remain covered here.
  if tg_table_name in ('quotes', 'orders') and exists (
    select 1
    from public.audit_logs a
    where a.company_id = v_company_id
      and a.entity_type = tg_table_name
      and a.entity_id = v_entity_id
      and a.metadata ->> 'source' = 'phase4b_explicit_command'
      and a.xmin::text::bigint = txid_current()
  ) then
    return coalesce(new, old);
  end if;

  insert into public.audit_logs (
    company_id, actor_user_id, actor_profile_id, actor_name, actor_role,
    action, entity_type, entity_id, module, old_values, new_values, metadata
  ) values (
    v_company_id, v_actor_user_id, v_actor_profile_id, v_actor_name, v_actor_role,
    v_action, tg_table_name, v_entity_id, v_module, v_old_safe, v_new_safe,
    jsonb_build_object(
      'source', case when v_is_system then 'server_system_mutation' else 'authenticated_database_mutation' end,
      'actor_kind', case when v_is_system then 'system' else 'human' end,
      'operation', lower(tg_op)
    )
  );

  return coalesce(new, old);
end;
$$;

revoke all on function private.phase4b_audit_business_mutation()
from public, anon, authenticated;

do $$
declare
  v_table text;
  v_optional_tables constant text[] := array['company_default_services'];
begin
  foreach v_table in array array[
    'customers','suppliers','products','categories','quotes','orders','production_queue',
    'financial_transactions','stock_movements','shipments','settings','companies',
    'pickup_points','store_banners','profiles','role_permissions','cash_register_sessions',
    'company_default_services','whatsapp_message_templates','whatsapp_settings',
    'whatsapp_custom_messages'
  ] loop
    -- Historical environments may legitimately lack an optional business
    -- table whose pre-ledger migration was never recorded/applied. Auditing
    -- must not create that domain table or block the rest of this additive
    -- governance migration; when the table exists, it is always covered.
    if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_table)) is null then
      if v_table = any(v_optional_tables) then
        continue;
      end if;
      raise exception using
        errcode = '42P01',
        message = pg_catalog.format('PHASE4E_REQUIRED_TABLE_MISSING:%s', v_table);
    end if;

    execute format('drop trigger if exists phase4b_audit_business_mutation on public.%I', v_table);
    if v_table in ('quotes', 'orders') then
      execute format(
        'create constraint trigger phase4b_audit_business_mutation after insert or update or delete on public.%I deferrable initially deferred for each row execute function private.phase4b_audit_business_mutation()',
        v_table
      );
    else
      execute format(
        'create trigger phase4b_audit_business_mutation after insert or update or delete on public.%I for each row execute function private.phase4b_audit_business_mutation()',
        v_table
      );
    end if;
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
