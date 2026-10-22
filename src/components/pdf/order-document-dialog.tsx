'use client';

import { useEffect, useRef, useState } from 'react';
import { PdfPreviewViewer } from './pdf-preview-viewer';
import { fetchAuthenticatedPdf } from '@/lib/pdf/pdf-authenticated-client';
import { openPdfFromUrl } from '@/lib/download';

type Kind = 'order' | 'production' | 'label' | 'protocol';
const titles: Record<Kind, string> = { order: 'Via do Pedido', production: 'Ordem de Produção', label: 'Etiqueta · 100 × 50 mm', protocol: 'Protocolo de entrega' };

export function OrderDocumentDialog({ id, kind, onClose }: { id: string; kind: Kind; onClose: () => void }) {
  const [copies, setCopies] = useState('1');
  const [signature, setSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDivElement>(null);
  const url = `/api/pdf/order/${encodeURIComponent(id)}${kind === 'order' ? '' : `/${kind}`}?copies=${copies}&signature=${signature ? '1' : '0'}`;
  useEffect(() => {
    const focused = document.activeElement;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && dialog.current) {
        const nodes = Array.from(dialog.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]'));
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', keydown);
    return () => { window.removeEventListener('keydown', keydown); if (focused instanceof HTMLElement && focused.isConnected) focused.focus(); };
  }, [onClose]);
  async function downloadPng() {
    setBusy(true); setError('');
    let task: ReturnType<typeof import('pdfjs-dist')['getDocument']> | undefined;
    try {
      const { blob, filename } = await fetchAuthenticatedPdf(url);
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
      task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      const pdf = await task.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 300 / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas indisponível');
      await page.render({ canvasContext: context, viewport }).promise;
      const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG indisponível')), 'image/png'));
      const href = URL.createObjectURL(png);
      const link = document.createElement('a'); link.href = href; link.download = filename.replace(/\.pdf$/i, '.png'); document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch { setError('Não foi possível exportar a etiqueta. Tente novamente.'); }
    finally { if (task) await task.destroy(); setBusy(false); }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-5" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={titles[kind]} className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-xs">
        <strong className="mr-auto">{titles[kind]}</strong>
        {kind === 'protocol' && <label>Vias <select aria-label="Número de vias" value={copies} onChange={event => setCopies(event.target.value)} className="ml-2 rounded-lg border border-border bg-secondary py-2 pl-3"><option value="1">Uma via</option><option value="2">Duas vias</option></select></label>}
        {kind === 'order' && <label className="flex items-center gap-2"><input type="checkbox" checked={signature} onChange={event => setSignature(event.target.checked)} /> Assinatura opcional</label>}
        {kind === 'label' && <button disabled={busy} onClick={() => void downloadPng()} className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50">{busy ? 'Exportando…' : 'Baixar PNG · 300 dpi'}</button>}
        <button onClick={() => void openPdfFromUrl(url).catch(() => setError('Não foi possível abrir a impressão.'))} className="rounded-lg border border-border px-3 py-2">Abrir para impressão</button>
        <button onClick={onClose} aria-label="Fechar documento" className="rounded-lg border border-border px-3 py-2">Fechar</button>
        {error && <p role="alert" className="w-full text-destructive">{error}</p>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto"><PdfPreviewViewer embedded title={titles[kind]} previewDataUrl={url} downloadUrl={`${url}&download=1`} showHeaderActions height="100%" /></div>
    </div>
  </div>;
}
