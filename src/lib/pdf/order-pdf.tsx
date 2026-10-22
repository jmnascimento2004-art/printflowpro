import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { OrderPdfData } from './pdf-data';
import { DocumentHeader, CustomerBlock, DocumentItemsTable, DocumentFooter, SignatureBlock, documentStyles as s } from './document-primitives';
import { formatPdfCurrency } from './pdf-formatters';
import { commercialSummary, documentDate } from '@/lib/order-document-model';
import { resolveOrderDeliveryTime } from '@/lib/order-delivery-time.mjs';

export function OrderPdfDocument({ data, signature = false }: { data: OrderPdfData; signature?: boolean }) {
  const totals = commercialSummary(data.order);
  const paid = Number(data.order.paid_amount || 0);
  const deliveryTime = resolveOrderDeliveryTime(data.order.items);
  const lines: Array<[string, number]> = [['Subtotal dos itens', totals.items]];
  if (totals.services) lines.push(['Serviços adicionais', totals.services]);
  if (totals.discount) lines.push(['Desconto', -totals.discount]);
  if (totals.freight) lines.push(['Frete', totals.freight]);
  if (totals.adjustment) lines.push(['Ajuste comercial registrado', totals.adjustment]);
  return <Document title={`Pedido ${data.order.number}`} author={data.company.name}><Page size="A4" style={s.page}>
    <DocumentHeader data={data} title="PEDIDO" /><CustomerBlock data={data} /><DocumentItemsTable data={data} commercial />
    {(data.order.additional_services || []).length > 0 && <View><Text style={s.heading}>Serviços adicionais</Text>{data.order.additional_services!.map(service => <View key={service.id} style={s.row} wrap={false}><Text style={{ flex: 1 }}>{service.name} · {service.quantity.toLocaleString('pt-BR')} un.</Text><Text>{formatPdfCurrency(service.total_price)}</Text></View>)}</View>}
    <View style={{ marginLeft: 'auto', width: 245, marginTop: 16 }} wrap={false}>
      {lines.map(([label, value]) => <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}><Text style={s.muted}>{label}</Text><Text>{formatPdfCurrency(value)}</Text></View>)}
      <View style={{ ...s.row, backgroundColor: '#f1f5f9', padding: 10, marginTop: 4 }}><Text style={{ flex: 1, fontWeight: 700 }}>TOTAL DO PEDIDO</Text><Text style={{ fontWeight: 700, fontSize: 13 }}>{formatPdfCurrency(totals.total)}</Text></View>
      {paid > 0 && <><View style={s.row}><Text style={{ flex: 1 }}>Total pago</Text><Text>{formatPdfCurrency(paid)}</Text></View><View style={s.row}><Text style={{ flex: 1 }}>Saldo</Text><Text>{formatPdfCurrency(Math.max(0, totals.total - paid))}</Text></View></>}
    </View>
    <View style={{ marginTop: 16 }} wrap={false}><Text style={s.heading}>Entrega e pagamento</Text>
      {data.order.deadline && <Text>Prazo: {documentDate(data.order.deadline)}</Text>}
      {deliveryTime.isComplete && <Text>Prazo de entrega: {deliveryTime.label}</Text>}
      {data.order.delivery_type && <Text>{data.order.delivery_type === 'retirada' ? 'Retirada na empresa' : `Entrega: ${data.order.delivery_type}`}</Text>}
      {data.order.delivery_type !== 'retirada' && data.order.delivery_address && <Text>{data.order.delivery_address}</Text>}
      <Text>{paid >= totals.total && paid > 0 ? 'Pagamento confirmado' : paid > 0 ? 'Pagamento parcial' : 'Pagamento pendente'}</Text>
      {data.invoicedTransaction?.due_date && <Text>Vencimento do faturamento: {documentDate(data.invoicedTransaction.due_date)}</Text>}
    </View>
    {signature && <SignatureBlock label="Ciência do cliente (opcional)" />}<DocumentFooter data={data} />
  </Page></Document>;
}
