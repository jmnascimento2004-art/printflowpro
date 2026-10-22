import { NextResponse } from 'next/server';
import { PdfAccessError } from '@/lib/pdf/pdf-access.mjs';
import { createPdfResponseHeaders } from '@/lib/pdf/pdf-http.mjs';
import { renderOrderOperationalPdf } from '@/lib/pdf/pdf-render';
import { authenticatePdfRequest, getAuthenticatedPdfClient } from '@/lib/pdf/pdf-server-auth';
import type { OperationalDocumentKind } from '@/lib/pdf/order-operational-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string; document: string }> }) {
  try {
    const { id, document } = await context.params;
    if (!['production', 'label', 'protocol'].includes(document)) return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
    const query = new URL(request.url).searchParams;
    const access = await authenticatePdfRequest(request);
    const result = await renderOrderOperationalPdf(id, { access, supabase: getAuthenticatedPdfClient(request) }, document as OperationalDocumentKind, query.get('copies') === '2' ? 2 : 1);
    if (!result) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    return new Response(new Uint8Array(result.buffer), { headers: createPdfResponseHeaders(result.filename, query.get('download') === '1') });
  } catch (error) {
    if (error instanceof PdfAccessError) return NextResponse.json({ error: 'Acesso negado.' }, { status: error.status });
    return NextResponse.json({ error: 'Não foi possível gerar o documento.' }, { status: 500 });
  }
}
