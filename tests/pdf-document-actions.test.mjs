import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { downloadPdfDocument, printPdfDocument } from '../src/lib/pdf/pdf-document-actions.mjs';
import { loadTypescript } from './helpers/load-typescript.mjs';

function browserFixture() {
  const calls = []; const events = new Map(); const timers = [];
  const anchor = { click() { calls.push(['download', this.download, this.href]); }, remove() {} };
  const frame = { style: {}, setAttribute() {}, remove() { calls.push(['remove-frame']); }, contentWindow: { addEventListener(type, cb) { events.set(type, cb); }, focus() {}, print() { calls.push(['print']); } } };
  const browser = {
    URL: { createObjectURL(blob) { calls.push(['blob', blob]); return 'blob:loaded-pdf'; }, revokeObjectURL(url) { calls.push(['revoke', url]); } },
    document: { createElement(tag) { return tag === 'iframe' ? frame : anchor; }, body: { appendChild() {} } },
    open() { throw new Error('Printing must not open a new tab'); },
    setTimeout(cb) { timers.push(cb); return timers.length; }, clearTimeout() {}
  };
  return { browser, calls, events, timers, frame };
}

test('initial shell CSP supports authenticated Blob printing after SPA navigation', async () => {
  const config = loadTypescript('next.config.ts').default;
  const headers = await config.headers();
  const shell = headers.find(rule => rule.source === '/:path*');
  const csp = shell.headers.find(header => header.key === 'Content-Security-Policy').value;
  const frames = csp.split(';').find(directive => directive.trim().startsWith('frame-src '));
  assert.match(frames, /\bblob:/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /form-action 'self'/);
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
  const ready = printPdfDocument({ blob }, f.browser);
  assert.equal(f.calls.find(call => call[0] === 'blob')[1], blob);
  assert.equal(f.frame.src, 'blob:loaded-pdf');
  assert.equal(f.calls.some(call => call[0] === 'print'), false);
  f.frame.onload(); await ready; assert.deepEqual(f.calls.at(-1), ['print']);
  f.events.get('afterprint')(); assert.deepEqual(f.calls.at(-1), ['revoke', 'blob:loaded-pdf']);
  f.events.get('afterprint')(); assert.equal(f.calls.filter(call => call[0] === 'revoke').length, 1);
});

test('unavailable print frame gives a recoverable error and releases the PDF', async () => {
  const f = browserFixture(); f.frame.contentWindow = null;
  const ready = printPdfDocument({ blob: new Blob() }, f.browser);
  f.frame.onload(); await assert.rejects(ready, /unavailable/);
  assert.deepEqual(f.calls.at(-1), ['revoke', 'blob:loaded-pdf']);
});

test('print load failure and timeout clean up without printing', async () => {
  for (const failure of ['error', 'timeout']) {
    const f = browserFixture(); const ready = printPdfDocument({ blob: new Blob() }, f.browser);
    if (failure === 'error') f.frame.onerror(); else f.timers[0]();
    await assert.rejects(ready);
    assert.equal(f.calls.some(call => call[0] === 'print'), false);
    assert.equal(f.calls.filter(call => call[0] === 'revoke').length, 1);
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
