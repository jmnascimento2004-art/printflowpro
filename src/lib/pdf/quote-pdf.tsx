import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { QuotePdfData } from '@/lib/pdf/pdf-data';
import {
  buildCompanyAddress,
  buildCustomerAddress,
  formatPdfCurrency,
  formatPdfDate,
  formatPdfUnitCurrency,
  getAdditionalServicesTotal,
  getItemDescriptionLines,
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
  brandBlock: { flex: 1.2 },
  logo: { width: 132, height: 48, objectFit: 'contain', marginBottom: 8 },
  companyName: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
  muted: { color: '#65728a' },
  titleBlock: { width: 190, alignItems: 'flex-end' },
  title: { fontSize: 20, fontWeight: 700, color: '#101827' },
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
  cell: { paddingVertical: 7, paddingHorizontal: 6, lineHeight: 1.35 },
  qtyCol: { width: '9%', textAlign: 'center' },
  descCol: { width: '61%' },
  moneyCol: { width: '15%', textAlign: 'right' },
  itemName: { fontSize: 9, fontWeight: 700, marginBottom: 3 },
  itemDetail: { fontSize: 8, color: '#4b5870', marginTop: 2 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 7, marginTop: 14 },
  totals: { marginLeft: 'auto', width: 230, marginTop: 14 },
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

function ItemRows({ data }: { data: QuotePdfData }) {
  return (
    <>
      {data.quote.items.map((item) => {
        const lines = getItemDescriptionLines(item);
        return (
          <View key={item.id} style={styles.tableRow} wrap={false}>
            <Text style={[styles.cell, styles.qtyCol]}>{item.quantity}</Text>
            <View style={[styles.cell, styles.descCol]}>
              <Text style={styles.itemName}>{lines.name}</Text>
              {lines.configuration ? <Text style={styles.itemDetail}>{lines.configuration}</Text> : null}
              <Text style={styles.itemDetail}>{lines.quantityLine}</Text>
              {lines.notes ? <Text style={styles.itemDetail}>Obs: {lines.notes}</Text> : null}
            </View>
            <Text style={[styles.cell, styles.moneyCol]}>{formatPdfUnitCurrency(item.unit_price)}</Text>
            <Text style={[styles.cell, styles.moneyCol]}>{formatPdfCurrency(item.total_price)}</Text>
          </View>
        );
      })}
    </>
  );
}

function ServicesRows({ data }: { data: QuotePdfData }) {
  const services = data.quote.additional_services || [];
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

export function QuotePdfDocument({ data }: { data: QuotePdfData }) {
  const logoUrl = getPdfLogoUrl(data.company);
  const productsTotal = data.quote.items.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
  const servicesTotal = getAdditionalServicesTotal(data.quote.additional_services);
  const deliveryFee = Number(data.quote.delivery_fee || 0);

  return (
    <Document title={`Orcamento ${data.quote.number}`} author={data.company.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandBlock}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- React-PDF Image is not a DOM img and does not support alt. */}
            {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
            <Text style={styles.companyName}>{data.company.name}</Text>
            {data.company.phone ? <Text style={styles.muted}>Telefone: {data.company.phone}</Text> : null}
            {data.company.email ? <Text style={styles.muted}>E-mail: {data.company.email}</Text> : null}
            {buildCompanyAddress(data.company) ? <Text style={styles.muted}>{buildCompanyAddress(data.company)}</Text> : null}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>ORCAMENTO</Text>
            <Text style={styles.title}>#{data.quote.number}</Text>
            <Text style={styles.meta}>Emissão: {formatPdfDate(data.quote.created_at)}</Text>
            <Text style={styles.meta}>Validade: {formatPdfDate(data.quote.valid_until)}</Text>
          </View>
        </View>

        <View style={styles.boxRow}>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Cliente</Text>
            <Text style={styles.label}>Nome</Text>
            <Text style={styles.value}>{data.customer?.name || data.quote.customer_name}</Text>
            <Text style={styles.label}>Telefone</Text>
            <Text style={styles.value}>{data.customer?.phone || data.quote.customer_phone || 'Não informado'}</Text>
            <Text style={styles.label}>E-mail</Text>
            <Text style={styles.value}>{data.customer?.email || 'Não informado'}</Text>
            <Text style={styles.label}>Endereco</Text>
            <Text style={styles.value}>{buildCustomerAddress(data.customer, data.quote.delivery_address) || 'Não informado'}</Text>
          </View>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Proposta</Text>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{data.quote.status.toUpperCase()}</Text>
            <Text style={styles.label}>Entrega</Text>
            <Text style={styles.value}>{data.quote.delivery_type || 'retirada'}</Text>
            <Text style={styles.label}>Distancia/Frete</Text>
            <Text style={styles.value}>{data.quote.delivery_distance_km ? `${data.quote.delivery_distance_km.toFixed(2)} km` : 'Não informado'} / {formatPdfCurrency(deliveryFee)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Produtos</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader} fixed>
            <Text style={[styles.tableHeaderCell, styles.qtyCol]}>QTD</Text>
            <Text style={[styles.tableHeaderCell, styles.descCol]}>DESCRIÇÃO</Text>
            <Text style={[styles.tableHeaderCell, styles.moneyCol]}>UNIT</Text>
            <Text style={[styles.tableHeaderCell, styles.moneyCol]}>TOTAL</Text>
          </View>
          <ItemRows data={data} />
        </View>

        <ServicesRows data={data} />

        <View style={styles.totals}>
          <View style={styles.totalLine}>
            <Text>Total produtos</Text>
            <Text>{formatPdfCurrency(productsTotal)}</Text>
          </View>
          {servicesTotal > 0 ? (
            <View style={styles.totalLine}>
              <Text>Serviços adicionais</Text>
              <Text>{formatPdfCurrency(servicesTotal)}</Text>
            </View>
          ) : null}
          {deliveryFee > 0 ? (
            <View style={styles.totalLine}>
              <Text>Entrega</Text>
              <Text>{formatPdfCurrency(deliveryFee)}</Text>
            </View>
          ) : null}
          {data.quote.discount > 0 ? (
            <View style={styles.totalLine}>
              <Text>Desconto</Text>
              <Text>-{formatPdfCurrency(data.quote.discount)}</Text>
            </View>
          ) : null}
          <View style={styles.totalStrong}>
            <Text style={styles.totalStrongText}>Total líquido</Text>
            <Text style={styles.totalStrongText}>{formatPdfCurrency(data.quote.total_amount)}</Text>
          </View>
        </View>

        <View style={styles.notes}>
          <Text>Validade da proposta: {formatPdfDate(data.quote.valid_until)}.</Text>
          {data.quote.notes ? <Text>Observações: {normalizePdfText(data.quote.notes)}</Text> : null}
        </View>
        <Text style={styles.footer}>Documento gerado pelo PrintFlowPRO.</Text>
      </Page>
    </Document>
  );
}
