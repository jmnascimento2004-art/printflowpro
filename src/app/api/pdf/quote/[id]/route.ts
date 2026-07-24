import { NextResponse } from 'next/server';
import { PdfAccessError } from '@/lib/pdf/pdf-access.mjs';
import { createPdfResponseHeaders } from '@/lib/pdf/pdf-http.mjs';
import { renderQuotePdf } from '@/lib/pdf/pdf-render';
import { authenticatePdfRequest, getAuthenticatedPdfClient } from '@/lib/pdf/pdf-server-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const shouldDownload = searchParams.get('download') === '1';
    const access = await authenticatePdfRequest(request);
    const renderedPdf = await renderQuotePdf(id, {
      access,
      supabase: getAuthenticatedPdfClient(request)
    });

    if (!renderedPdf) {
      return NextResponse.json({ error: 'Orcamento nao encontrado.' }, { status: 404 });
    }

    return new Response(new Uint8Array(renderedPdf.buffer), {
      status: 200,
      headers: createPdfResponseHeaders(renderedPdf.filename, shouldDownload)
    });
  } catch (error) {
    if (error instanceof PdfAccessError) {
      return NextResponse.json({ error: error.status === 401 ? 'Nao autenticado.' : 'Acesso negado.' }, { status: error.status });
    }

    return NextResponse.json({ error: 'Nao foi possivel gerar o PDF do orcamento.' }, { status: 500 });
  }
}
