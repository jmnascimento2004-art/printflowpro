'use client';

import { useEffect } from 'react';
import { PdfPreviewViewer } from '@/components/pdf/pdf-preview-viewer';

type PdfPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  previewDataUrl: string;
  downloadUrl: string;
  directPdfUrl?: string;
  downloadLabel?: string;
};

export function PdfPreviewDialog({
  open,
  onOpenChange,
  title,
  previewDataUrl,
  downloadUrl,
  directPdfUrl,
  downloadLabel
}: PdfPreviewDialogProps) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
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
        <PdfPreviewViewer
          embedded
          title={title}
          previewDataUrl={previewDataUrl}
          downloadUrl={downloadUrl}
          directPdfUrl={directPdfUrl}
          downloadLabel={downloadLabel}
          onClose={() => onOpenChange(false)}
          height="90vh"
        />
      </div>
    </div>
  );
}
