import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import test from 'node:test';
import React from 'react';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import ts from 'typescript';
import {
  getItemDeliveryTimeSnapshot,
  resolveOrderDeliveryTime
} from '../src/lib/order-delivery-time.mjs';

async function compile(path, requireMap = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'exports', 'module', code)((name) => {
    if (name in requireMap) return requireMap[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module.exports, module);
  return module.exports;
}

const pricing = await compile('../src/lib/pricing.ts', { './dummy-data': {} });
const quotesPage = await readFile(new URL('../src/app/(dashboard)/quotes/page.tsx', import.meta.url), 'utf8');
const orderPdfSource = await readFile(new URL('../src/lib/pdf/order-pdf.tsx', import.meta.url), 'utf8');
const pdfDataSource = await readFile(new URL('../src/lib/pdf/pdf-data.ts', import.meta.url), 'utf8');
const orderMigrationSource = await readFile(new URL('../supabase/migrations/20260712235854_orders_atomic_numbering.sql', import.meta.url), 'utf8');

const itemWithDays = (days) => ({
  details: {
    production_time: `${days} dias úteis`,
    configuration_snapshot: {
      production_time: `${days} dias úteis`,
      production_time_source: 'matrix'
    },
    pricing_snapshot: { production_time: `${days} dias úteis` }
  }
});

test('selected matrix tier supplies price and delivery time from the same configuration', () => {
  const result = pricing.resolveProductPrice({
    pricing_type: 'unidade',
    sales_price: 99,
    pricing_details: {
      configurator_options: {
        variant_pricing_matrix: [{
          id: 'row-a',
          material: 'Sulfit 75g',
          size: '20x30cm',
          colors: '4x4',
          finishing: 'REFILE',
          active: true,
          tiers: [{ quantity: 10, unit_price: 25, total_price: 250, production_time: '3 dias úteis' }]
        }]
      }
    }
  }, {
    quantity: 10,
    customOptions: {
      variantSelection: { material: 'Sulfit 75g', size: '20x30cm', colors: '4x4', finishing: 'REFILE' }
    }
  });

  assert.equal(result.matchedMatrixRow?.id, 'row-a');
  assert.equal(result.matchedTier?.min_qty, 10);
  assert.equal(result.unitPrice, 25);
  assert.equal(result.totalPrice, 250);
  assert.equal(result.productionTime, '3 dias úteis');
  assert.equal(result.productionTimeSource, 'matrix');
});

test('quote item records delivery time in both commercial snapshots', () => {
  assert.match(quotesPage, /configuration_snapshot: configurationSnapshot/);
  assert.match(quotesPage, /pricing_snapshot:\s*\{[\s\S]*?production_time: productionTime/);
  assert.match(quotesPage, /production_time_source: productionTimeSource/);
});

test('quote approval preserves item details when creating order items', () => {
  assert.match(orderMigrationSource, /qi\.quantity, qi\.unit_price, qi\.total_price, qi\.details/);
});

test('historical delivery time remains independent from later product changes', () => {
  const item = itemWithDays(3);
  const product = { delivery_time: '3 dias úteis' };
  assert.equal(getItemDeliveryTimeSnapshot(item).label, '3 dias úteis');
  product.delivery_time = '12 dias úteis';
  assert.equal(getItemDeliveryTimeSnapshot(item).label, '3 dias úteis');
});

test('one item uses its contracted delivery time and multiple items use the longest', () => {
  assert.deepEqual(resolveOrderDeliveryTime([itemWithDays(3)]), {
    label: '3 dias úteis', businessDays: 3, source: 'item_snapshot', isComplete: true
  });
  assert.deepEqual(resolveOrderDeliveryTime([itemWithDays(2), itemWithDays(5)]), {
    label: '5 dias úteis', businessDays: 5, source: 'item_snapshot', isComplete: true
  });
});

test('missing delivery time fails closed without inventing a date', () => {
  assert.deepEqual(resolveOrderDeliveryTime([itemWithDays(3), { details: {} }]), {
    label: 'Prazo sob consulta', businessDays: null, source: 'fallback', isComplete: false
  });
});

test('order PDF reads item snapshots and does not query the current product', () => {
  assert.match(orderPdfSource, /resolveOrderDeliveryTime\(data\.order\.items\)/);
  assert.match(orderPdfSource, /Prazo de entrega: \{deliveryTime\.label\}/);
  assert.doesNotMatch(orderPdfSource, /formatPdfDate\(data\.order\.deadline\)/);
  assert.doesNotMatch(pdfDataSource, /from\(['"]products['"]\)/);
});

test('renders the contracted delivery time in a local PDF', async () => {
  const { OrderPdfDocument } = await compile('../src/lib/pdf/order-pdf.tsx', {
    react: React,
    '@react-pdf/renderer': { Document, Page, Text, View, Image: () => null, StyleSheet: { create: (styles) => styles } },
    '@/lib/order-number': { formatOrderDisplayNumber: () => 'PED-001' },
    '@/lib/order-status': { normalizeOrderOperationalStatus: () => 'producao' },
    '@/lib/order-delivery-time.mjs': { resolveOrderDeliveryTime },
    '@/lib/pdf/pdf-formatters': {
      buildVisibleCompanyAddress: () => '',
      buildCustomerAddress: () => '',
      formatPdfCurrency: (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`,
      formatPdfDate: () => '11/08/2026',
      getAdditionalServicesTotal: () => 0,
      getPdfFooterText: () => 'PrintFlowPRO',
      getPdfLogoUrl: () => '',
      normalizePdfText: (value) => String(value || '')
    },
    '@/lib/pdf/pdf-product-table.mjs': {
      PdfProductTable: ({ items }) => React.createElement(View, null, items.map((item, index) => React.createElement(Text, { key: index }, item.product_name)))
    }
  });

  const buffer = await renderToBuffer(React.createElement(OrderPdfDocument, {
    data: {
      company: { name: 'CibelePRINT' },
      customer: { name: 'Cliente teste' },
      settings: {},
      order: {
        number: '1',
        created_at: '2026-08-11T12:00:00Z',
        deadline: '2026-08-16T12:00:00Z',
        customer_name: 'Cliente teste',
        status: 'producao',
        payment_status: 'pendente',
        total_amount: 250,
        paid_amount: 0,
        shipping_cost: 0,
        notes: '',
        items: [
          { ...itemWithDays(2), product_name: 'Produto A', total_price: 100 },
          { ...itemWithDays(5), product_name: 'Produto B', total_price: 150 }
        ]
      }
    }
  }));
  if (process.env.PDF_SMOKE_OUTPUT) {
    await mkdir(dirname(process.env.PDF_SMOKE_OUTPUT), { recursive: true });
    await writeFile(process.env.PDF_SMOKE_OUTPUT, buffer);
  }
  const task = getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    verbosity: 0,
    standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href
  });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map((item) => item.str).join(' ');
  await task.destroy();

  assert.match(text, /Prazo de entrega:\s+5 dias úteis/);
  assert.doesNotMatch(text, /Prazo: 16\/08\/2026/);
});
