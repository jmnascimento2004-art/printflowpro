'use client';

import { useParams } from 'next/navigation';
import { PdfPreviewViewer } from '@/components/pdf/pdf-preview-viewer';

export default function OrderPdfPreviewPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  return (
    <PdfPreviewViewer
      title="Pre-visualizacao do Pedido"
      pdfUrl={`/api/pdf/order/${orderId}`}
      downloadUrl={`/api/pdf/order/${orderId}?download=1`}
      backUrl="/orders"
    />
  );
}
