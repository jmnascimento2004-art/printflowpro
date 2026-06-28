import { NextResponse } from 'next/server';
import { renderReceiptPdf } from '@/lib/pdf/pdf-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await context.params;
    const renderedPdf = await renderReceiptPdf(transactionId);

    if (!renderedPdf) {
      return NextResponse.json({ error: 'Recibo nao encontrado.' }, { status: 404 });
    }

    return NextResponse.json(
      {
        filename: renderedPdf.filename,
        contentType: 'application/pdf',
        base64: renderedPdf.buffer.toString('base64')
      },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao preparar preview.';
    return NextResponse.json(
      process.env.NODE_ENV === 'development'
        ? { error: 'Nao foi possivel carregar a pre-visualizacao do recibo.', details: message }
        : { error: 'Nao foi possivel carregar a pre-visualizacao do recibo.' },
      { status: 500 }
    );
  }
}
