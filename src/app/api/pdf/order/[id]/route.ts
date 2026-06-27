import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { NextResponse } from 'next/server';
import { loadOrderPdfData } from '@/lib/pdf/pdf-data';
import { getPdfSafeFilename } from '@/lib/pdf/pdf-formatters';
import { OrderPdfDocument } from '@/lib/pdf/order-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await loadOrderPdfData(id);

    if (!data) {
      return NextResponse.json({ error: 'Pedido nao encontrado.' }, { status: 404 });
    }

    const pdfDocument = React.createElement(OrderPdfDocument, { data }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(pdfDocument);
    const customerName = data.customer?.name || data.order.customer_name || 'cliente';
    const filename = getPdfSafeFilename(`${data.order.number}-${customerName}.pdf`);

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao gerar PDF.';
    return NextResponse.json(
      process.env.NODE_ENV === 'development'
        ? { error: 'Nao foi possivel gerar o PDF do pedido.', details: message }
        : { error: 'Nao foi possivel gerar o PDF do pedido.' },
      { status: 500 }
    );
  }
}
