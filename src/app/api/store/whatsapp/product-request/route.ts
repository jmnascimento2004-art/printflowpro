import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { isLocalStoreHost, normalizeStoreHost } from '@/lib/store/normalize-store-host';
import { resolveStoreLookupHostname } from '@/lib/store/resolve-store-lookup-hostname.mjs';
import { parseStoreProductRequestInput } from '@/lib/store/whatsapp-product-request';
import { resolveSystemWhatsAppMessage } from '@/lib/whatsapp/system-message-resolver.server';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
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
  let rawInput: unknown;
  try { rawInput = await request.json(); } catch { return json({ error: 'Solicitação inválida.' }, 400); }
  const serializedInput = JSON.stringify(rawInput);
  if (!serializedInput || serializedInput.length > 32768) return json({ error: 'Solicitação inválida.' }, 400);
  const input = parseStoreProductRequestInput(rawInput);
  if (!input) return json({ error: 'Solicitação inválida.' }, 400);
  const productId = String(input.productId).trim();
  const storeRequest = { ...input };
  delete storeRequest.productId;
  try {
    const supabase = getSupabaseAdminClient();
    const companies = await supabase.from('companies').select('id').or(`store_domain.eq.${host},custom_domain.eq.${host},admin_domain.eq.${host}`).limit(2);
    if (companies.error) return json({ error: 'Loja indisponível.' }, 503);
    if (companies.data?.length !== 1) return json({ error: 'Loja indisponível.' }, 404);
    const trustedCompanyId = typeof companies.data[0].id === 'string' ? companies.data[0].id.trim() : '';
    if (!trustedCompanyId) return json({ error: 'Loja indisponível.' }, 503);
    const result = await resolveSystemWhatsAppMessage({
      trustedCompanyId,
      context: {
        eventKey: 'store_product_request',
        productId,
        request: storeRequest
      },
      allowMissingRecipient: true
    });
    if (result.active && !result.recipientAvailable) return json({ error: 'WhatsApp da empresa não configurado.' }, 422);
    return json({
      eventKey: result.eventKey,
      active: result.active,
      confirmBeforeOpen: result.confirmBeforeOpen,
      href: result.active ? result.testHref : ''
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/PRODUCT_(?:NOT_FOUND|UNAVAILABLE)|TENANT_MISMATCH/.test(message)) return json({ error: 'Produto indisponível.' }, 404);
    if (/RECIPIENT_MISSING/.test(message)) return json({ error: 'WhatsApp da empresa não configurado.' }, 422);
    console.error('[Store WhatsApp request]', { stage: 'request', message: error instanceof Error ? error.message : 'Unexpected error' });
    return json({ error: 'Não foi possível preparar a mensagem agora.' }, 503);
  }
}
