import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  blobToPdfData,
  createPdfAssetCache,
  createPdfPreviewRunController,
  hasPdfSignature
} from '../src/lib/pdf/pdf-preview-runtime.mjs';

const viewerPath = new URL('../src/components/pdf/pdf-preview-viewer.tsx', import.meta.url);
const downloadPath = new URL('../src/lib/download.ts', import.meta.url);

test('viewer resize and Strict Mode reuse a pending PDF; options and retry invalidate it', async () => {
  const cache = createPdfAssetCache(); let calls = 0;
  const fetchDocument = async () => { calls++; return { blob: new Blob(['%PDF-' + calls]), filename: 'PEDIDO.pdf' }; };
  const first = cache.load('/order/1', 0, fetchDocument);
  assert.equal(cache.load('/order/1', 0, fetchDocument), first);
  assert.equal(calls, 1);
  assert.equal((await first).blob, (await cache.load('/order/1', 0, fetchDocument)).blob);
  assert.notEqual(cache.load('/order/1?signature=1', 0, fetchDocument), first);
  cache.load('/order/1?signature=1', 1, fetchDocument);
  assert.equal(calls, 3);
  const otherViewer = createPdfAssetCache();
  otherViewer.load('/order/1', 0, fetchDocument); assert.equal(calls, 4);
});

test('failed PDF cache can be retried without reusing the rejected request', async () => {
  const cache = createPdfAssetCache();
  await assert.rejects(cache.load('/order/1', 0, async () => { throw new Error('offline'); }), /offline/);
  const result = await cache.load('/order/1', 1, async () => ({ filename: 'recovered.pdf' }));
  assert.equal(result.filename, 'recovered.pdf');
});

test('converts a valid PDF Blob into independent Uint8Array data', async () => {
  const blob = new Blob(['%PDF-preview'], { type: 'application/pdf' });
  const data = await blobToPdfData(blob);

  assert.ok(data instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(data), '%PDF-preview');
  assert.equal(hasPdfSignature(data), true);
});

test('starts a new generation and discards an older response', () => {
  const controller = createPdfPreviewRunController();
  const first = controller.begin();
  const second = controller.begin();

  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
});

test('cancels the previous loading task when a reload begins', () => {
  const controller = createPdfPreviewRunController();
  const first = controller.begin();
  let destroyed = 0;

  controller.setLoadingTask(first, {
    destroy() { destroyed += 1; },
    promise: Promise.resolve()
  });
  controller.begin();

  assert.equal(destroyed, 1);
});

test('cancels previous render tasks when a reload begins', () => {
  const controller = createPdfPreviewRunController();
  const first = controller.begin();
  let cancelled = 0;

  controller.addRenderTask(first, {
    cancel() { cancelled += 1; },
    promise: Promise.resolve()
  });
  controller.begin();

  assert.equal(cancelled, 1);
});

test('cleanup is safe when PDF.js tasks already throw during cancellation', () => {
  const controller = createPdfPreviewRunController();
  const generation = controller.begin();
  controller.setLoadingTask(generation, {
    destroy() { throw new Error('already destroyed'); },
    promise: Promise.resolve()
  });
  controller.addRenderTask(generation, {
    cancel() { throw new Error('already cancelled'); },
    promise: Promise.resolve()
  });

  assert.doesNotThrow(() => controller.cancel(generation));
});

test('Strict Mode cleanup cannot invalidate the next generation', () => {
  const controller = createPdfPreviewRunController();
  const first = controller.begin();
  controller.cancel(first);
  const second = controller.begin();

  assert.equal(controller.isCurrent(first), false);
  assert.equal(controller.isCurrent(second), true);
});

test('viewer gives PDF.js binary data and never a Blob URL', async () => {
  const viewerSource = await readFile(viewerPath, 'utf8');

  assert.match(viewerSource, /getDocument\(\{\s*data:/);
  assert.doesNotMatch(viewerSource, /getDocument\(objectUrl\)/);
  assert.doesNotMatch(viewerSource, /URL\.createObjectURL/);
  assert.match(viewerSource, /new Uint8Array\(pdfData\)/);
});

test('download and new-tab flows keep their independent Object URLs', async () => {
  const downloadSource = await readFile(downloadPath, 'utf8');
  const objectUrlCreations = downloadSource.match(/URL\.createObjectURL\(blob\)/g) || [];

  assert.equal(objectUrlCreations.length, 2);
  assert.match(downloadSource, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(downloadSource, /setTimeout\(\(\) => URL\.revokeObjectURL\(objectUrl\), 60_000\)/);
});

test('viewer keeps friendly error and retry states', async () => {
  const viewerSource = await readFile(viewerPath, 'utf8');

  assert.match(viewerSource, /Não foi possível carregar o documento/);
  assert.match(viewerSource, /setReloadKey\(\(value\) => value \+ 1\)/);
  assert.match(viewerSource, /clearRenderedPages\(\)/);
});
