import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import React from 'react';
import { Document, Page, renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  PDF_PRODUCT_COLUMN_WIDTHS,
  PdfProductTable
} from '../src/lib/pdf/pdf-product-table.mjs';

function createItem(index, overrides = {}) {
  return {
    id: `item-${index}`,
    product_name: `PRODUTO MODELO ${String(index).padStart(3, '0')}`,
    quantity: index,
    unit_price: 999,
    total_price: index * 194.4,
    details: { width: 1.8, height: 1.2 },
    ...overrides
  };
}

async function renderTable(items) {
  const document = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4', style: { padding: 32, fontFamily: 'Helvetica', fontSize: 9 } },
      React.createElement(PdfProductTable, { items })
    )
  );
  const buffer = await renderToBuffer(document);
  const task = getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    verbosity: 0,
    standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href
  });
  const pdf = await task.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ({
      text: item.str.replace(/\s+/g, ' ').trim(),
      x: Number(item.transform[4].toFixed(2)),
      y: Number(item.transform[5].toFixed(2)),
      width: Number(item.width.toFixed(2))
    })).filter((item) => item.text));
  }

  await task.destroy();
  return { buffer, pages };
}

test('uses measured single-line column proportions', () => {
  assert.deepEqual(PDF_PRODUCT_COLUMN_WIDTHS, {
    quantity: '8%',
    description: '46%',
    size: '16%',
    unit: '15%',
    total: '15%'
  });
});

test('renders every product cell on one visual line', async () => {
  const descriptions = [
    'BANNER PERSONALIZADO',
    'RÓTULO TEMPERO ALHO FRITO',
    'ADESIVO VINIL IMPRESSO E RECORTADO PERSONALIZADO',
    'CARTÃO DE VISITA COUCHÊ 250G VERNIZ TOTAL FRENTE',
    'PAPEL A4',
    'ADESIVO 3M',
    'PRODUTO MODELO 2026'
  ];
  const items = descriptions.map((product_name, index) => createItem(index + 1, {
    product_name,
    details: index === descriptions.length - 1 ? {} : { width: 1.8, height: 1.2 }
  }));
  const { buffer, pages } = await renderTable(items);

  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.equal(pages.length, 1);
  for (const description of descriptions) {
    assert.equal(pages[0].filter((item) => item.text === description).length, 1, description);
  }
  for (const description of descriptions.slice(0, -1)) {
    const row = pages[0].find((item) => item.text === description);
    const sameLine = pages[0]
      .filter((item) => Math.abs(item.y - row.y) < 1)
      .map((item) => item.text);
    assert.ok(sameLine.includes('180 × 120'), `${description} dimension moved off its row`);
    assert.ok(sameLine.includes('cm'), `${description} unit moved off its row`);
    assert.ok(sameLine.some((text) => text.startsWith('R$ ')), `${description} currency moved off its row`);

    const positionedLine = pages[0].filter((item) => Math.abs(item.y - row.y) < 1);
    const dimension = positionedLine.find((item) => item.text === '180 × 120');
    const currencies = positionedLine.filter((item) => item.text.startsWith('R$ ')).sort((a, b) => a.x - b.x);
    assert.ok(row.x < dimension.x);
    assert.equal(currencies.length, 2);
    assert.ok(dimension.x < currencies[0].x && currencies[0].x < currencies[1].x);
    assert.ok(currencies[1].x + currencies[1].width <= 563.5, `${description} total left the table`);
  }
  assert.ok(pages[0].some((item) => item.text === '—'));
  assert.ok(pages[0].some((item) => item.text === 'R$ 194,40'));
});

test('keeps rows indivisible across multiple pages', async () => {
  const items = Array.from({ length: 70 }, (_, index) => createItem(index + 1));
  const { pages } = await renderTable(items);

  assert.ok(pages.length > 1);
  for (const item of items) {
    const description = item.product_name;
    const matches = pages.flatMap((page, pageIndex) => page
      .filter((entry) => entry.text === description)
      .map((entry) => ({ ...entry, pageIndex })));
    assert.equal(matches.length, 1, description);
    const row = matches[0];
    const sameLine = pages[row.pageIndex]
      .filter((entry) => Math.abs(entry.y - row.y) < 1)
      .map((entry) => entry.text);
    assert.ok(sameLine.includes('180 × 120'), `${description} dimension moved off its row`);
    assert.ok(sameLine.includes('cm'), `${description} unit moved off its row`);
    assert.ok(sameLine.some((text) => text.startsWith('R$ ')), `${description} currency moved off its row`);

    const positionedLine = pages[row.pageIndex].filter((entry) => Math.abs(entry.y - row.y) < 1);
    const currencies = positionedLine.filter((entry) => entry.text.startsWith('R$ ')).sort((a, b) => a.x - b.x);
    assert.equal(currencies.length, 2, `${description} lost a currency cell`);
    assert.ok(currencies[0].x < currencies[1].x, `${description} currency cells overlapped`);
    assert.ok(currencies[1].x + currencies[1].width <= 563.5, `${description} total left the table`);
  }
});

test('quote, order and receipt use the same non-wrapping table component', async () => {
  const files = ['quote-pdf.tsx', 'order-pdf.tsx', 'receipt-pdf.tsx'];
  for (const file of files) {
    const source = await readFile(new URL(`../src/lib/pdf/${file}`, import.meta.url), 'utf8');
    assert.match(source, /import \{ PdfProductTable \}/);
    assert.match(source, /<PdfProductTable items=/);
  }

  const sharedSource = await readFile(new URL('../src/lib/pdf/pdf-product-table.mjs', import.meta.url), 'utf8');
  assert.match(sharedSource, /style: styles\.row, wrap: false/);
  assert.match(sharedSource, /cell\(viewModel\.size,/);
  assert.doesNotMatch(sharedSource, /cell\(['"]cm['"]/);
  assert.doesNotMatch(sharedSource, /maxLines|textOverflow|ellipsis/);
});
