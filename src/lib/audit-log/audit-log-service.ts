import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type AuditLogEntry = {
  id: string;
  company_id: string;
  actor_user_id: string;
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
  actorUserId?: string;
  module?: string;
  action?: string;
};

const AUDIT_COLUMNS = [
  'id', 'company_id', 'actor_user_id', 'actor_profile_id', 'actor_name', 'actor_role',
  'action', 'entity_type', 'entity_id', 'module', 'old_values', 'new_values', 'metadata', 'created_at'
].join(',');

export async function listAuditLogs(
  companyId: string,
  filters: AuditLogFilters = {},
  client: SupabaseClient = supabase
): Promise<AuditLogEntry[]> {
  const trustedCompanyId = String(companyId || '').trim();
  if (!trustedCompanyId) return [];

  let query = client
    .from('audit_logs')
    .select(AUDIT_COLUMNS)
    .eq('company_id', trustedCompanyId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(200);

  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);
  if (filters.actorUserId) query = query.eq('actor_user_id', filters.actorUserId);
  if (filters.module) query = query.eq('module', filters.module);
  if (filters.action) query = query.eq('action', filters.action);

  const { data, error } = await query;
  if (error) throw new Error('Não foi possível carregar os registros de auditoria.');
  return (data || []) as unknown as AuditLogEntry[];
}

export function describeAuditChange(entry: AuditLogEntry) {
  if (entry.action === 'production.stage_changed') {
    const before = String(entry.old_values.status || 'não informado');
    const after = String(entry.new_values.status || 'não informado');
    return `Fase de produção alterada de ${before} para ${after}.`;
  }
  return `${entry.action} em ${entry.entity_type}.`;
}
