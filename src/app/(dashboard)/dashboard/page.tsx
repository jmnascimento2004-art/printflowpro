'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Settings2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useCommercialIntelligence } from '@/components/commercial/use-commercial-intelligence';
import type { CommercialOverview } from '@/lib/commercial-intelligence';
import { formatCurrency } from '@/lib/pricing';
import { formatOrderDisplayNumber } from '@/lib/order-number';

const shortcuts = [
  { id: 'quote', label: 'Novo Orçamento', path: '/quotes', href: '/quotes?new=1' },
  { id: 'assistant', label: 'Assistente de Orçamentos', path: '/quotes', href: '/quotes?assistant=1' },
  { id: 'product', label: 'Cadastrar Produto', path: '/products', href: '/products?new=1' },
  { id: 'receive', label: 'Registrar Recebimento', path: '/financial', href: '/financial' },
  { id: 'customer', label: 'Novo Cliente', path: '/crm', href: '/crm?new=1' },
  { id: 'pos', label: 'Abrir PDV', path: '/pos', href: '/pos' },
  { id: 'pricing', label: 'Precificação', path: '/pricing', href: '/pricing' }
];
const defaults = ['quote', 'product', 'receive', 'customer', 'pos'];
type OverviewResponse = { overview: CommercialOverview; permissions: Record<string, boolean> };
export default function DashboardPage() {
  const [period, setPeriod] = useState('7');
  const { data, error, refresh } = useCommercialIntelligence<OverviewResponse>('dashboard', period);
  const { activeProfile, user } = useAuth();
  const preferenceKey = `printflow:quick-actions:v1:${activeProfile.company_id}:${user?.id}`;
  const [preferences, setPreferences] = useState<{ key: string; ids: string[] }>({ key: '', ids: defaults });
  const [customizing, setCustomizing] = useState(false);
  useEffect(() => {
    try { const stored = JSON.parse(localStorage.getItem(preferenceKey) || 'null'); setPreferences({ key: preferenceKey, ids: Array.isArray(stored) ? stored.filter(id => shortcuts.some(action => action.id === id)) : defaults }); }
    catch { setPreferences({ key: preferenceKey, ids: defaults }); }
  }, [preferenceKey]);
  const selected = preferences.key === preferenceKey ? preferences.ids : defaults;
  const toggle = (id: string) => {
    const ids = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id];
    setPreferences({ key: preferenceKey, ids });
    try { localStorage.setItem(preferenceKey, JSON.stringify(ids)); } catch { /* preference remains usable for this session */ }
  };
  const overview = data?.overview, allowed = data?.permissions || {};
  const available = shortcuts.filter(action => allowed[action.path] && (action.id !== 'assistant' || allowed['/products']));
  const chartMax = Math.max(1, ...(overview?.chart || []).flatMap(row => [row.income, row.expense]));
  const cards = overview ? [
    { title: 'Entradas do dia', value: formatCurrency(overview.incomeToday || 0), path: '/financial', hint: 'Recebimentos efetivos' },
    { title: 'A receber', value: formatCurrency(overview.receivable || 0), path: '/financial', hint: 'Saldo dos pedidos ativos' },
    { title: 'Pedidos do dia', value: String(overview.ordersToday), path: '/orders', hint: 'Exclui cancelados' },
    { title: 'Em produção', value: String(overview.productionCount), path: '/production', hint: 'Itens ativos na fila' },
    { title: 'Pedidos em atraso', value: String(overview.delayedCount), path: '/orders', hint: 'Prazo vencido, ainda em operação' }
  ].filter(card => allowed[card.path]) : [];
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5">
      <div><h1 className="text-2xl font-bold">Visão comercial</h1><p className="mt-1 text-sm text-muted-foreground">Recebimentos, pedidos e oportunidades da sua empresa.</p><p className="mt-1 text-xs text-muted-foreground">Datas no fuso America/Bahia. Valores recebidos são diferentes de vendas.</p></div>
      <button onClick={refresh} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Atualizar</button>
    </header>
    {error && <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800">{error}</div>}
    {!data && !error && <p role="status">Consultando indicadores…</p>}
    {data && <>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(card => <Link key={card.title} href={card.path} className="rounded-2xl border border-border bg-card p-5 shadow-sm"><p className="text-xs font-semibold text-muted-foreground">{card.title}</p><p className="mt-3 text-2xl font-bold">{card.value}</p><p className="mt-2 text-xs text-muted-foreground">{card.hint}</p></Link>)}</section>
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Ações rápidas</h2><button onClick={() => setCustomizing(value => !value)} className="flex items-center gap-1 text-sm text-primary"><Settings2 className="h-4 w-4" /> Personalizar</button></div>
        {customizing && <fieldset className="mt-3 flex flex-wrap gap-4"><legend className="mb-2 text-xs text-muted-foreground">Preferência pessoal neste navegador</legend>{available.map(action => <label key={action.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(action.id)} onChange={() => toggle(action.id)} />{action.label}</label>)}</fieldset>}
        <div className="mt-4 flex flex-wrap gap-2">{available.filter(action => selected.includes(action.id)).map(action => <Link className="inline-flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 text-sm font-semibold text-primary" key={action.id} href={action.href}>{action.label}<ArrowUpRight className="h-4 w-4" /></Link>)}</div>
      </section>
      {overview && <>
        {allowed['/financial'] && <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">Recebimentos e despesas pagas</h2><p className="text-xs text-muted-foreground">Mês recebido: {formatCurrency(overview.incomeMonth)} · A pagar: {formatCurrency(overview.payable)}</p></div><select aria-label="Período do gráfico" value={period} onChange={event => setPeriod(event.target.value)} className="rounded-lg border border-border bg-background px-3 py-2">{[7, 30, 90].map(days => <option key={days} value={days}>{days} dias</option>)}</select></div>
          <div className="mt-5 flex h-40 items-end gap-1" role="img" aria-label={`Recebimentos e despesas dos últimos ${period} dias. Detalhamento na tabela abaixo.`}>{overview.chart.map(row => <div key={row.date} title={`${row.date}: entradas ${formatCurrency(row.income)}; saídas ${formatCurrency(row.expense)}`} className="flex h-full min-w-0 flex-1 items-end gap-px"><div className="min-h-px flex-1 rounded-t bg-emerald-500" style={{ height: `${row.income / chartMax * 100}%` }} /><div className="min-h-px flex-1 rounded-t bg-rose-400" style={{ height: `${row.expense / chartMax * 100}%` }} /></div>)}</div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{overview.chart[0]?.date}</span><span>Verde: recebido · Rosa: pago</span><span>{overview.today}</span></div>
          <details className="mt-4 text-sm"><summary className="cursor-pointer">Ver valores por dia</summary><div className="max-h-56 overflow-auto"><table className="mt-2 w-full text-left"><thead><tr><th>Data</th><th>Recebido</th><th>Pago</th></tr></thead><tbody>{overview.chart.map(row => <tr key={row.date}><td>{row.date}</td><td>{formatCurrency(row.income)}</td><td>{formatCurrency(row.expense)}</td></tr>)}</tbody></table></div></details>
        </section>}
        <div className="grid gap-5 xl:grid-cols-3">
          {allowed['/orders'] && <section className="rounded-2xl border border-border bg-card p-5 xl:col-span-2"><h2 className="mb-4 font-bold">Últimos pedidos</h2><div className="grid gap-3 sm:grid-cols-2">{overview.recentOrders.map(order => <Link key={order.id} href={`/orders?orderId=${encodeURIComponent(order.id)}`} className="rounded-xl border border-border p-3 text-sm"><div className="flex justify-between gap-2 font-bold"><span>{formatOrderDisplayNumber(order.number)}</span><span>{formatCurrency(order.total_amount)}</span></div><p className="mt-2 truncate">{order.customer_name}</p><p className="mt-2 text-xs text-muted-foreground">Financeiro: {order.payment_status} · Operação: {order.status}</p></Link>)}</div>{!overview.recentOrders.length && <p className="text-sm text-muted-foreground">Nenhum pedido cadastrado.</p>}</section>}
          <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-3 font-bold">Atenção comercial</h2><div className="space-y-3 text-sm">{allowed['/quotes'] && <Link className="block" href="/quotes">{overview.pendingQuotes} orçamento(s) aguardando resposta</Link>}{allowed['/financial'] && <Link className="block" href="/financial">{overview.overdueReceivables} pedido(s) com recebível vencido</Link>}{allowed['/orders'] && <Link className="block" href="/orders">{overview.delayedCount} pedido(s) em atraso</Link>}{overview.catalogLeads.map(lead => <Link className="block rounded-lg bg-amber-500/10 p-2" key={lead.id} href="/quotes">Catálogo: {lead.name} · #{lead.number}</Link>)}</div></section>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {overview.catalogCustomers.length > 0 && <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Novos contatos do catálogo</h2><p className="text-xs text-muted-foreground">Cadastros ainda sem orçamento ou pedido.</p>{overview.catalogCustomers.map(customer => <Link key={customer.id} href="/crm" className="mt-3 block text-sm text-primary">{customer.name}</Link>)}</section>}
          {allowed['/crm'] && <section className="rounded-2xl border border-border bg-card p-5"><div className="flex justify-between gap-3"><h2 className="font-bold">Clientes recentes</h2><Link href="/crm?view=ranking" className="text-sm text-primary">Ver ranking</Link></div>{overview.recentCustomers.map(customer => <Link key={customer.id} href="/crm" className="mt-3 block border-t border-border pt-3 text-sm">{customer.name}<span className="ml-2 text-xs text-muted-foreground">{customer.tags.join(' · ')}</span></Link>)}</section>}
          {allowed['/orders'] && <section className="rounded-2xl border border-border bg-card p-5"><h2 className="font-bold">Produtos vendidos no período</h2><p className="text-xs text-muted-foreground">Valor bruto dos itens em pedidos ativos; não representa caixa recebido.</p>{overview.bestsellers.map(product => <p key={product.id} className="mt-3 flex justify-between gap-3 border-t border-border pt-3 text-sm"><span>{product.name} · {product.quantity} un</span><strong>{formatCurrency(product.total)}</strong></p>)}{!overview.bestsellers.length && <p className="mt-3 text-sm text-muted-foreground">Sem vendas neste período.</p>}</section>}
        </div>
      </>}
    </>}
  </div>;
}
