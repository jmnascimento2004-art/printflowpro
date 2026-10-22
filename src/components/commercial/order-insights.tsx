'use client';

import type { Order, ProductionItem, Shipment } from '@/lib/dummy-data';
import { documentDate, documentItem } from '@/lib/order-document-model';
import { resolveOrderDeliveryTime } from '@/lib/order-delivery-time.mjs';

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function OrderProductionSummary({ order, production, shipments, canProduction, canShipment }: { order: Order; production: ProductionItem[]; shipments: Shipment[]; canProduction: boolean; canShipment: boolean }) {
  const rows = production.filter(row => row.company_id === order.company_id && row.order_id === order.id);
  const deliveries = shipments.filter(row => row.company_id === order.company_id && row.order_id === order.id);
  const events = [{ label: 'Pedido criado', date: order.created_at }];
  if (canProduction) rows.forEach(row => { events.push({ label: `Produção iniciada · ${row.product_name}`, date: row.started_at || '' }); events.push({ label: `Produção concluída · ${row.product_name}`, date: row.finished_at || '' }); });
  if (canShipment) deliveries.forEach(row => { events.push({ label: 'Expedição registrada', date: row.shipped_at || '' }); events.push({ label: 'Entrega registrada', date: row.delivered_at || '' }); });
  const recorded = events.filter(event => event.date).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return <section className="space-y-4 text-sm" aria-label="Produção e linha do tempo">
    <div className="rounded-xl border border-border p-4"><h4 className="font-bold">Linha do tempo</h4><p className="mt-1 text-xs text-muted-foreground">Pedido, Produção e Expedição mantêm ciclos independentes.</p>
      <ol className="mt-4 space-y-3 border-l-2 border-primary/25 pl-4">{recorded.map((event, index) => <li key={`${event.label}-${index}`}><p className="font-semibold">{event.label}</p><time className="text-xs text-muted-foreground">{documentDate(event.date)} · {new Date(event.date).toLocaleTimeString('pt-BR', { timeZone: 'America/Bahia', hour: '2-digit', minute: '2-digit' })}</time></li>)}</ol>
      {canProduction && !rows.some(row => row.started_at) && <p className="mt-3 text-xs text-muted-foreground">Início de produção: pendente de registro.</p>}
      {canShipment && !deliveries.some(row => row.delivered_at) && <p className="mt-2 text-xs text-muted-foreground">Entrega: pendente de registro.</p>}
    </div>
    {canProduction ? <div className="rounded-xl border border-border p-4"><h4 className="font-bold">Produção</h4><p className="mt-1 text-xs text-muted-foreground">Previsão comercial dos itens: {resolveOrderDeliveryTime(order.items).label}</p>
      {rows.length ? <ul className="mt-3 divide-y divide-border">{rows.map(row => <li key={row.id} className="py-3"><p className="font-semibold">{row.product_name}</p><p className="mt-1 text-xs">Fase: {row.status} {row.responsible_name && `· ${row.responsible_name}`}</p>{row.started_at && row.finished_at && <p className="mt-1 text-xs text-muted-foreground">Tempo corrido registrado: {Math.max(0, Math.round((new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 60000))} min</p>}</li>)}</ul> : <p className="mt-3 text-xs text-muted-foreground">Nenhum apontamento registrado. Tempo útil não disponível.</p>}
      <a href="/production" className="mt-3 inline-flex text-xs font-bold text-primary">Abrir Fila de Produção →</a>
    </div> : <p className="text-xs text-muted-foreground">Apontamentos de produção exigem acesso ao módulo Produção.</p>}
    {canShipment && <div className="rounded-xl border border-border p-4"><h4 className="font-bold">Expedição</h4>{deliveries.length ? deliveries.map(row => <p key={row.id} className="mt-2 text-xs">{row.status} {row.carrier && `· ${row.carrier}`} {row.tracking_code && `· ${row.tracking_code}`}</p>) : <p className="mt-2 text-xs text-muted-foreground">Nenhuma expedição registrada.</p>}<a href="/shipment" className="mt-3 inline-flex text-xs font-bold text-primary">Abrir Expedição →</a></div>}
  </section>;
}

export function OrderAnalysis({ order, paid }: { order: Order; paid: number }) {
  const percent = order.total_amount > 0 ? Math.min(100, Math.max(0, paid / order.total_amount * 100)) : 0;
  return <section className="space-y-4 text-sm" aria-label="Análise do pedido">
    <dl className="grid grid-cols-2 gap-4 rounded-xl border border-border p-4 sm:grid-cols-4">{[['Vendido', money(order.total_amount)], ['Recebido', money(paid)], ['Custo', 'Custo incompleto'], ['Margem / contribuição', 'Indisponível']].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>)}</dl>
    <div className="rounded-xl border border-border p-4"><p className="mb-2 font-bold">{percent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% recebido</p><progress className="h-2 w-full accent-primary" max={100} value={percent} aria-label="Percentual recebido" /></div>
    <p className="text-xs text-muted-foreground">Os itens não possuem snapshot completo de custo histórico. Custos atuais do cadastro não são usados para estimar margem deste pedido.</p>
    <div className="overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="bg-secondary"><tr>{['Item', 'Vendido', 'Custo', 'Margem'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{order.items.map(item => <tr key={item.id} className="border-t border-border"><td className="p-3">{documentItem(item).name}</td><td className="p-3 whitespace-nowrap">{money(item.total_price)}</td><td className="p-3">Custo incompleto{item.outsourced && Number(item.outsourced_cost) > 0 && <span className="mt-1 block text-muted-foreground">Terceirização registrada: {money(Number(item.outsourced_cost))}</span>}</td><td className="p-3">Indisponível</td></tr>)}</tbody></table></div>
  </section>;
}
