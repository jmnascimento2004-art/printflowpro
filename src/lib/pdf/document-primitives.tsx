import React from 'react';
import { Image as PdfImage, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OrderPdfData } from './pdf-data';
import { buildVisibleCompanyAddress, getPdfLogoUrl, getPdfFooterText, buildCustomerAddress, formatPdfCurrency, formatPdfUnitCurrency } from './pdf-formatters';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import { documentDate, documentItem, ORDER_STATUS_LABELS } from '@/lib/order-document-model';
import { resolveBranding } from '@/lib/branding/resolveBranding';

export const documentStyles = StyleSheet.create({
  page: { paddingTop: 128, paddingBottom: 48, paddingHorizontal: 36, fontFamily: 'Helvetica', fontSize: 9, color: '#1e293b', },
  header: { position: 'absolute', top: 30, left: 36, right: 36, height: 82, borderBottomWidth: 1, borderColor: '#cbd5e1', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 10 },
  identity: { width: '59%', paddingRight: 16 }, logo: { width: 115, height: 30, objectFit: 'contain', objectPosition: 'left', marginBottom: 3 },
  title: { fontSize: 17, fontWeight: 700 }, heading: { fontSize: 10, fontWeight: 700, marginBottom: 6, marginTop: 12 },
  muted: { color: '#64748b', fontSize: 8 }, box: { borderWidth: 1, borderColor: '#e2e8f0', padding: 10, borderRadius: 4, marginBottom: 12 },
  row: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: '#e2e8f0', paddingVertical: 8 },
  tableHead: { flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 7, fontSize: 7, fontWeight: 700, color: '#475569' },
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderColor: '#cbd5e1', paddingTop: 6, fontSize: 7, color: '#64748b', height: 20 },
  signature: { marginTop: 34, paddingTop: 6, borderTopWidth: 0.5, borderColor: '#94a3b8', width: '70%', alignSelf: 'center', textAlign: 'center', fontSize: 8, color: '#64748b' }
});

export function DocumentHeader({ data, title }: { data: OrderPdfData; title: string }) {
  const s = documentStyles;
  const logo = getPdfLogoUrl(data.company);
  const color = resolveBranding(data.company).themeColor;
  return <View style={{ ...s.header, borderBottomColor: /^#[0-9a-f]{6}$/i.test(color) ? color : '#cbd5e1' }} fixed><View style={s.identity}>
    {logo && <PdfImage src={logo} style={s.logo} />}<Text style={{ fontWeight: 700, fontSize: 10 }}>{data.company.name}</Text>
    <Text style={s.muted}>{[data.company.document, data.company.phone, data.company.email].filter(Boolean).join(' · ')}</Text>
    {buildVisibleCompanyAddress(data.company, data.settings) && <Text style={s.muted}>{buildVisibleCompanyAddress(data.company, data.settings)}</Text>}
    </View><View style={{ width: '41%', alignItems: 'flex-end' }}><Text style={{ ...s.title, fontSize: title.length > 15 ? 12 : 17 }}>{title}</Text><Text style={{ fontWeight: 700, fontSize: 12, }}>{formatOrderDisplayNumber(data.order.number)}</Text><Text style={s.muted}>Emissão: {documentDate(data.order.created_at)}</Text><Text style={s.muted}>Pedido: {ORDER_STATUS_LABELS[data.order.status] || data.order.status}</Text></View></View>;
}

export function CustomerBlock({ data }: { data: OrderPdfData }) {
  const address = buildCustomerAddress(data.customer, data.order.delivery_type !== 'retirada' ? data.order.delivery_address : undefined);
  return <View style={documentStyles.box} wrap={false}><Text style={documentStyles.muted}>CLIENTE</Text><Text style={{ fontWeight: 700, fontSize: 11 }}>{data.customer?.name || data.order.customer_name}</Text>
    {data.customer?.document && <Text>{data.customer.document}</Text>}
    {[data.customer?.phone, data.customer?.email].filter(Boolean).length > 0 && <Text>{[data.customer?.phone, data.customer?.email].filter(Boolean).join(' · ')}</Text>}
    {address && <Text style={documentStyles.muted}>{address}</Text>}</View>;
}

export function DocumentItemsTable({ data, commercial = false, internal = false }: { data: OrderPdfData; commercial?: boolean; internal?: boolean }) {
  const widths = commercial ? ['5%', '42%', '9%', '20%', '24%'] : ['6%', '79%', '15%'];
  const labels = commercial ? ['#', 'DESCRIÇÃO / CONFIGURAÇÃO', 'QTD', 'UNITÁRIO', 'TOTAL'] : ['#', 'PRODUTO / CONFIGURAÇÃO', 'QTD'];
  return <><View style={documentStyles.tableHead} fixed>{labels.map((label, i) => <Text key={label} style={{ width: widths[i], paddingHorizontal: 5, textAlign: i > 1 ? 'right' : 'left' }}>{label}</Text>)}</View>
    {data.order.items.map((item, index) => { const row = documentItem(item);
      return <View key={item.id || `item-${index}`} style={documentStyles.row} wrap={row.name.length + row.configuration.length + (internal ? (item.details?.notes?.length || 0) : 0) > 600}><Text style={{ width: widths[0], paddingHorizontal: 5, color: '#64748b' }}>{index + 1}</Text>
        <View style={{ width: widths[1], paddingHorizontal: 5 }}><Text style={{ fontWeight: 700 }}>{row.name}</Text>{row.measures && <Text style={documentStyles.muted}>{row.measures}</Text>}{row.configuration && <Text style={documentStyles.muted}>{row.configuration}</Text>}{internal && item.details?.notes && <Text style={documentStyles.muted}>Obs. técnica: {item.details.notes}</Text>}</View>
        <Text style={{ width: widths[2], paddingHorizontal: 5, textAlign: 'right' }}>{row.quantity.toLocaleString('pt-BR')}</Text>
        {commercial && <><Text style={{ width: widths[3], paddingHorizontal: 5, textAlign: 'right' }}>{formatPdfUnitCurrency(row.unit)}</Text><Text style={{ width: widths[4], paddingHorizontal: 5, textAlign: 'right', fontWeight: 700 }}>{formatPdfCurrency(row.total)}</Text></>}
      </View>; })}</>;
}

export function SignatureBlock({ label = 'Recebido por / assinatura' }: { label?: string }) {
  return <View style={documentStyles.signature} wrap={false}><Text>{label}</Text><Text>Nome legível: ____________________________________</Text><Text>Documento: __________________  Data/hora: ____/____/______  ____:____</Text></View>;
}

export function DocumentFooter({ data }: { data: OrderPdfData }) {
  return <><View style={documentStyles.footer} fixed><Text>{getPdfFooterText(data.company)}</Text></View><Text fixed style={{ position: 'absolute', bottom: 20, right: 36, width: 50, height: 14, fontSize: 7, textAlign: 'right', color: '#64748b' }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></>;
}
