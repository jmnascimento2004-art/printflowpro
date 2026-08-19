import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { AUDIT_ACTION_LABELS, AUDIT_MODULE_LABELS } from '@/lib/audit-log/audit-log-format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPORT_COLUMNS = [
  'id', 'actor_name', 'actor_role', 'action', 'entity_type', 'entity_id', 'module',
  'old_values', 'new_values', 'metadata', 'created_at'
].join(',');

const csvCell = (value: unknown) => {
  const raw = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

function bearerToken(request: Request) {
  const value = request.headers.get('authorization') || '';
  return /^Bearer\s+\S+$/i.test(value) ? value.replace(/^Bearer\s+/i, '') : '';
}

function boundedParam(url: URL, name: string, length: number) {
  return (url.searchParams.get(name) || '').trim().slice(0, length);
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publishableKey) {
    return NextResponse.json({ error: 'Configuração indisponível.' }, { status: 500 });
  }

  const client = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false }
  });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = boundedParam(url, 'from', 40);
  const to = boundedParam(url, 'to', 40);
  const actorName = boundedParam(url, 'actorName', 120);
  const auditModule = boundedParam(url, 'module', 80);
  const action = boundedParam(url, 'action', 120);
  const entityId = boundedParam(url, 'entityId', 200);

  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 5000; offset += pageSize) {
    let query = client
      .from('audit_logs')
      .select(EXPORT_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);
    if (actorName) query = query.ilike('actor_name', `%${actorName}%`);
    if (auditModule) query = query.eq('module', auditModule);
    if (action) query = query.eq('action', action);
    if (entityId) query = query.ilike('entity_id', `%${entityId}%`);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
    rows.push(...((data || []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < pageSize) break;
  }

  const header = [
    'Data e hora', 'Usuário', 'Papel', 'Módulo', 'Ação', 'Entidade',
    'Identificador', 'Antes', 'Depois', 'Origem'
  ];
  const lines = rows.map((row) => [
    row.created_at,
    row.actor_name,
    row.actor_role,
    AUDIT_MODULE_LABELS[String(row.module)] || row.module,
    AUDIT_ACTION_LABELS[String(row.action)] || row.action,
    row.entity_type,
    row.entity_id,
    JSON.stringify(row.old_values || {}),
    JSON.stringify(row.new_values || {}),
    String((row.metadata as Record<string, unknown> | null)?.source || '')
  ].map(csvCell).join(','));
  const csv = `\uFEFF${header.map(csvCell).join(',')}\r\n${lines.join('\r\n')}`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Content-Type': 'text/csv; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
