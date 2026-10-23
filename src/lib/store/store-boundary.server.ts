import 'server-only';
import { NextRequest } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { isLocalStoreHost, normalizeStoreHost } from './normalize-store-host';
import { resolveStoreLookupHostname } from './resolve-store-lookup-hostname.mjs';

/** Same allowlisted Preview/hostname resolution as the public bootstrap. Never accept company_id. */
export async function resolveStoreBoundary(request: NextRequest) {
  const authority=request.headers.get('host');
  if(!authority || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(authority))throw new Error('Store indisponível.');
  const incoming = normalizeStoreHost(authority);
  const development = process.env.NODE_ENV !== 'production' ? normalizeStoreHost(process.env.STORE_PUBLIC_DEV_HOST) : null;
  const host = resolveStoreLookupHostname(incoming && isLocalStoreHost(incoming) ? development : incoming);
  if (!host || isLocalStoreHost(host)) throw new Error('Store indisponível.');
  const client = getSupabaseAdminClient();
  const { data, error } = await client.from('companies').select('id').or(`store_domain.eq.${host},custom_domain.eq.${host},admin_domain.eq.${host}`).limit(2);
  if (error || data?.length !== 1) throw new Error('Store indisponível.');
  return { client, companyId: String(data[0].id) };
}

export function requireStoreOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('Origem inválida.');
}
