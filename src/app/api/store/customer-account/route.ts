import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { isLocalStoreHost, normalizeStoreHost } from '@/lib/store/normalize-store-host';
import { resolveStoreLookupHostname } from '@/lib/store/resolve-store-lookup-hostname.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const failure = (status: number) => NextResponse.json({ error: 'Nao foi possivel concluir o cadastro.' }, { status, headers });
const stringFields: Record<string, number> = {
  p_name: 200, p_customer_type: 10, p_document: 32, p_phone: 32,
  p_whatsapp: 32, p_trade_name: 200, p_birth_date: 10,
  p_contact_preference: 30, p_privacy_policy_version: 40, p_terms_version: 40
};
const booleanFields = ['p_marketing_email_granted', 'p_marketing_whatsapp_granted'];

export async function POST(request: NextRequest) {
  // Host is the application's routed authority. Forwarded/Origin/Referer headers
  // are never used to choose the Store, including on direct HTTP requests.
  const rawHost = request.headers.get('host');
  if (!rawHost || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(rawHost)) return failure(400);
  const incoming = normalizeStoreHost(rawHost);
  const local = incoming && isLocalStoreHost(incoming);
  const configuredLocal = process.env.NODE_ENV !== 'production'
    ? normalizeStoreHost(process.env.STORE_PUBLIC_DEV_HOST) : null;
  const host = resolveStoreLookupHostname(local ? configuredLocal : incoming);
  if (!host || isLocalStoreHost(host)) return failure(400);

  const authorization = request.headers.get('authorization');
  const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) return failure(401);

  let input: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 8192) return failure(400);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return failure(400);
    input = parsed as Record<string, unknown>;
    for (const [key, value] of Object.entries(input)) {
      if (Object.hasOwn(stringFields, key)) {
        if (value !== null && (typeof value !== 'string' || value.length > stringFields[key])) return failure(400);
      } else if (booleanFields.includes(key)) {
        if (typeof value !== 'boolean') return failure(400);
      } else return failure(400); // company/actor/email authority is never accepted.
    }
    if (typeof input.p_name !== 'string' || !input.p_name.trim()) return failure(400);
    if (!['fisica', 'juridica'].includes(String(input.p_customer_type))) return failure(400);
  } catch { return failure(400); }

  try {
    const admin = getSupabaseAdminClient();
    const identity = await admin.auth.getUser(token);
    if (identity.error || !identity.data.user || identity.data.user.is_anonymous) return failure(401);
    // Do not forward the user's Authorization header to the privileged RPC.
    // The DB resolves exactly one company from the canonical server hostname.
    const result = await admin.rpc('ensure_store_customer_account_from_server', {
      p_store_hostname: host,
      p_actor_user_id: identity.data.user.id,
      p_profile: input
    });
    if (result.error) return failure(result.error.code === 'P0001' ? 409 : 503);
    const account = result.data?.[0];
    if (!account?.account_id || !account?.customer_id) return failure(503);
    return NextResponse.json({ account_id: account.account_id, customer_id: account.customer_id }, { headers });
  } catch { return failure(503); }
}
