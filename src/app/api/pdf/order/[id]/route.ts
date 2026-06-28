import { NextResponse } from 'next/server';
import { renderOrderPdf } from '@/lib/pdf/pdf-render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const shouldDownload = searchParams.get('download') === '1';
    const renderedPdf = await renderOrderPdf(id);

    if (!renderedPdf) {
      return NextResponse.json({ error: 'Pedido nao encontrado.' }, { status: 404 });
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
    const message = error instanceof Error ? error.message : 'Erro desconhecido ao gerar PDF.';
    return NextResponse.json(
      process.env.NODE_ENV === 'development'
        ? { error: 'Nao foi possivel gerar o PDF do pedido.', details: message }
        : { error: 'Nao foi possivel gerar o PDF do pedido.' },
      { status: 500 }
    );
  }
}
