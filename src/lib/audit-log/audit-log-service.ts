import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type AuditLogEntry = {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  actor_profile_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  module: string;
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type AuditLogFilters = {
  from?: string;
  to?: string;
  actorName?: string;
  module?: string;
  action?: string;
  entityId?: string;
};

export type AuditLogPage = {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

const AUDIT_COLUMNS = [
  'id', 'company_id', 'actor_user_id', 'actor_profile_id', 'actor_name', 'actor_role',
  'action', 'entity_type', 'entity_id', 'module', 'old_values', 'new_values', 'metadata', 'created_at'
].join(',');

export async function listAuditLogs(
  companyId: string,
  filters: AuditLogFilters = {},
  page = 1,
  pageSize = 25,
  client: SupabaseClient = supabase
): Promise<AuditLogPage> {
  const trustedCompanyId = String(companyId || '').trim();
  const trustedPage = Math.max(1, Math.trunc(page));
  const trustedPageSize = Math.min(100, Math.max(10, Math.trunc(pageSize)));
  if (!trustedCompanyId) {
    return { entries: [], total: 0, page: trustedPage, pageSize: trustedPageSize, hasMore: false };
  }

  const offset = (trustedPage - 1) * trustedPageSize;

  let query = client
    .from('audit_logs')
    .select(AUDIT_COLUMNS, { count: 'exact' })
    .eq('company_id', trustedCompanyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + trustedPageSize - 1);

  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (filters.actorName) query = query.ilike('actor_name', `%${filters.actorName.slice(0, 120)}%`);
  if (filters.module) query = query.eq('module', filters.module);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.entityId) query = query.ilike('entity_id', `%${filters.entityId.slice(0, 200)}%`);

  const { data, error, count } = await query;
  if (error) throw new Error('Não foi possível carregar os registros de auditoria.');
  const total = count || 0;
  return {
    entries: (data || []) as unknown as AuditLogEntry[],
    total,
    page: trustedPage,
    pageSize: trustedPageSize,
    hasMore: offset + trustedPageSize < total
  };
}
