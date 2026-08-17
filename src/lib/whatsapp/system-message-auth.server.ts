import 'server-only';

import { authenticatePdfRequest } from '@/lib/pdf/pdf-server-auth';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import type { WhatsAppEventKey } from './variable-contract';

type ContextualWhatsAppEventKey = Exclude<WhatsAppEventKey, 'store_product_request'>;

const FALLBACK_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  '/whatsapp': ['admin', 'gerente'],
  '/quotes': ['admin', 'gerente', 'financeiro', 'vendas'],
  '/orders': ['admin', 'gerente', 'financeiro', 'vendas', 'producao', 'arte_finalista', 'estoque'],
  '/financial': ['admin', 'gerente', 'financeiro'],
  '/production': ['admin', 'gerente', 'producao', 'arte_finalista']
};

const REQUIRED_PATHS: Readonly<Record<ContextualWhatsAppEventKey, readonly string[]>> = {
  quote_proposal: ['/whatsapp', '/quotes'],
  order_payment_pending: ['/whatsapp', '/orders', '/financial'],
  production_status_changed: ['/whatsapp', '/production']
};

export function hasSystemMessageContextPermissions(
  eventKey: ContextualWhatsAppEventKey,
  role: string,
  configured: ReadonlyMap<string, readonly string[]>
) {
  return REQUIRED_PATHS[eventKey].every((path) => (
    (configured.get(path) || FALLBACK_PERMISSIONS[path] || []).includes(role)
  ));
}

export class WhatsAppSystemMessageAccessError extends Error {
  constructor(public readonly status: 401 | 403) {
    super(status === 401 ? 'WHATSAPP_CONTEXT_AUTH_REQUIRED' : 'WHATSAPP_CONTEXT_ACCESS_DENIED');
    this.name = 'WhatsAppSystemMessageAccessError';
  }
}

export async function authorizeSystemMessageContext(
  request: Request,
  eventKey: ContextualWhatsAppEventKey
): Promise<{ trustedCompanyId: string }> {
  let access;
  try {
    access = await authenticatePdfRequest(request);
  } catch (error) {
    const status = typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : 500;
    if (status === 401 || status === 403) throw new WhatsAppSystemMessageAccessError(status);
    throw error;
  }

  const requiredPaths = REQUIRED_PATHS[eventKey];
  const { data, error } = await getSupabaseAdminClient()
    .from('role_permissions')
    .select('path,roles')
    .eq('company_id', access.companyId)
    .in('path', [...requiredPaths]);

  if (error) throw new Error('WHATSAPP_CONTEXT_PERMISSION_QUERY_FAILED');
  const configured = new Map(
    (data || []).map((row) => [String(row.path), Array.isArray(row.roles) ? row.roles.map(String) : []])
  );
  const allowed = hasSystemMessageContextPermissions(eventKey, access.role, configured);
  if (!allowed) throw new WhatsAppSystemMessageAccessError(403);

  return { trustedCompanyId: access.companyId };
}
