import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { isLocalStoreHost, normalizeStoreHost } from '@/lib/store/normalize-store-host';
import { resolveStoreLookupHostname } from '@/lib/store/resolve-store-lookup-hostname.mjs';
import { resolveStoreProductRequest, type StoreProductRequestInput } from '@/lib/store/whatsapp-product-request';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const missingSchemaCodes = new Set(['42P01', 'PGRST204', 'PGRST205']);
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers });
function resolveHostname(request: NextRequest) {
  const raw = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.hostname;
  const incoming = normalizeStoreHost(raw);
  const development = process.env.NODE_ENV !== 'production' ? normalizeStoreHost(process.env.STORE_PUBLIC_DEV_HOST) : null;
  return resolveStoreLookupHostname(incoming && isLocalStoreHost(incoming) ? development : incoming);
}

export async function POST(request: NextRequest) {
  const host = resolveHostname(request);
  if (!host || isLocalStoreHost(host)) return json({ error: 'Loja indisponível.' }, 400);
  let input: StoreProductRequestInput;
  try { input = await request.json(); } catch { return json({ error: 'Solicitação inválida.' }, 400); }
  const productId = typeof input.productId === 'string' ? input.productId.trim() : '';
  if (!productId || productId.length > 128) return json({ error: 'Produto indisponível.' }, 400);
  try {
    const supabase = getSupabaseAdminClient();
    const companies = await supabase.from('companies').select('id,name').or(`store_domain.eq.${host},custom_domain.eq.${host},admin_domain.eq.${host}`).limit(2);
    if (companies.error || companies.data?.length !== 1) return json({ error: 'Loja indisponível.' }, 404);
    const company = companies.data[0];
    const [product, publicSettings, template, whatsappSettings] = await Promise.all([
      supabase.from('products').select('id,name,active,catalog_active,sales_price,pricing_type').eq('id', productId).eq('company_id', company.id).maybeSingle(),
      supabase.from('settings').select('catalog_whatsapp').eq('company_id', company.id).maybeSingle(),
      supabase.from('whatsapp_message_templates').select('content,active').eq('company_id', company.id).eq('event_key', 'store_product_request').maybeSingle(),
      supabase.from('whatsapp_settings').select('country_code,business_phone,signature,open_mode,confirm_before_open,include_company_name').eq('company_id', company.id).maybeSingle()
    ]);
    if (product.error || publicSettings.error) return json({ error: 'Solicitação indisponível.' }, 503);
    const schemaMissing = [template.error, whatsappSettings.error].some((error) => Boolean(error?.code && missingSchemaCodes.has(error.code)));
    if ((template.error || whatsappSettings.error) && !schemaMissing) console.error('[Store WhatsApp request]', { stage: 'settings', code: template.error?.code || whatsappSettings.error?.code });
    const result = resolveStoreProductRequest(input, { companyName: company.name, publicPhone: publicSettings.data?.catalog_whatsapp || '', product: product.data, template: template.error ? null : template.data, settings: whatsappSettings.error ? null : whatsappSettings.data });
    if (!result.ok) return json({ error: result.reason === 'STORE_PHONE_UNAVAILABLE' ? 'WhatsApp da empresa não configurado.' : 'Produto indisponível.' }, result.status);
    return json(result);
  } catch (error) {
    console.error('[Store WhatsApp request]', { stage: 'request', message: error instanceof Error ? error.message : 'Unexpected error' });
    return json({ error: 'Não foi possível preparar a mensagem agora.' }, 503);
  }
}
