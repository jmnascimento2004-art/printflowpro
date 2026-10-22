import { canAccessModule } from '@/lib/module-permissions';
import type { PdfRequestContext } from './pdf-server-auth';
import { PdfAccessError } from './pdf-access.mjs';

export async function requireDocumentPermissions(context: PdfRequestContext, paths = ['/orders']) {
  const { data, error } = await context.supabase.from('role_permissions').select('path,roles').eq('company_id', context.access.companyId);
  if (error) throw error;
  const configured: Record<string, string[]> = Object.fromEntries((data || []).map(row => [row.path, row.roles]));
  if (!paths.every(path => canAccessModule(context.access.role, path, configured))) throw new PdfAccessError(403, 'Acesso negado ao documento.');
}
