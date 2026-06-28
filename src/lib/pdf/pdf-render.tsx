import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getPdfSafeFilename } from '@/lib/pdf/pdf-formatters';
import { loadOrderPdfData, loadQuotePdfData, loadReceiptPdfData } from '@/lib/pdf/pdf-data';
import { OrderPdfDocument } from '@/lib/pdf/order-pdf';
import { QuotePdfDocument } from '@/lib/pdf/quote-pdf';
import { ReceiptPdfDocument } from '@/lib/pdf/receipt-pdf';

export type RenderedPdf = {
  buffer: Buffer;
  filename: string;
};

export async function renderOrderPdf(id: string): Promise<RenderedPdf | null> {
  const data = await loadOrderPdfData(id);

  if (!data) return null;

  const pdfDocument = React.createElement(OrderPdfDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(pdfDocument);
  const customerName = data.customer?.name || data.order.customer_name || 'cliente';
  const filename = getPdfSafeFilename(`PED-${data.order.number}-${customerName}.pdf`);

  return { buffer, filename };
}

export async function renderQuotePdf(id: string): Promise<RenderedPdf | null> {
  const data = await loadQuotePdfData(id);

  if (!data) return null;

  const pdfDocument = React.createElement(QuotePdfDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(pdfDocument);
  const customerName = data.customer?.name || data.quote.customer_name || 'cliente';
  const filename = getPdfSafeFilename(`ORC-${data.quote.number}-${customerName}.pdf`);

  return { buffer, filename };
}

export async function renderReceiptPdf(transactionId: string): Promise<RenderedPdf | null> {
  const data = await loadReceiptPdfData(transactionId);

  if (!data) return null;

  const pdfDocument = React.createElement(ReceiptPdfDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(pdfDocument);
  const customerName = data.customer?.name || data.order.customer_name || 'cliente';
  const transactionSuffix = data.transaction.id.slice(-6).toUpperCase();
  const filename = getPdfSafeFilename(`REC-${data.order.number}-${transactionSuffix}-${customerName}.pdf`);

  return { buffer, filename };
}
