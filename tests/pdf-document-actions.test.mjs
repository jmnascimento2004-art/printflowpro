import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { downloadPdfDocument, printPdfDocument, renderPdfPrintPages } from '../src/lib/pdf/pdf-document-actions.mjs';
import { loadTypescript } from './helpers/load-typescript.mjs';

function browserFixture() {
  const calls = []; const events = new Map(); const timers = [];
  const anchor = { click() { calls.push(['download', this.download, this.href]); }, remove() {} };
  const frame = { style: {}, contentDocument: { querySelectorAll() { return [{ complete: true, naturalWidth: 2480 }]; } }, setAttribute() {}, remove() { calls.push(['remove-frame']); }, contentWindow: { addEventListener(type, cb) { events.set(type, cb); }, focus() {}, print() { calls.push(['print']); } } };
  const browser = {
    URL: { createObjectURL(blob) { calls.push(['blob', blob]); return 'blob:loaded-pdf'; }, revokeObjectURL(url) { calls.push(['revoke', url]); } },
    document: { createElement(tag) { return tag === 'iframe' ? frame : anchor; }, body: { appendChild() {} } },
    open() { throw new Error('Printing must not open a new tab'); },
    setTimeout(cb) { timers.push(cb); return timers.length; }, clearTimeout() {}
  };
  const preparePages = blob => { calls.push(['prepare', blob]); return { pages: [{ url: 'blob:print-page', widthMm: 210, heightMm: 297 }], dispose() { calls.push(['dispose-pages']); } }; };
  return { browser, calls, events, timers, frame, preparePages };
}

test('printing keeps the original shell frame and object security restrictions', async () => {
  const config = loadTypescript('next.config.ts').default;
  const headers = await config.headers();
  const shell = headers.find(rule => rule.source === '/:path*');
  const csp = shell.headers.find(header => header.key === 'Content-Security-Policy').value;
  const frames = csp.split(';').find(directive => directive.trim().startsWith('frame-src '));
  assert.equal(frames.trim(), 'frame-src https:');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /form-action 'self'/);
});

function rasterFixture(failSecond = false) {
  const canvases = []; const revoked = []; const scales = []; let destroyed = 0; let received;
  const browser = { document: { createElement() { const canvas = { width: 0, height: 0, getContext() { return {}; }, toBlob(done) { done(new Blob(['png'])); } }; canvases.push(canvas); return canvas; } }, URL: { createObjectURL() { return `blob:raster-${canvases.length}`; }, revokeObjectURL(url) { revoked.push(url); } } };
  const renderer = { GlobalWorkerOptions: { workerSrc: 'existing-worker' }, getDocument({ data }) { received = data; return { promise: Promise.resolve({ numPages: 2, async getPage(index) { return { getViewport({ scale }) { scales.push(scale); return { width: 595.28 * scale, height: 841.89 * scale }; }, render() { return { promise: failSecond && index === 2 ? Promise.reject(new Error('broken page')) : Promise.resolve() }; } }; } }), async destroy() { destroyed++; } }; } };
  return { browser, renderer, canvases, revoked, scales, get destroyed() { return destroyed; }, get received() { return received; } };
}

