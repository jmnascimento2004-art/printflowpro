'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileClock, Loader2, RefreshCw, Search } from 'lucide-react';
import {
  describeAuditChange,
  listAuditLogs,
  type AuditLogEntry,
  type AuditLogFilters
} from '@/lib/audit-log/audit-log-service';

type AuditLogPanelProps = {
  companyId: string;
};

const toDayBoundary = (value: string, endOfDay = false) => {
  if (!value) return undefined;
  return `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`;
};

const STATUS_LABELS: Record<string, string> = {
  fila: 'Aguardando',
  producao: 'Preparação',
  impressao: 'Produção',
  acabamento: 'Acabamento',
  concluido: 'Pronto',
  expedicao: 'Em rota de entrega',
  entregue: 'Entregue',
  finalizado: 'Finalizado'
};

function humanizeValue(value: unknown) {
  const normalized = String(value ?? 'não informado');
  return STATUS_LABELS[normalized] || normalized;
}

export function AuditLogPanel({ companyId }: AuditLogPanelProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actorUserId, setActorUserId] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters: AuditLogFilters = {
        from: toDayBoundary(from),
        to: toDayBoundary(to, true),
        actorUserId: actorUserId || undefined,
        module: module || undefined,
        action: action || undefined
      };
      setEntries(await listAuditLogs(companyId, filters));
    } catch (loadError) {
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os registros.');
    } finally {
      setLoading(false);
    }
  }, [action, actorUserId, companyId, from, module, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    entries.forEach((entry) => map.set(entry.actor_user_id, entry.actor_name));
    return [...map.entries()].sort((left, right) => left[1].localeCompare(right[1], 'pt-BR'));
  }, [entries]);

  return (
    <section className="animate-in space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm fade-in duration-200 sm:p-6" data-testid="audit-log-panel">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <FileClock className="h-5 w-5 text-primary" />
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide text-foreground">Logs de Auditoria</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Histórico imutável das operações críticas da empresa.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/50 px-4 text-xs font-bold text-foreground disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Filtros dos logs de auditoria">
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Data inicial
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground" />
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Data final
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground" />
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Usuário
          <select value={actorUserId} onChange={(event) => setActorUserId(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground">
            <option value="">Todos</option>
            {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Módulo
          <select value={module} onChange={(event) => setModule(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground">
            <option value="">Todos</option>
            <option value="production">Produção</option>
          </select>
        </label>
        <label className="space-y-1 text-[10px] font-bold uppercase text-muted-foreground">
          Ação
          <select value={action} onChange={(event) => setAction(event.target.value)} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-xs font-medium text-foreground">
            <option value="">Todas</option>
            <option value="production.stage_changed">Fase de produção alterada</option>
          </select>
        </label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-semibold text-rose-600">{error}</p>}

      {!loading && !error && entries.length === 0 ? (
        <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-center text-xs text-muted-foreground">
          <Search className="h-5 w-5" />
          Nenhum evento encontrado para os filtros selecionados.
        </div>
      ) : (
        <div className="space-y-2" aria-live="polite">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border border-border bg-background/60 p-4 text-xs" data-testid="audit-log-entry">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-bold text-foreground">{describeAuditChange(entry)}</p>
                  <p className="mt-1 text-muted-foreground">
                    {entry.actor_name} · {entry.actor_role} · {entry.module}
                  </p>
                </div>
                <time className="shrink-0 font-medium text-muted-foreground" dateTime={entry.created_at}>
                  {new Date(entry.created_at).toLocaleString('pt-BR')}
                </time>
              </div>
              <dl className="mt-3 grid gap-2 rounded-lg bg-secondary/40 p-3 sm:grid-cols-3">
                <div><dt className="font-bold uppercase text-muted-foreground">Antes</dt><dd className="mt-0.5 text-foreground">{humanizeValue(entry.old_values.status)}</dd></div>
                <div><dt className="font-bold uppercase text-muted-foreground">Depois</dt><dd className="mt-0.5 text-foreground">{humanizeValue(entry.new_values.status)}</dd></div>
                <div><dt className="font-bold uppercase text-muted-foreground">Pedido</dt><dd className="mt-0.5 text-foreground">{String(entry.metadata.order_number || 'não informado')}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
