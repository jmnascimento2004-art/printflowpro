'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { downloadFileFromUrl, openPdfFromUrl } from '@/lib/download';
import { fetchAuthenticatedPdf } from '@/lib/pdf/pdf-authenticated-client';
import {
  blobToPdfData,
  createPdfPreviewRunController
} from '@/lib/pdf/pdf-preview-runtime.mjs';

type PdfPreviewViewerProps = {
  title: string;
  previewDataUrl: string;
  pdfUrl?: string;
  downloadUrl: string;
  backUrl?: string;
  directPdfUrl?: string;
  downloadLabel?: string;
  height?: string;
  onClose?: () => void;
  showHeaderActions?: boolean;
  embedded?: boolean;
};

type RenderTask = {
  cancel: () => void;
  promise: Promise<unknown>;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<unknown>;
};

type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy: () => Promise<void>;
};

export function PdfPreviewViewer({
  title,
  previewDataUrl,
  pdfUrl,
  downloadUrl,
  backUrl,
  directPdfUrl,
  downloadLabel = 'Baixar PDF',
  height,
  showHeaderActions = true,
  embedded = false
}: PdfPreviewViewerProps) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const runControllerRef = useRef<ReturnType<typeof createPdfPreviewRunController> | null>(null);
  if (!runControllerRef.current) {
    runControllerRef.current = createPdfPreviewRunController();
  }

  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Carregando pre-visualizacao do PDF...');
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const runController = runControllerRef.current;
    if (!runController) return;
    const generation = runController.begin();

    const clearRenderedPages = () => {
      if (pagesRef.current) {
        pagesRef.current.replaceChildren();
      }
    };

    const renderPdf = async () => {
      if (!pagesRef.current) return;

      setIsLoading(true);
      setLoadingMessage('Carregando pre-visualizacao do PDF...');
      setError(null);
      setPageCount(0);
      clearRenderedPages();

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const { blob } = await fetchAuthenticatedPdf(previewDataUrl);
        const pdfData = await blobToPdfData(blob);
        if (!runController.isCurrent(generation)) return;

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(pdfData)
        }) as PdfLoadingTask;
        if (!runController.setLoadingTask(generation, loadingTask)) return;

        const pdf = await loadingTask.promise;
        if (!runController.isCurrent(generation) || !pagesRef.current) return;

        setLoadingMessage('Renderizando paginas do PDF...');
        setPageCount(pdf.numPages);
        const containerWidth = Math.max(320, pagesRef.current.clientWidth || 960);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (!runController.isCurrent(generation) || !pagesRef.current) return;

          const page = await pdf.getPage(pageNumber) as {
            getViewport: (options: { scale: number }) => { width: number; height: number };
            render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => RenderTask;
          };
          if (!runController.isCurrent(generation) || !pagesRef.current) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(Math.max((containerWidth - 32) / baseViewport.width, 0.6), 1.45);
          const viewport = page.getViewport({ scale });

          const pageShell = document.createElement('div');
          pageShell.className = 'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm';

          const pageLabel = document.createElement('p');
          pageLabel.className = 'mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400';
          pageLabel.textContent = `Pagina ${pageNumber} de ${pdf.numPages}`;

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Não foi possível preparar a visualização do PDF.');
          }

          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = 'mx-auto max-w-full rounded-xl bg-white';
          context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

          pageShell.appendChild(pageLabel);
          pageShell.appendChild(canvas);
          pagesRef.current.appendChild(pageShell);

          const renderTask = page.render({ canvasContext: context, viewport });
          if (!runController.addRenderTask(generation, renderTask)) return;
          await renderTask.promise;
          runController.removeRenderTask(renderTask);
          if (!runController.isCurrent(generation)) return;
        }
      } catch {
        if (!runController.isCurrent(generation)) return;
        clearRenderedPages();
        setPageCount(0);
        setError('Nao foi possivel renderizar a pre-visualizacao. Tente recarregar ou use o download do PDF.');
      } finally {
        if (runController.isCurrent(generation)) setIsLoading(false);
      }
    };

    void renderPdf();

    return () => {
      runController.cancel(generation);
      clearRenderedPages();
    };
  }, [previewDataUrl, reloadKey]);

  const handleDownload = async () => {
    try {
      await downloadFileFromUrl(downloadUrl);
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Erro ao baixar PDF:', err);
      }
      alert('Não foi possível baixar o PDF. Tente novamente.');
    }
  };

  const handleOpenPdf = async (url: string) => {
    try {
      await openPdfFromUrl(url);
    } catch {
      alert('Não foi possível abrir o PDF. Verifique se o navegador bloqueou a nova guia.');
    }
  };

  const resolvedDirectPdfUrl = directPdfUrl || pdfUrl;

  const header = (
    <div className={embedded ? 'border-b border-slate-200 bg-white' : 'sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur'}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {backUrl && (
              <Link href={backUrl} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500 hover:text-slate-950">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            )}
            <h1 className="mt-1 truncate text-xl font-black text-slate-950">{title}</h1>
            <p className="text-xs font-semibold text-slate-500">
              Visualizacao interna em canvas. O download fica separado no botao ao lado.
            </p>
          </div>

          {showHeaderActions && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setReloadKey((value) => value + 1)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1D35C9] px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-[#172AA3]"
            >
              <Download className="h-4 w-4" />
              {downloadLabel}
            </button>
            {resolvedDirectPdfUrl && (
              <button
                type="button"
                onClick={() => void handleOpenPdf(resolvedDirectPdfUrl)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                Abrir PDF direto
              </button>
            )}
          </div>
          )}
        </div>
    </div>
  );

  const content = (
      <section className="mx-auto max-w-6xl px-4 py-6">
        {isLoading && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#1D35C9]" />
            {loadingMessage}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {!isLoading && !error && pageCount > 0 && (
          <p className="mb-4 text-center text-xs font-bold uppercase tracking-wide text-slate-500">
            {pageCount} {pageCount === 1 ? 'pagina renderizada' : 'paginas renderizadas'}
          </p>
        )}

        <div ref={pagesRef} className="space-y-5" />
      </section>
  );

  if (embedded) {
    return (
      <div className="flex h-full flex-col bg-slate-100 text-slate-950" style={{ height }}>
        {header}
        <div className="flex-1 overflow-y-auto">
          {content}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      {header}
      {content}
    </main>
  );
}
