import { NextResponse } from 'next/server';
import { renderReceiptPdf } from '@/lib/pdf/pdf-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ transactionId: string }> }) {
  try {
    const { transactionId } = await context.params;
    const { searchParams } = new URL(request.url);
    const shouldDownload = searchParams.get('download') === '1';
    const renderedPdf = await renderReceiptPdf(transactionId);

    if (!renderedPdf) {
      return NextResponse.json({ error: 'Recibo nao encontrado.' }, { status: 404 });
    }

    return new Response(new Uint8Array(renderedPdf.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${shouldDownload ? 'attachment' : 'inline'}; filename="${renderedPdf.filename}"`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao gerar recibo.';
    return NextResponse.json(
      process.env.NODE_ENV === 'development'
        ? { error: 'Nao foi possivel gerar o recibo de pagamento.', details: message }
        : { error: 'Nao foi possivel gerar o recibo de pagamento.' },
      { status: 500 }
    );
  }
}
