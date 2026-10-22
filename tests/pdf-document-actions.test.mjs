import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { downloadPdfDocument, printPdfDocument } from '../src/lib/pdf/pdf-document-actions.mjs';

function browserFixture() {
  const calls = []; const events = new Map(); const timers = [];
  const anchor = { click() { calls.push(['download', this.download, this.href]); }, remove() {} };
  const popup = { opener: 'parent', addEventListener(type, cb) { events.set(type, cb); }, focus() {}, print() { calls.push(['print']); }, location: { replace(url) { calls.push(['navigate', url]); } } };
  const browser = {
    URL: { createObjectURL(blob) { calls.push(['blob', blob]); return 'blob:loaded-pdf'; }, revokeObjectURL(url) { calls.push(['revoke', url]); } },
    document: { createElement() { return anchor; }, body: { appendChild() {} } },
    open(...args) { calls.push(['open', ...args]); return popup; },
    setTimeout(cb) { timers.push(cb); }
  };
  return { browser, calls, events, timers, popup };
}

test('download uses the exact preview Blob and filename without opening or printing', () => {
  const f = browserFixture(); const blob = new Blob(['%PDF-exact-viewed-bytes']);
  downloadPdfDocument({ blob, filename: 'PEDIDO-PED-0035.pdf' }, f.browser);
  assert.equal(f.calls[0][1], blob);
  assert.deepEqual(f.calls[1], ['download', 'PEDIDO-PED-0035.pdf', 'blob:loaded-pdf']);
  assert.equal(f.calls.some(call => call[0] === 'open' || call[0] === 'print'), false);
  f.timers[0](); assert.deepEqual(f.calls.at(-1), ['revoke', 'blob:loaded-pdf']);
});

test('explicit print action opens the viewed PDF and prints only after its load', () => {
  const f = browserFixture(); const blob = new Blob(['%PDF-exact-print-bytes']);
  printPdfDocument({ blob }, f.browser);
  assert.equal(f.calls.find(call => call[0] === 'blob')[1], blob);
  assert.equal(f.popup.opener, null);
  assert.equal(f.calls.some(call => call[0] === 'print'), false);
  f.events.get('load')(); assert.deepEqual(f.calls.at(-1), ['print']);
  f.timers[0](); assert.deepEqual(f.calls.at(-1), ['revoke', 'blob:loaded-pdf']);
});

test('blocked print popup gives a recoverable error and creates no object URL', () => {
  const f = browserFixture(); f.browser.open = () => null;
  assert.throws(() => printPdfDocument({ blob: new Blob() }, f.browser), /blocked/);
  assert.equal(f.calls.length, 0);
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
  assert.match(viewer, /printPdfDocument\(currentDocument\)/);
  assert.match(viewer, /Carregando documento/);
  assert.match(viewer, /Não foi possível carregar o documento/);
  assert.match(viewer, /Tentar novamente/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.key === 'Tab'/);
});
