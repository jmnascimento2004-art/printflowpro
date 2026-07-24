import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ReceiptPdfData } from '@/lib/pdf/pdf-data';
import { formatOrderDisplayNumber, replaceOrderNumbersForDisplay } from '@/lib/order-number';
import {
  buildVisibleCompanyAddress,
  formatPdfCurrency,
  formatPdfDate,
  getAdditionalServicesTotal,
  getPdfFooterText,
  getPdfLogoUrl,
  normalizePdfText
} from '@/lib/pdf/pdf-formatters';
import { PdfProductTable } from '@/lib/pdf/pdf-product-table.mjs';

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
  value: { fontSize: 9, fontWeight: 500, marginTop: 2, marginBottom: 6 },
  formalBox: {
    borderWidth: 1,
    borderColor: '#cfd7e6',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    backgroundColor: '#f8fafc'
  },
  formalText: { fontSize: 11, lineHeight: 1.45, color: '#172033' },
  formalMeta: { marginTop: 8, color: '#4b5870', fontSize: 8.5, lineHeight: 1.35 },
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
    textAlign: 'center'
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

function getReceiptPaymentKind(data: ReceiptPdfData) {
  const totalPaidAfter = Number(data.accumulatedPaid || 0);
  const totalOrder = Number(data.order.total_amount || 0);
  const totalPaidBefore = Number(data.paidBeforeReceipt || 0);

  if (totalPaidAfter >= totalOrder - 0.009) {
    return totalPaidBefore > 0 ? 'pagamento do saldo' : 'pagamento total';
  }

  return 'pagamento parcial';
}

export function ReceiptPdfDocument({ data }: { data: ReceiptPdfData }) {
  const logoUrl = getPdfLogoUrl(data.company);
  const companyAddress = buildVisibleCompanyAddress(data.company, data.settings);
  const orderDisplayNumber = formatOrderDisplayNumber(data.order.number);
  const receiptNumber = `REC-${orderDisplayNumber.replace(/^PED-/, '')}-${data.transaction.id.slice(-6).toUpperCase()}`;
  const productsTotal = data.order.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const servicesTotal = getAdditionalServicesTotal(data.order.additional_services);
  const paymentMethod = paymentMethodLabels[data.transaction.payment_method] || data.transaction.payment_method;
  const customerName = normalizePdfText(data.customer?.name || data.order.customer_name) || 'Cliente';
  const paymentKind = getReceiptPaymentKind(data);
  const notes = normalizePdfText(replaceOrderNumbersForDisplay(data.transaction.description));
  const formalReceiptText = `Recebemos de ${customerName} a importância de ${formatPdfCurrency(data.transaction.amount)} referente ao ${paymentKind} do Pedido ${orderDisplayNumber}, conforme produtos e serviços descritos neste documento.`;

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
            <Text style={styles.value}>{customerName}</Text>
            <Text style={styles.label}>Documento</Text>
            <Text style={styles.value}>{data.customer?.document || 'Não informado'}</Text>
            <Text style={styles.label}>Contato</Text>
            <Text style={styles.value}>{data.customer?.phone || data.customer?.email || 'Não informado'}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Pagamento</Text>
            <Text style={styles.label}>Pedido</Text>
            <Text style={styles.value}>{orderDisplayNumber}</Text>
            <Text style={styles.label}>Forma</Text>
            <Text style={styles.value}>{paymentMethod}</Text>
            <Text style={styles.label}>Data do pagamento</Text>
            <Text style={styles.value}>{formatPdfDate(data.transaction.paid_at || data.transaction.created_at)}</Text>
          </View>
        </View>

        <View style={styles.formalBox}>
          <Text style={styles.formalText}>{formalReceiptText}</Text>
          <Text style={styles.formalMeta}>Forma de pagamento: {paymentMethod}.</Text>
        </View>

        <Text style={styles.sectionTitle}>Produtos e serviços do pedido</Text>
        <PdfProductTable items={data.order.items} />

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text>Total de produtos</Text>
            <Text>{formatPdfCurrency(productsTotal)}</Text>
          </View>
          {servicesTotal > 0 ? (
            <View style={styles.totalLine}>
              <Text>Serviços adicionais</Text>
              <Text>{formatPdfCurrency(servicesTotal)}</Text>
            </View>
          ) : null}
          <View style={styles.totalLine}>
            <Text>TOTAL DO PEDIDO</Text>
            <Text>{formatPdfCurrency(data.order.total_amount)}</Text>
          </View>
          <View style={styles.totalStrong}>
            <Text style={styles.totalStrongText}>VALOR RECEBIDO NESTE RECIBO</Text>
            <Text style={styles.totalStrongText}>{formatPdfCurrency(data.transaction.amount)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>TOTAL PAGO NO PEDIDO</Text>
            <Text>{formatPdfCurrency(data.accumulatedPaid)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>SALDO PENDENTE</Text>
            <Text>{formatPdfCurrency(data.pendingAmount)}</Text>
          </View>
        </View>

        {notes ? (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Observacoes</Text>
            <Text>{notes}</Text>
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
