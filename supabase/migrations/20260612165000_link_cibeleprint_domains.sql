-- PRINTFLOWPRO - link CIBELEPRINT tenant to the separated admin/store domains
-- Safe/idempotent: updates only the matching company row and preserves existing non-empty custom fields.

update public.companies
set
  admin_domain = coalesce(nullif(admin_domain, ''), 'admin.cibeleprint.com.br'),
  store_domain = coalesce(nullif(store_domain, ''), 'store.cibeleprint.com.br'),
  custom_domain = coalesce(nullif(custom_domain, ''), 'store.cibeleprint.com.br'),
  custom_domain_status = case
    when custom_domain_status = 'active' then custom_domain_status
    else 'pending'
  end
where
  lower(coalesce(name, '')) like '%cibele%'
  or lower(coalesce(email, '')) like '%cibeleprint%'
  or regexp_replace(coalesce(document, ''), '\D', '', 'g') = '30807938000189';
