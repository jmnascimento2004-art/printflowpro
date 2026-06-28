'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, ExternalLink, Loader2, RefreshCw } from 'lucide-react';

type PdfPreviewViewerProps = {
  title: string;
  previewDataUrl: string;
  pdfUrl: string;
  downloadUrl: string;
  backUrl?: string;
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

type PdfPreviewData = {
  filename: string;
  contentType: string;
  base64: string;
};

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function isPdfPreviewData(value: unknown): value is PdfPreviewData {
  if (!value || typeof value !== 'object') return false;

  const data = value as Partial<PdfPreviewData>;
  return (
    typeof data.filename === 'string' &&
    data.contentType === 'application/pdf' &&
    typeof data.base64 === 'string' &&
    data.base64.length > 0
  );
}

export function PdfPreviewViewer({ title, previewDataUrl, pdfUrl, downloadUrl, backUrl }: PdfPreviewViewerProps) {
  const pagesRef = useRef<HTMLDivElement | null>(null);
  const renderTasksRef = useRef<RenderTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let loadingTask: PdfLoadingTask | null = null;

    const clearRenderedPages = () => {
      renderTasksRef.current.forEach((task) => task.cancel());
      renderTasksRef.current = [];
      if (pagesRef.current) {
        pagesRef.current.replaceChildren();
      }
    };

    const renderPdf = async () => {
      if (!pagesRef.current) return;

      setIsLoading(true);
      setError(null);
      setPageCount(0);
      clearRenderedPages();

      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const response = await fetch(previewDataUrl, {
          credentials: 'include',
          cache: 'no-store'
        });

        if (!response.ok) {
          throw new Error(`Nao foi possivel carregar a pre-visualizacao do PDF (${response.status}).`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          if (process.env.NODE_ENV === 'development') {
            const preview = await response.text();
            console.error('PDF preview endpoint returned an unexpected response.', {
              status: response.status,
              contentType,
              body: preview.slice(0, 300)
            });
          }
          throw new Error('Nao foi possivel carregar a pre-visualizacao do PDF.');
        }

        const previewData = await response.json();
        if (!isPdfPreviewData(previewData)) {
          if (process.env.NODE_ENV === 'development') {
            console.error('PDF preview endpoint returned invalid JSON.', {
              status: response.status,
              contentType,
              body: previewData
            });
          }
          throw new Error('Nao foi possivel carregar a pre-visualizacao do PDF.');
        }

        loadingTask = pdfjs.getDocument({ data: base64ToBytes(previewData.base64) }) as PdfLoadingTask;
        const pdf = await loadingTask.promise;

        if (!isMounted || !pagesRef.current) return;

        setPageCount(pdf.numPages);
        const containerWidth = Math.max(320, pagesRef.current.clientWidth || 960);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (!isMounted || !pagesRef.current) return;

          const page = await pdf.getPage(pageNumber) as {
            getViewport: (options: { scale: number }) => { width: number; height: number };
            render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => RenderTask;
          };
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
            throw new Error('Nao foi possivel preparar o canvas de visualizacao.');
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
          renderTasksRef.current.push(renderTask);
          await renderTask.promise;
        }
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : 'Nao foi possivel carregar a pre-visualizacao do PDF.';
        setError(message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    renderPdf();

    return () => {
      isMounted = false;
      clearRenderedPages();
      if (loadingTask) {
        void loadingTask.destroy();
      }
    };
  }, [previewDataUrl, reloadKey]);

  const openUrl = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
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
              onClick={() => openUrl(downloadUrl)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1D35C9] px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-[#172AA3]"
            >
              <Download className="h-4 w-4" />
              Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => openUrl(pdfUrl)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir PDF direto
            </button>
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-6xl px-4 py-6">
        {isLoading && (
          <div className="mb-4 flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-[#1D35C9]" />
            Carregando pre-visualizacao do PDF...
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
    </main>
  );
}
