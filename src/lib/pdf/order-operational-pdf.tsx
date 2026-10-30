import React from 'react';
import { Document, Page, Text, View } from '@react-pdf/renderer';
import type { OrderPdfData } from './pdf-data';
import { DocumentHeader, CustomerBlock, DocumentItemsTable, DocumentFooter, SignatureBlock, documentStyles as s } from './document-primitives';
import { documentDate } from '@/lib/order-document-model';
import { formatOrderDisplayNumber } from '@/lib/order-number';

export type OperationalDocumentKind = 'production' | 'label' | 'protocol';

export function OrderOperationalDocument({ data, kind, copies = 1 }: { data: OrderPdfData; kind: OperationalDocumentKind; copies?: 1 | 2 }) {
  if (kind === 'label') return <Document title={`Etiqueta ${data.order.number}`} author={data.company.name}>
    <Page size={{ width: 283.465, height: 141.732 }} style={{ padding: 10, fontFamily: 'Helvetica', fontSize: 9, color: '#0f172a' }}>
      <Text style={{ fontSize: 8, color: '#475569', maxLines: 1, textOverflow: 'ellipsis' }}>{data.company.name}</Text>
      <Text style={{ fontSize: 18, fontWeight: 700, marginVertical: 4, maxLines: 1, textOverflow: 'ellipsis' }}>{formatOrderDisplayNumber(data.order.number)}</Text>
      <Text style={{ fontWeight: 700, fontSize: 10, maxLines: 2, textOverflow: 'ellipsis' }}>{data.customer?.name || data.order.customer_name}</Text>
      {data.customer?.phone && <Text>{data.customer.phone}</Text>}
      {data.order.delivery_type && <Text style={{ marginTop: 4 }}>{data.order.delivery_type === 'retirada' ? 'Retirada na empresa' : data.order.delivery_type.toUpperCase()}</Text>}
      {data.order.delivery_type !== 'retirada' && data.order.delivery_address && <Text style={{ fontSize: 7, maxLines: 3, textOverflow: 'ellipsis' }}>{data.order.delivery_address}</Text>}
      {data.order.deadline && <Text style={{ fontSize: 8, marginTop: 4 }}>Data de entrega: {documentDate(data.order.deadline.slice(0, 10))}</Text>}
    </Page>
  </Document>;

  return <Document title={`${kind === 'production' ? 'Ordem de produção' : 'Protocolo de entrega'} ${data.order.number}`} author={data.company.name}>
    {Array.from({ length: kind === 'protocol' ? copies : 1 }, (_, index) => <Page key={index} size="A4" style={s.page}>
      <DocumentHeader data={data} title={kind === 'production' ? 'ORDEM DE PRODUÇÃO' : 'PROTOCOLO DE ENTREGA'} />
      {kind === 'protocol' && <Text style={{ ...s.muted, marginBottom: 8 }}>{copies === 2 ? index === 0 ? 'VIA EMPRESA' : 'VIA CLIENTE' : 'VIA ÚNICA'}</Text>}
      <CustomerBlock data={data} />
      {data.order.deadline && <Text style={{ marginBottom: 10 }}>Data de entrega: {documentDate(data.order.deadline.slice(0, 10))}</Text>}
      <DocumentItemsTable data={data} internal={kind === 'production'} />
      {kind === 'production' && <View>
        <Text style={s.heading}>Operação registrada</Text>
        {(data.production || []).map(row => <View style={s.box} key={row.id} wrap={false}><Text style={{ fontWeight: 700 }}>{row.product_name}</Text><Text>Fase: {row.status}{row.responsible_name ? ` · Responsável: ${row.responsible_name}` : ''}</Text>{row.started_at && <Text>Início: {documentDate(row.started_at)}</Text>}{row.finished_at && <Text>Conclusão: {documentDate(row.finished_at)}</Text>}</View>)}
        {(data.production || []).length === 0 && <Text style={s.muted}>Sem apontamentos de produção registrados.</Text>}
        {data.internalNotes && <View><Text style={s.heading}>Observações internas</Text><Text>{data.internalNotes}</Text></View>}
        <SignatureBlock label="Conferência de produção" />
      </View>}
      {kind === 'protocol' && <View wrap={false}>
        {data.order.delivery_address && <View style={{ marginTop: 12 }}><Text style={s.heading}>Destino</Text><Text>{data.order.delivery_address}</Text></View>}
        {(data.shipments || []).filter(shipment => shipment.delivered_at).map(shipment => <Text key={shipment.id}>Entrega registrada: {documentDate(shipment.delivered_at)}{shipment.carrier ? ` · Transporte: ${shipment.carrier}` : ''}</Text>)}
        <Text style={{ marginTop: 20 }}>Conferência e recebimento dos itens relacionados neste documento.</Text>
        <Text style={{ marginTop: 16 }}>Responsável pela entrega: _____________________________________</Text>
        <SignatureBlock />
      </View>}
      <DocumentFooter data={data} />
    </Page>)}
  </Document>;
}
