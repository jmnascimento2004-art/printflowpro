import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { OrderPdfData } from '@/lib/pdf/pdf-data';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import { normalizeOrderOperationalStatus } from '@/lib/order-status';
import {
  buildVisibleCompanyAddress,
  buildCustomerAddress,
  formatPdfCurrency,
  formatPdfDate,
  getAdditionalServicesTotal,
  getPdfFooterText,
  getPdfLogoUrl,
  normalizePdfText
} from '@/lib/pdf/pdf-formatters';
import { PdfProductTable } from '@/lib/pdf/pdf-product-table.mjs';

const orderStatusLabels: Record<ReturnType<typeof normalizeOrderOperationalStatus>, string> = {
  orcamento: 'ORÇAMENTO',
  aguardando_aprovacao: 'AGUARDANDO',
  aguardando_pagamento: 'AGUARDANDO',
  producao: 'PRODUÇÃO',
  impressao: 'IMPRESSAO',
  acabamento: 'ACABAMENTO',
  expedicao: 'EXPEDIÇÃO',
  entregue: 'ENTREGUE',
  finalizado: 'FINALIZADO',
  cancelado: 'CANCELADO'
};

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#172033',
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#d8dee9',
    paddingBottom: 16,
    marginBottom: 16
  },
  logo: { width: 132, height: 48, objectFit: 'contain', marginBottom: 7 },
  companyName: { fontSize: 10.5, fontWeight: 700, marginBottom: 3, lineHeight: 1.2 },
  muted: { color: '#65728a', fontSize: 8, lineHeight: 1.25 },
  titleBlock: { width: 190, alignItems: 'flex-end' },
  title: { fontSize: 18, fontWeight: 700, color: '#101827' },
  meta: { marginTop: 6, lineHeight: 1.45 },
  boxRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  box: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d8dee9',
    borderRadius: 8,
    padding: 12
  },
  boxTitle: { fontSize: 8, fontWeight: 700, color: '#1d2bb8', textTransform: 'uppercase', marginBottom: 7 },
  label: { fontSize: 7, fontWeight: 700, color: '#7b879c', textTransform: 'uppercase' },
  value: { fontSize: 9, fontWeight: 500, marginTop: 2, marginBottom: 6 },
  table: { width: '100%', borderWidth: 1, borderColor: '#d8dee9', borderRadius: 6, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#050505', color: '#ffffff' },
  tableHeaderCell: { paddingVertical: 7, paddingHorizontal: 6, fontSize: 8, fontWeight: 700 },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e8edf5' },
  cell: { paddingVertical: 6, paddingHorizontal: 6, lineHeight: 1.2 },
  qtyCol: { width: '9%', textAlign: 'center' },
  descCol: { width: '61%' },
  moneyCol: { width: '15%', textAlign: 'right' },
  itemName: { fontSize: 9, fontWeight: 500 },
  itemDetail: { fontSize: 8, color: '#4b5870', marginTop: 2 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 7, marginTop: 14 },
  totals: { marginLeft: 'auto', width: 245, marginTop: 14 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalStrong: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f3f6fb',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 5
  },
  totalStrongText: { fontSize: 12, fontWeight: 700, color: '#1d2bb8' },
  notes: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#d8dee9',
    paddingTop: 10,
    color: '#4b5870',
    lineHeight: 1.45
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 32,
    right: 32,
    color: '#8a95a8',
    fontSize: 7,
    textAlign: 'center'
  }
});

