'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { PdfPreviewViewer } from '@/components/pdf/pdf-preview-viewer';

type PdfPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  previewDataUrl: string;
  downloadUrl: string;
  directPdfUrl?: string;
};

export function PdfPreviewDialog({
  open,
  onOpenChange,
  title,
  previewDataUrl,
  downloadUrl,
  directPdfUrl
}: PdfPreviewDialogProps) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-3 top-3 z-30 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-950"
          aria-label="Fechar visualizacao do PDF"
        >
          <X className="h-4 w-4" />
        </button>

        <PdfPreviewViewer
          embedded
          title={title}
          previewDataUrl={previewDataUrl}
          downloadUrl={downloadUrl}
          directPdfUrl={directPdfUrl}
          onClose={() => onOpenChange(false)}
          height="90vh"
        />
      </div>
    </div>
  );
}
