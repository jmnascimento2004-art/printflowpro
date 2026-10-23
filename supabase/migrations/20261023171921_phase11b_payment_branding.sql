-- Preserve the public resolver boundary and use the tenant's light logo fallback.
create or replace function public.payment_public_source(p_token text,p_host text,p_preview boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.payment_links%rowtype;company public.companies%rowtype;o public.orders%rowtype;begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Service required' using errcode='42501';end if;
 if p_token is null or p_token!~'^[a-f0-9]{64}$' then return null;end if;
 select * into l from public.payment_links where token_hash=encode(extensions.digest(p_token,'sha256'),'hex');if not found then return null;end if;
 select * into company from public.companies where id=l.company_id and (p_preview or p_host in (store_domain,admin_domain,custom_domain));if not found then return null;end if;
 select * into o from public.orders where id=l.order_id and company_id=l.company_id;
 return jsonb_build_object('company',company.name,'logo',coalesce(nullif(company.logo_light,''),nullif(company.logo_url,''),nullif(company.logo_dark,'')),'color',company.theme_color,'order',o.number,'customer',split_part(o.customer_name,' ',1),'amount',l.amount,'currency',l.currency,'status',private.payment_link_status(l),'expires_at',l.expires_at,'expires_on',((l.expires_at at time zone 'America/Bahia')::date-1),'provider',l.provider,'paid_at',l.paid_at);
end $$;
revoke all on function public.payment_public_source(text,text,boolean) from public,anon,authenticated;
grant execute on function public.payment_public_source(text,text,boolean) to service_role;
