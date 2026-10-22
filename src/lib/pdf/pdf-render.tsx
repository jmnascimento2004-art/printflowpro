import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import { getPdfSafeFilename } from '@/lib/pdf/pdf-formatters';
import { loadOrderPdfData, loadQuotePdfData, loadReceiptPdfData } from '@/lib/pdf/pdf-data';
import { OrderPdfDocument } from '@/lib/pdf/order-pdf';
import { QuotePdfDocument } from '@/lib/pdf/quote-pdf';
import { ReceiptPdfDocument } from '@/lib/pdf/receipt-pdf';
import { OrderOperationalDocument, type OperationalDocumentKind } from './order-operational-pdf';
import type { PdfRequestContext } from '@/lib/pdf/pdf-server-auth';

export type RenderedPdf = {
  buffer: Buffer;
  filename: string;
};

export async function renderOrderPdf(id: string, context: PdfRequestContext, signature = false): Promise<RenderedPdf | null> {
  const data = await loadOrderPdfData(id, context);

  if (!data) return null;

  const pdfDocument = React.createElement(OrderPdfDocument, { data, signature }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(pdfDocument);
  const filename = getPdfSafeFilename(`PEDIDO-${formatOrderDisplayNumber(data.order.number)}.pdf`);

  return { buffer, filename };
}

export async function renderOrderOperationalPdf(id: string, context: PdfRequestContext, kind: OperationalDocumentKind, copies: 1 | 2): Promise<RenderedPdf | null> {
  const data = await loadOrderPdfData(id, context, kind);
  if (!data) return null;
  const document = React.createElement(OrderOperationalDocument, { data, kind, copies }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(document);
  const prefix = { production: 'OP', label: 'ETIQUETA', protocol: 'PROTOCOLO' }[kind];
  return { buffer, filename: getPdfSafeFilename(`${prefix}-${formatOrderDisplayNumber(data.order.number)}.pdf`) };
}

export async function renderQuotePdf(id: string, context: PdfRequestContext): Promise<RenderedPdf | null> {
  const data = await loadQuotePdfData(id, context);

  if (!data) return null;

  const pdfDocument = React.createElement(QuotePdfDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(pdfDocument);
  const customerName = data.customer?.name || data.quote.customer_name || 'cliente';
  const filename = getPdfSafeFilename(`ORC-${data.quote.number}-${customerName}.pdf`);

  return { buffer, filename };
}

export async function renderReceiptPdf(transactionId: string, context: PdfRequestContext): Promise<RenderedPdf | null> {
  const data = await loadReceiptPdfData(transactionId, context);

  if (!data) return null;

  const pdfDocument = React.createElement(ReceiptPdfDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(pdfDocument);
  const customerName = data.customer?.name || data.order.customer_name || 'cliente';
  const transactionSuffix = data.transaction.id.slice(-6).toUpperCase();
  const filename = getPdfSafeFilename(`REC-${formatOrderDisplayNumber(data.order.number)}-${transactionSuffix}-${customerName}.pdf`);

  return { buffer, filename };
}