function ServicesRows({ data }: { data: OrderPdfData }) {
  const services = data.order.additional_services || [];
  if (services.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionTitle}>Serviços adicionais</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader} fixed>
          <Text style={[styles.tableHeaderCell, styles.qtyCol]}>QTD</Text>
          <Text style={[styles.tableHeaderCell, styles.descCol]}>DESCRIÇÃO</Text>
          <Text style={[styles.tableHeaderCell, styles.moneyCol]}>UNIT</Text>
          <Text style={[styles.tableHeaderCell, styles.moneyCol]}>TOTAL</Text>
        </View>
        {services.map((service) => (
          <View key={service.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.cell, styles.qtyCol]}>{service.quantity}</Text>
            <View style={[styles.cell, styles.descCol]}>
              <Text style={styles.itemName}>{normalizePdfText(service.name)}</Text>
              {service.notes ? <Text style={styles.itemDetail}>{normalizePdfText(service.notes)}</Text> : null}
            </View>
            <Text style={[styles.cell, styles.moneyCol]}>{formatPdfCurrency(service.unit_price)}</Text>
            <Text style={[styles.cell, styles.moneyCol]}>{formatPdfCurrency(service.total_price)}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

export function OrderPdfDocument({ data }: { data: OrderPdfData }) {
  const logoUrl = getPdfLogoUrl(data.company);
  const companyAddress = buildVisibleCompanyAddress(data.company, data.settings);
  const orderDisplayNumber = formatOrderDisplayNumber(data.order.number);
  const productsTotal = data.order.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const servicesTotal = getAdditionalServicesTotal(data.order.additional_services);
  const grossTotal = productsTotal + servicesTotal + Number(data.order.shipping_cost || 0);
  const discount = Math.max(0, grossTotal - Number(data.order.total_amount || 0));
  const discountPercentage = grossTotal > 0 ? (discount / grossTotal) * 100 : 0;
  const discountNotePattern = /^Ajuste comercial — desconto: R\$ [\d.,]+ \| Motivo: (.+)$/im;
  const discountReason = String(data.order.notes || '').match(discountNotePattern)?.[1]?.trim() || '';
  const visibleNotes = String(data.order.notes || '')
    .split('\n')
    .filter((line) => !discountNotePattern.test(line.trim()))
    .join('\n')
    .trim();
  const pending = Math.max(0, Number(data.order.total_amount || 0) - Number(data.order.paid_amount || 0));
  const orderStatus = normalizeOrderOperationalStatus(data.order);
  const isInvoicedB2B = Boolean(data.invoicedTransaction && pending > 0);
  const financialStatusLabel = isInvoicedB2B
    ? 'FATURADO'
    : data.order.payment_status.toUpperCase();

  return (
    <Document title={`Pedido ${orderDisplayNumber}`} author={data.company.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flex: 1.2 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- React-PDF Image is not a DOM img and does not support alt. */}
            {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.phone ? <Text style={styles.muted}>Telefone: {data.company.phone}</Text> : null}
            {data.company.email ? <Text style={styles.muted}>E-mail: {data.company.email}</Text> : null}
            {companyAddress ? <Text style={styles.muted}>{companyAddress}</Text> : null}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>PEDIDO COMERCIAL</Text>
            <Text style={styles.title}>{orderDisplayNumber}</Text>
            <Text style={styles.meta}>Emissão: {formatPdfDate(data.order.created_at)}</Text>
            <Text style={styles.meta}>Prazo: {formatPdfDate(data.order.deadline)}</Text>
          </View>
        </View>

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Cliente</Text>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{data.customer?.name || data.order.customer_name}</Text>
            <Text style={styles.label}>Telefone</Text>
            <Text style={styles.value}>{data.customer?.phone || 'Não informado'}</Text>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.value}>{data.customer?.email || 'Não informado'}</Text>
            <Text style={styles.label}>Endereço</Text>
            <Text style={styles.value}>{buildCustomerAddress(data.customer, data.order.delivery_address) || 'Não informado'}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Pedido</Text>
            <Text style={styles.label}>Status operacional</Text>
            <Text style={styles.value}>{orderStatusLabels[orderStatus]}</Text>
            <Text style={styles.label}>Status financeiro</Text>
            <Text style={styles.value}>{financialStatusLabel}</Text>
            {isInvoicedB2B ? (
              <>
                <Text style={styles.label}>Forma de pagamento</Text>
                <Text style={styles.value}>FATURADO B2B</Text>
                <Text style={styles.label}>Vencimento</Text>
                <Text style={styles.value}>{formatPdfDate(data.invoicedTransaction?.due_date)}</Text>
              </>
            ) : null}
            <Text style={styles.label}>Entrega/Frete</Text>
            <Text style={styles.value}>{data.order.delivery_type || 'retirada'} / {formatPdfCurrency(data.order.shipping_cost)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Produtos</Text>
        <PdfProductTable items={data.order.items} />

        <ServicesRows data={data} />

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text>VALOR BRUTO</Text>
            <Text>{formatPdfCurrency(productsTotal)}</Text>
          </View>
          {servicesTotal > 0 ? (
            <View style={styles.totalLine}>
              <Text>SERVIÇOS ADICIONAIS</Text>
              <Text>{formatPdfCurrency(servicesTotal)}</Text>
            </View>
          ) : null}
          {data.order.shipping_cost > 0 ? (
            <View style={styles.totalLine}>
              <Text>ENTREGA</Text>
              <Text>{formatPdfCurrency(data.order.shipping_cost)}</Text>
            </View>
          ) : null}
          {discount > 0 ? (
            <>
              <View style={styles.totalLine}>
                <Text>DESCONTO CONCEDIDO ({discountPercentage.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)</Text>
                <Text>-{formatPdfCurrency(discount)}</Text>
              </View>
              {discountReason ? (
                <View style={styles.totalLine}>
                  <Text>MOTIVO DO DESCONTO</Text>
                  <Text>{normalizePdfText(discountReason)}</Text>
                </View>
              ) : null}
            </>
          ) : null}
          <View style={styles.totalStrong}>
            <Text style={styles.totalStrongText}>VALOR TOTAL</Text>
            <Text style={styles.totalStrongText}>{formatPdfCurrency(data.order.total_amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>VALOR PAGO</Text>
            <Text>{formatPdfCurrency(data.order.paid_amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>SALDO PENDENTE</Text>
            <Text>{formatPdfCurrency(pending)}</Text>
          </View>
        </View>

        <View style={styles.notes}>
          {visibleNotes ? <Text>Observações: {normalizePdfText(visibleNotes)}</Text> : null}
        </View>
        <Text style={styles.footer}>{getPdfFooterText(data.company)}</Text>
      </Page>
    </Document>
  );
}
