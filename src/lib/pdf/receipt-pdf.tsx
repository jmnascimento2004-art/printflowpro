import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReceiptPdfData } from '@/lib/pdf/pdf-data';
import {
  buildVisibleCompanyAddress,
  formatPdfCurrency,
  formatPdfDate,
  formatPdfUnitCurrency,
  getAdditionalServicesTotal,
  getCompactItemDescription,
  getPdfFooterText,
  getPdfLogoUrl,
  normalizePdfText
} from '@/lib/pdf/pdf-formatters';

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
  titleBlock: { width: 210, alignItems: 'flex-end' },
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
  value: { fontSize: 9, fontWeight: 700, marginTop: 2, marginBottom: 6 },
  table: { width: '100%', borderWidth: 1, borderColor: '#d8dee9', borderRadius: 6, overflow: 'hidden' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#050505', color: '#ffffff' },
  tableHeaderCell: { paddingVertical: 7, paddingHorizontal: 6, fontSize: 8, fontWeight: 700 },
  tableRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e8edf5' },
  cell: { paddingVertical: 6, paddingHorizontal: 6, lineHeight: 1.2 },
  qtyCol: { width: '9%', textAlign: 'center' },
  descCol: { width: '61%' },
  moneyCol: { width: '15%', textAlign: 'right' },
  itemName: { fontSize: 9, fontWeight: 700 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 7, marginTop: 14 },
  totals: { marginLeft: 'auto', width: 260, marginTop: 14 },
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
  declaration: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: '#d8dee9',
    paddingTop: 10,
    color: '#4b5870',
    lineHeight: 1.45,
    textAlign: 'center',
    fontWeight: 700
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

const paymentMethodLabels: Record<string, string> = {
  pix: 'PIX',
  cartao_credito: 'Cartao de credito',
  cartao_debito: 'Cartao de debito',
  boleto: 'Boleto',
  dinheiro: 'Dinheiro',
  faturado: 'Faturado'
};

function ReceiptItemRows({ data }: { data: ReceiptPdfData }) {
  return (
    <>
      {data.order.items.map((item) => (
        <View key={item.id} style={styles.tableRow} wrap={false}>
          <Text style={[styles.cell, styles.qtyCol]}>{item.quantity}</Text>
          <View style={[styles.cell, styles.descCol]}>
            <Text style={styles.itemName}>{getCompactItemDescription(item)}</Text>
          </View>
          <Text style={[styles.cell, styles.moneyCol]}>{formatPdfUnitCurrency(item.unit_price)}</Text>
          <Text style={[styles.cell, styles.moneyCol]}>{formatPdfCurrency(item.total_price)}</Text>
        </View>
      ))}
    </>
  );
}

export function ReceiptPdfDocument({ data }: { data: ReceiptPdfData }) {
  const logoUrl = getPdfLogoUrl(data.company);
  const companyAddress = buildVisibleCompanyAddress(data.company, data.settings);
  const receiptNumber = `REC-${data.order.number.replace(/^ORD-/, '')}-${data.transaction.id.slice(-6).toUpperCase()}`;
  const productsTotal = data.order.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const servicesTotal = getAdditionalServicesTotal(data.order.additional_services);
  const paymentMethod = paymentMethodLabels[data.transaction.payment_method] || data.transaction.payment_method;

  return (
    <Document title={`Recibo ${receiptNumber}`} author={data.company.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={{ flex: 1.2 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- React-PDF Image is not a DOM img and does not support alt. */}
            {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.document ? <Text style={styles.muted}>CNPJ: {data.company.document}</Text> : null}
            {data.company.phone ? <Text style={styles.muted}>Telefone: {data.company.phone}</Text> : null}
            {data.company.email ? <Text style={styles.muted}>E-mail: {data.company.email}</Text> : null}
            {companyAddress ? <Text style={styles.muted}>{companyAddress}</Text> : null}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>RECIBO</Text>
            <Text style={styles.title}>DE PAGAMENTO</Text>
            <Text style={styles.meta}>N.: {receiptNumber}</Text>
            <Text style={styles.meta}>Emissao: {formatPdfDate(new Date().toISOString())}</Text>
          </View>
        </View>

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Cliente</Text>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{data.customer?.name || data.order.customer_name}</Text>
            <Text style={styles.label}>Contato</Text>
            <Text style={styles.value}>{data.customer?.phone || data.customer?.email || 'Nao informado'}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Pagamento</Text>
            <Text style={styles.label}>Pedido</Text>
            <Text style={styles.value}>{data.order.number}</Text>
            <Text style={styles.label}>Forma</Text>
            <Text style={styles.value}>{paymentMethod}</Text>
            <Text style={styles.label}>Data do pagamento</Text>
            <Text style={styles.value}>{formatPdfDate(data.transaction.paid_at || data.transaction.created_at)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Produtos e servicos do pedido</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.tableHeaderCell, styles.qtyCol]}>QTD</Text>
            <Text style={[styles.tableHeaderCell, styles.descCol]}>DESCRICAO</Text>
            <Text style={[styles.tableHeaderCell, styles.moneyCol]}>UNIT</Text>
            <Text style={[styles.tableHeaderCell, styles.moneyCol]}>TOTAL</Text>
          </View>
          <ReceiptItemRows data={data} />
        </View>

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text>Total de produtos</Text>
            <Text>{formatPdfCurrency(productsTotal)}</Text>
          </View>
          {servicesTotal > 0 ? (
            <View style={styles.totalLine}>
              <Text>Servicos adicionais</Text>
              <Text>{formatPdfCurrency(servicesTotal)}</Text>
            </View>
          ) : null}
          <View style={styles.totalLine}>
            <Text>Valor total do pedido</Text>
            <Text>{formatPdfCurrency(data.order.total_amount)}</Text>
          </View>
          <View style={styles.totalStrong}>
            <Text style={styles.totalStrongText}>Valor pago nesta transacao</Text>
            <Text style={styles.totalStrongText}>{formatPdfCurrency(data.transaction.amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>Valor ja pago acumulado</Text>
            <Text>{formatPdfCurrency(data.accumulatedPaid)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>Saldo pendente</Text>
            <Text>{formatPdfCurrency(data.pendingAmount)}</Text>
          </View>
        </View>

        {data.transaction.description ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Observacoes</Text>
            <Text>{normalizePdfText(data.transaction.description)}</Text>
          </View>
        ) : null}

        <Text style={styles.declaration}>
          Declaramos para os devidos fins que o valor acima foi recebido e registrado em nosso sistema.
        </Text>

        <Text style={styles.footer}>{getPdfFooterText(data.company)}</Text>
      </Page>
    </Document>
  );
}
