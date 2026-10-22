'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Download, ExternalLink, Loader2, Printer, RefreshCw, X } from 'lucide-react';
import { openPdfFromUrl } from '@/lib/download';
import { downloadPdfDocument, printPdfDocument } from '@/lib/pdf/pdf-document-actions.mjs';
import { fetchAuthenticatedPdf } from '@/lib/pdf/pdf-authenticated-client';
import {
  blobToPdfData,
  createPdfAssetCache,
  createPdfPreviewRunController
} from '@/lib/pdf/pdf-preview-runtime.mjs';

export type LoadedPdfDocument = { blob: Blob; filename: string };
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
  headerControls?: ReactNode;
  extraActions?: (document: LoadedPdfDocument | null) => ReactNode;
  allowPrint?: boolean;
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
  backUrl,
  directPdfUrl,
  downloadLabel = 'Baixar PDF',
  height,
  onClose,
  showHeaderActions = true,
  embedded = false,
  headerControls,
  extraActions,
  allowPrint = false
}: PdfPreviewViewerProps) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const assetRef = useRef<ReturnType<typeof createPdfAssetCache> | null>(null);
  if (!assetRef.current) assetRef.current = createPdfAssetCache();
  const runControllerRef = useRef<ReturnType<typeof createPdfPreviewRunController> | null>(null);
  if (!runControllerRef.current) {
    runControllerRef.current = createPdfPreviewRunController();
  }

  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Carregando documento...');
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [loaded, setLoaded] = useState<(LoadedPdfDocument & { source: string; revision: number }) | null>(null);
  const [actionError, setActionError] = useState('');
  const [renderWidth, setRenderWidth] = useState(0);
  const currentDocument = loaded?.source === previewDataUrl && loaded.revision === reloadKey ? loaded : null;

  useEffect(() => {
    const element = pagesRef.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const width = Math.floor(entries[0].contentRect.width);
      setRenderWidth(previous => previous === width ? previous : width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
      setLoadingMessage('Carregando documento...');
      setError(null);
      setLoaded(null);
      setActionError('');
      setPageCount(0);
      clearRenderedPages();

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const { blob, filename } = await assetRef.current!.load(previewDataUrl, reloadKey, fetchAuthenticatedPdf);
        const pdfData = await blobToPdfData(blob);
        if (!runController.isCurrent(generation)) return;
        setLoaded({ blob, filename, source: previewDataUrl, revision: reloadKey });

        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(pdfData)
        }) as PdfLoadingTask;
        if (!runController.setLoadingTask(generation, loadingTask)) return;

        const pdf = await loadingTask.promise;
        if (!runController.isCurrent(generation) || !pagesRef.current) return;

        setLoadingMessage('Preparando documento...');
        setPageCount(pdf.numPages);
        const containerWidth = Math.max(160, pagesRef.current.clientWidth || 960);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (!runController.isCurrent(generation) || !pagesRef.current) return;

          const page = await pdf.getPage(pageNumber) as {
            getViewport: (options: { scale: number }) => { width: number; height: number };
            render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => RenderTask;
          };
          if (!runController.isCurrent(generation) || !pagesRef.current) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min((containerWidth - 26) / baseViewport.width, 1.6);
          const viewport = page.getViewport({ scale });

          const pageShell = document.createElement('div');
          pageShell.className = 'mx-auto w-fit max-w-full rounded-lg border border-slate-200 bg-white p-3 shadow-sm';

          const pageLabel = document.createElement('p');
          pageLabel.className = 'mb-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-400';
          pageLabel.textContent = `Página ${pageNumber} de ${pdf.numPages}`;

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) {
            throw new Error('Não foi possível preparar a visualização do PDF.');
          }

          const outputScale = window.devicePixelRatio || 1;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = 'auto';
          canvas.className = 'mx-auto block max-w-full bg-white';
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
        setError('Não foi possível carregar o documento.');
      } finally {
        if (runController.isCurrent(generation)) setIsLoading(false);
      }
    };

    void renderPdf();

    return () => {
      runController.cancel(generation);
      clearRenderedPages();
    };
  }, [previewDataUrl, reloadKey, renderWidth]);

  const handleDownload = () => {
    if (!currentDocument) return;
    setActionError('');
    try {
      downloadPdfDocument(currentDocument);
    } catch {
      setActionError('Não foi possível baixar o documento. Tente novamente.');
    }
  };

  const handlePrint = () => {
    if (!currentDocument) return;
    setActionError('');
    try { printPdfDocument(currentDocument); }
    catch { setActionError('Não foi possível abrir a impressão. Permita a janela de impressão e tente novamente.'); }
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
    <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-card text-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 flex-1">
            {backUrl && (
              <Link href={backUrl} className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-500 hover:text-slate-950">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            )}
            <h1 className="truncate text-base font-bold sm:text-lg">{title}</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">Visualização do documento</p>
          </div>
          {onClose && <button type="button" onClick={onClose} aria-label="Fechar documento" title="Fechar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><X className="h-4 w-4" /></button>}
          <div className="flex w-full flex-wrap items-center gap-2">
            {headerControls}
            {showHeaderActions && (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!currentDocument}
                  className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {downloadLabel}
                </button>
                {allowPrint && <button type="button" disabled={!currentDocument} onClick={handlePrint} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-bold text-foreground hover:bg-secondary/80 disabled:opacity-50"><Printer className="h-4 w-4" />Imprimir</button>}
                {extraActions?.(currentDocument)}
                {resolvedDirectPdfUrl && (
                  <button
                    type="button"
                    onClick={() => void handleOpenPdf(resolvedDirectPdfUrl)}
                    className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir PDF direto
                  </button>
                )}
              </div>
            )}

          </div>
          {actionError && <p role="alert" className="w-full text-sm text-destructive">{actionError}</p>}
        </div>
    </div>
  );

  const content = (
      <section className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-5 sm:py-6">
        {isLoading && (
          <div role="status" className="mb-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-card p-6 text-sm font-semibold text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            {loadingMessage}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-card p-4 text-sm font-semibold text-destructive">
            {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mt-3 flex min-h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 py-2 text-xs font-bold text-foreground"><RefreshCw className="h-4 w-4" />Tentar novamente</button>
          </div>
        )}

        {!isLoading && !error && pageCount > 0 && (
          <p role="status" className="mb-4 text-center text-xs font-semibold text-slate-500">
            {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
          </p>
        )}

        <div ref={pagesRef} className="space-y-5" />
      </section>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-slate-100 text-slate-950" style={{ height }}>
        {header}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain" style={{ scrollbarGutter: 'stable' }}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <main className="h-screen overflow-auto bg-slate-100 text-slate-950" style={{ scrollbarGutter: 'stable' }}>
      {header}
      {content}
    </main>
  );
}