test('print rasterizes every PDF page at 300 dpi with physical A4 dimensions and releases canvases', async () => {
  const f = rasterFixture(); const blob = new Blob(['%PDF-exact-source']);
  const prepared = await renderPdfPrintPages(blob, f.browser, f.renderer);
  assert.equal(new TextDecoder().decode(f.received), '%PDF-exact-source');
  assert.equal(prepared.pages.length, 2);
  assert.ok(prepared.pages.every(page => Math.abs(page.widthMm - 210) < 0.1 && Math.abs(page.heightMm - 297) < 0.1));
  assert.deepEqual(f.scales, [1, 300 / 72, 1, 300 / 72]);
  assert.ok(f.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
  assert.equal(f.destroyed, 1); prepared.dispose(); assert.equal(f.revoked.length, 2);
});

test('failed print rasterization releases previous pages and the PDF worker', async () => {
  const f = rasterFixture(true);
  await assert.rejects(renderPdfPrintPages(new Blob(['%PDF-source']), f.browser, f.renderer), /broken page/);
  assert.equal(f.revoked.length, 1); assert.equal(f.destroyed, 1);
  assert.ok(f.canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('download uses the exact preview Blob and filename without opening or printing', () => {
  const f = browserFixture(); const blob = new Blob(['%PDF-exact-viewed-bytes']);
  downloadPdfDocument({ blob, filename: 'PEDIDO-PED-0035.pdf' }, f.browser);
  assert.equal(f.calls[0][1], blob);
  assert.deepEqual(f.calls[1], ['download', 'PEDIDO-PED-0035.pdf', 'blob:loaded-pdf']);
  assert.equal(f.calls.some(call => call[0] === 'open' || call[0] === 'print'), false);
  f.timers[0](); assert.deepEqual(f.calls.at(-1), ['revoke', 'blob:loaded-pdf']);
});

test('explicit print action embeds the viewed PDF and prints only after its load', async () => {
  const f = browserFixture(); const blob = new Blob(['%PDF-exact-print-bytes']);
  const ready = printPdfDocument({ blob }, f.browser, f.preparePages); await Promise.resolve();
  assert.equal(f.calls.find(call => call[0] === 'prepare')[1], blob);
  const html = f.frame.srcdoc;
  assert.match(html, /@page\{size:210mm 297mm/); assert.match(html, /src="blob:print-page"/);
  assert.equal(f.frame.src, undefined);
  assert.equal(f.calls.some(call => call[0] === 'print'), false);
  f.frame.onload(); await ready; assert.deepEqual(f.calls.at(-1), ['print']);
  f.events.get('afterprint')(); assert.equal(f.calls.some(call => call[0] === 'remove-frame'), false);
  f.timers[1](); assert.deepEqual(f.calls.at(-1), ['dispose-pages']);
  f.timers[1](); assert.equal(f.calls.filter(call => call[0] === 'dispose-pages').length, 1);
  assert.equal(f.frame.onload, null); assert.equal(f.frame.onerror, null);
});

test('canceling the native print dialog does not dispose its frame while print is on the stack', async () => {
  const f = browserFixture();
  f.frame.contentWindow.print = () => {
    f.events.get('afterprint')();
    assert.equal(f.calls.some(call => call[0] === 'remove-frame'), false);
  };
  const ready = printPdfDocument({ blob: new Blob() }, f.browser, f.preparePages); await Promise.resolve();
  f.frame.onload(); await ready;
  f.timers[1]();
  assert.equal(f.calls.filter(call => call[0] === 'remove-frame').length, 1);
});

test('unavailable print frame gives a recoverable error and releases the PDF', async () => {
  const f = browserFixture(); f.frame.contentWindow = null;
  const ready = printPdfDocument({ blob: new Blob() }, f.browser, f.preparePages); await Promise.resolve();
  f.frame.onload(); await assert.rejects(ready, /unavailable/);
  assert.deepEqual(f.calls.at(-1), ['dispose-pages']);
});

test('print load failure and timeout clean up without printing', async () => {
  for (const failure of ['error', 'timeout']) {
    const f = browserFixture(); const ready = printPdfDocument({ blob: new Blob() }, f.browser, f.preparePages); await Promise.resolve();
    if (failure === 'error') f.frame.onerror(); else f.timers[0]();
    await assert.rejects(ready);
    assert.equal(f.calls.some(call => call[0] === 'print'), false);
    assert.equal(f.calls.filter(call => call[0] === 'dispose-pages').length, 1);
  }
});

test('all order view entry points use the internal dialog and no automatic print', async () => {
  const orders = await readFile(new URL('../src/app/(dashboard)/orders/page.tsx', import.meta.url), 'utf8');
  const dialog = await readFile(new URL('../src/components/pdf/order-document-dialog.tsx', import.meta.url), 'utf8');
  const viewer = await readFile(new URL('../src/components/pdf/pdf-preview-viewer.tsx', import.meta.url), 'utf8');
  assert.match(orders, /handleViewOrderDocument[\s\S]*?setDocumentKind\('order'\)/);
  assert.doesNotMatch(orders + dialog, /window\.print|openPdfFromUrl|handlePrintOrderPdf/);
  assert.match(dialog, /PdfPreviewViewer embedded allowPrint onClose/);
  assert.doesNotMatch(dialog, /fetchAuthenticatedPdf/);
  assert.match(viewer, /onClick=\{handlePrint\}/);
  assert.match(viewer, /downloadPdfDocument\(currentDocument\)/);
  assert.match(viewer, /await printPdfDocument\(currentDocument\)/);
  assert.match(viewer, /Carregando documento/);
  assert.match(viewer, /Não foi possível carregar o documento/);
  assert.match(viewer, /Tentar novamente/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.key === 'Tab'/);
});
