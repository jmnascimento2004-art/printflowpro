'use client';
import { useState } from 'react';
import { useCommercialIntelligence } from './use-commercial-intelligence';
import type { CustomerRanking as RankingRows } from '@/lib/commercial-intelligence';
import { formatCurrency } from '@/lib/pricing';

export function CustomerRanking({ onBack, onCustomer }: { onBack: () => void; onCustomer: (id: string) => void }) {
  const [period, setPeriod] = useState('30');
  const [type, setType] = useState('all'), [b2b, setB2b] = useState('all'), [tag, setTag] = useState(''), [activity, setActivity] = useState('all');
  const { data, error, refresh } = useCommercialIntelligence<{ ranking: RankingRows }>('ranking', period);
  const rows = (data?.ranking || []).filter(row => (type === 'all' || row.personType === type) && (b2b === 'all' || row.b2b === (b2b === 'yes')) && (!tag || row.tags.includes(tag)) && (activity === 'all' || (activity === 'purchased' ? row.count > 0 : row.count === 0)));
  const tags = [...new Set((data?.ranking || []).flatMap(row => row.tags))].sort();
  const selectClass = 'rounded-lg border border-border bg-background px-3 py-2 text-sm';
  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Ranking de clientes</h1><p className="text-sm text-muted-foreground">Compras por cadastro, excluindo pedidos cancelados. Total vendido não é valor recebido.</p></div><button onClick={onBack} className={selectClass}>Voltar aos clientes</button></header>
    <div className="flex flex-wrap gap-3">
      <select aria-label="Período do ranking" className={selectClass} value={period} onChange={event => setPeriod(event.target.value)}><option value="30">30 dias</option><option value="90">90 dias</option><option value="year">Ano atual</option><option value="all">Todo histórico</option></select>
      <select aria-label="Tipo de pessoa" className={selectClass} value={type} onChange={event => setType(event.target.value)}><option value="all">PF e PJ</option><option value="fisica">Pessoa física</option><option value="juridica">Pessoa jurídica</option></select>
      <select aria-label="Faturamento B2B" className={selectClass} value={b2b} onChange={event => setB2b(event.target.value)}><option value="all">Todos os clientes</option><option value="yes">B2B faturado</option><option value="no">Pagamento imediato</option></select>
      <select aria-label="Tag do ranking" className={selectClass} value={tag} onChange={event => setTag(event.target.value)}><option value="">Todas as tags</option>{tags.map(value => <option key={value}>{value}</option>)}</select>
      <select aria-label="Atividade no período" className={selectClass} value={activity} onChange={event => setActivity(event.target.value)}><option value="all">Com e sem compras</option><option value="purchased">Com compras no período</option><option value="none">Sem compras no período</option></select>
      <button onClick={refresh} className={selectClass}>Atualizar</button>
    </div>
    {error && <p role="alert" className="text-rose-600">{error}</p>}{!data && !error && <p role="status">Consultando ranking…</p>}
    {data && <div className="overflow-x-auto rounded-2xl border border-border bg-card"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-secondary"><tr>{['Posição', 'Cliente', 'Total comprado', 'Pedidos', 'Ticket médio', 'Última compra'].map(title => <th className="p-3" key={title}>{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t border-border"><td className="p-3">{row.position}</td><td className="p-3"><button className="font-semibold text-primary" onClick={() => onCustomer(row.id)}>{row.name}</button><p className="text-xs text-muted-foreground">{row.tags.join(' · ')}{row.blocked ? ' · Crédito bloqueado' : ''}</p></td><td className="p-3">{formatCurrency(row.total)}</td><td className="p-3">{row.count}</td><td className="p-3">{formatCurrency(row.average)}</td><td className="p-3">{row.lastPurchase ? new Date(row.lastPurchase).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' }) : 'Sem compra'}</td></tr>)}</tbody></table>{!rows.length && <p className="p-6 text-muted-foreground">Nenhum cliente encontrado para estes filtros.</p>}</div>}
    <p className="text-xs text-muted-foreground">Empates: maior número de pedidos e, depois, identificador do cadastro. Posição no período antes dos filtros. Última compra dentro do período selecionado. O cadastro não possui estado ativo/inativo; atividade é indicada pelas compras no período.</p>
  </section>;
}
