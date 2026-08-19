'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Eye, FileClock, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { listAuditLogs, type AuditLogEntry, type AuditLogFilters } from '@/lib/audit-log/audit-log-service';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_MODULE_LABELS,
  auditEntityLabel,
  primaryAuditDelta
} from '@/lib/audit-log/audit-log-format';
import { supabase } from '@/lib/supabaseClient';

type AuditLogPanelProps = { companyId: string };
const PAGE_SIZE = 25;

const toDayBoundary = (value: string, endOfDay = false) => {
  if (!value) return undefined;
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`;
};

const prettyJson = (value: Record<string, unknown>) => JSON.stringify(value, null, 2);

export function AuditLogPanel({ companyId }: AuditLogPanelProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorName, setActorName] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const loadRequestRef = useRef(0);

  const filters = useMemo<AuditLogFilters>(() => ({
    from: toDayBoundary(from),
    to: toDayBoundary(to, true),
    actorName: actorName.trim() || undefined,
    module: module || undefined,
    action: action || undefined,
    entityId: entityId.trim() || undefined
  }), [action, actorName, entityId, from, module, to]);
  const [effectiveFilters, setEffectiveFilters] = useState(filters);

  useEffect(() => {
    // Invalidate an in-flight response as soon as the user changes a filter,
    // rather than only when the debounced replacement request starts.
    loadRequestRef.current += 1;
    setLoading(true);
    setEntries([]);
    setTotal(0);
    const timer = window.setTimeout(() => setEffectiveFilters(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setError('');
    try {
      const result = await listAuditLogs(companyId, effectiveFilters, page, PAGE_SIZE);
      if (requestId !== loadRequestRef.current) return;
      setEntries(result.entries);
      setTotal(result.total);
    } catch (loadError) {
      if (requestId !== loadRequestRef.current) return;
      setEntries([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os registros.');
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [companyId, effectiveFilters, page]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selected]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const actionOptions = useMemo(() => Object.entries(AUDIT_ACTION_LABELS)
    .sort((left, right) => left[1].localeCompare(right[1], 'pt-BR')), []);

  const exportCsv = async () => {
    setExporting(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Entre novamente para exportar.');
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
      const response = await fetch(`/api/audit-logs/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Não foi possível exportar os registros com os filtros atuais.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : 'Não foi possível exportar os registros.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="animate-in space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm fade-in duration-200 sm:p-6" data-testid="audit-log-panel">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FileClock className="h-5 w-5 text-primary" />
          <div><h2 className="text-sm font-black uppercase tracking-wide text-foreground">Logs de Auditoria</h2><p className="mt-0.5 text-xs text-muted-foreground">Histórico imutável e tenant-scoped das operações empresariais.</p></div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void exportCsv()} disabled={exporting || loading} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-bold text-foreground disabled:opacity-60">{exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Exportar CSV</button>
          <button type="button" onClick={() => void load()} disabled={loading} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 text-xs font-bold text-foreground disabled:opacity-60">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Filtros dos logs de auditoria">
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Data inicial<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground" /></label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Data final<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground" /></label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Usuário<input type="search" value={actorName} onChange={(event) => { setActorName(event.target.value); setPage(1); }} placeholder="Nome ou SYSTEM" className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium normal-case text-foreground" /></label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Módulo<select value={module} onChange={(event) => { setModule(event.target.value); setAction(''); setPage(1); }} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground"><option value="">Todos</option>{Object.entries(AUDIT_MODULE_LABELS).sort((left, right) => left[1].localeCompare(right[1], 'pt-BR')).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Ação<select value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground"><option value="">Todas</option>{actionOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">Identificador da entidade<input type="search" value={entityId} onChange={(event) => { setEntityId(event.target.value); setPage(1); }} placeholder="Pedido, produto ou ID" className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium normal-case text-foreground" /></label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-600">{error}</p>}

      {!loading && !error && entries.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground"><Search className="h-5 w-5" />Nenhum evento encontrado para os filtros selecionados.</div>
      ) : (
        <div className="space-y-2" aria-live="polite">
          {entries.map((entry) => {
            const delta = primaryAuditDelta(entry.old_values, entry.new_values);
            return <article key={entry.id} className="rounded-xl border border-border bg-background/60 p-4 text-xs" data-testid="audit-log-entry">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0"><p className="font-bold text-foreground">{AUDIT_ACTION_LABELS[entry.action] || entry.action}</p><p className="mt-1 truncate text-muted-foreground">{entry.actor_name} · {AUDIT_MODULE_LABELS[entry.module] || entry.module} · {auditEntityLabel(entry.entity_id, entry.old_values, entry.new_values)}</p>{delta.key && <p className="mt-2 font-medium text-foreground"><span className="text-muted-foreground">{delta.before}</span> → {delta.after}</p>}</div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end"><time className="font-medium text-muted-foreground" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('pt-BR')}</time><button type="button" onClick={() => setSelected(entry)} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3 font-bold text-foreground" aria-label={`Ver detalhes de ${AUDIT_ACTION_LABELS[entry.action] || entry.action}`}><Eye className="h-4 w-4" />Detalhes</button></div>
              </div>
            </article>;
          })}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-4 text-xs sm:flex-row sm:items-center sm:justify-between"><p className="text-muted-foreground">{total} evento{total === 1 ? '' : 's'} · página {page} de {pageCount}</p><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 font-bold disabled:opacity-50"><ChevronLeft className="h-4 w-4" />Anterior</button><button type="button" disabled={page >= pageCount || loading} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="flex min-h-11 items-center gap-1 rounded-lg border border-border px-3 font-bold disabled:opacity-50">Próxima<ChevronRight className="h-4 w-4" /></button></div></div>

      {selected && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between gap-4 border-b border-border pb-4"><div><h3 id="audit-detail-title" className="font-black text-foreground">{AUDIT_ACTION_LABELS[selected.action] || selected.action}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(selected.created_at).toLocaleString('pt-BR')} · {selected.actor_name} ({selected.actor_role})</p></div><button type="button" onClick={() => setSelected(null)} className="flex h-11 w-11 items-center justify-center rounded-lg border border-border" aria-label="Fechar detalhes"><X className="h-4 w-4" /></button></div><dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><dt className="font-bold text-muted-foreground">Módulo</dt><dd>{AUDIT_MODULE_LABELS[selected.module] || selected.module}</dd></div><div><dt className="font-bold text-muted-foreground">Entidade</dt><dd>{selected.entity_type} · {selected.entity_id}</dd></div></dl><div className="mt-4 grid gap-3 sm:grid-cols-2"><section className="rounded-xl bg-secondary/40 p-3"><h4 className="text-xs font-black uppercase text-muted-foreground">Antes</h4><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-foreground">{prettyJson(selected.old_values)}</pre></section><section className="rounded-xl bg-secondary/40 p-3"><h4 className="text-xs font-black uppercase text-muted-foreground">Depois</h4><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-foreground">{prettyJson(selected.new_values)}</pre></section></div><details className="mt-4 rounded-xl border border-border p-3"><summary className="cursor-pointer text-xs font-bold text-foreground">Contexto técnico</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted-foreground">{prettyJson(selected.metadata)}</pre></details></div></div>}
    </section>
  );
}
