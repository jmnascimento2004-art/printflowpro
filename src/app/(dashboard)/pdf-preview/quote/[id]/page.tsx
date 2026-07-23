'use client';

import { useParams } from 'next/navigation';
import { PdfPreviewViewer } from '@/components/pdf/pdf-preview-viewer';

export default function QuotePdfPreviewPage() {
  const params = useParams<{ id: string }>();
  const quoteId = params.id;

  return (
    <PdfPreviewViewer
      title="Pré-visualização do Orçamento"
      previewDataUrl={`/api/pdf/quote/${quoteId}`}
      pdfUrl={`/api/pdf/quote/${quoteId}`}
      downloadUrl={`/api/pdf/quote/${quoteId}?download=1`}
      backUrl="/quotes"
    />
  );
}
