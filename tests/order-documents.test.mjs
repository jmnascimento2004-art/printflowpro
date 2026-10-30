import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import React from 'react';
import { renderToBuffer } from '@react-pdf/renderer';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { loadTypescript } from './helpers/load-typescript.mjs';

const { documentItem, documentDate, commercialSummary } = loadTypescript('src/lib/order-document-model.ts');
const { OrderPdfDocument } = loadTypescript('src/lib/pdf/order-pdf.tsx');
const { OrderOperationalDocument } = loadTypescript('src/lib/pdf/order-operational-pdf.tsx');
const { loadOrderPdfData, loadReceiptPdfData } = loadTypescript('src/lib/pdf/pdf-data.ts');
const { requireDocumentPermissions } = loadTypescript('src/lib/pdf/document-permissions.ts');
const { PdfAccessError } = await import('../src/lib/pdf/pdf-access.mjs');
const item = (index = 1) => ({ id: `i${index}`, product_name: `Produto ${String(index).padStart(3, '0')}`, quantity: 2, unit_price: 200, total_price: 100, outsourced: false,
  details: { width: 1.2, height: 0.8, notes: 'SEGREDO INTERNO', configuration_snapshot: { material: 'Lona', colors: '4x0', finishing: 'Ilhós', size: '1,20 × 0,80 m' }, pricing_snapshot: { custom_fields: [{ label: 'Cor', value: 'Azul' }, { label: 'Posição', value: { secret: true } }] } } });
const fixture = count => ({ company: { id: 'company', name: 'Gráfica de validação', document: '12.345.678/0001-90', phone: '(71) 3333-1234', email: 'contato@example.test', city: 'Salvador', state: 'BA' }, customer: { name: 'Cliente de validação', phone: '(71) 99999-1234', document: '123.456.789-00' }, settings: {},
  order: { id: 'o1', company_id: 'company', customer_name: 'Cliente de validação', number: 'PED-0027', status: 'producao', created_at: '2026-10-22T02:00:00Z', deadline: '2026-11-01', delivery_type: 'motoboy', delivery_address: 'Rua de validação, 123 · Salvador/BA', notes: 'SEGREDO INTERNO', total_amount: count * 100 + 10, paid_amount: 20, shipping_cost: 20, items: Array.from({ length: count }, (_, index) => item(index + 1)), additional_services: [] }, internalNotes: 'SEGREDO INTERNO', production: [] });

test('document configuration keeps metric units and excludes technical JSON / internal notes', () => {
  const result = documentItem(item());
  assert.equal(result.name, 'Produto 001'); assert.equal(result.unit, 50);
  assert.match(result.measures, /0,96 m²/); assert.match(result.configuration, /Cor: Azul/);
  assert.doesNotMatch(JSON.stringify(result), /SEGREDO|secret|\[object/);
  const linear = item(); linear.details = { length: 3.5 }; assert.match(documentItem(linear).measures, /3,50\s+m/);
  const legacy = item(); legacy.details.configuration_summary = 'Metro quadrado (m²) - 108cm x 202cm - 2 un - 4.36 m²'; delete legacy.details.configuration_snapshot; delete legacy.details.pricing_snapshot;
  assert.equal(documentItem(legacy).configuration, 'Metro quadrado (m²)');
});
test('persisted totals reconcile discounts/freight/services without repricing', () => {
  const data = fixture(1); data.order.additional_services = [{ total_price: 30 }];
  assert.deepEqual(commercialSummary(data.order), { items: 100, services: 30, freight: 20, discount: 40, adjustment: 0, total: 110 });
  data.order.total_amount = 160; assert.equal(commercialSummary(data.order).adjustment, 10);
});
test('document dates preserve date-only and Bahia midnight', () => { assert.equal(documentDate('2026-11-01'), '01/11/2026'); assert.equal(documentDate('2026-10-22T02:00:00Z'), '21/10/2026'); assert.equal(documentDate('invalid'), ''); });

test('delivery date matches the calendar field even for legacy midnight timestamps', async () => {
  for (const deadline of ['2026-10-31', '2026-10-31T00:00:00.000Z', '2026-10-31T12:00:00.000Z', '']) {
    const data = fixture(1); data.order.deadline = deadline;
    const bytes = await renderToBuffer(React.createElement(OrderPdfDocument, { data }));
    const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const pdf = await task.promise;
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map(item => item.str).join(' ');
    assert.ok(text.replace(/\s+/g, ' ').includes(`Data de entrega: ${deadline ? '31/10/2026' : '____/____/________'}`), text);
    assert.doesNotMatch(text, /30\/10\/2026/);
    await task.destroy();
  }
});
test('simple selected options keep names and exclude price deltas from document configuration', () => {
  const row = item(); row.details = { selected_options: [{ group_name: 'Acabamento', option_name: 'Laminação fosca', price_delta: 99 }] };
  const view = documentItem(row); assert.match(view.configuration, /Acabamento: Laminação fosca/); assert.doesNotMatch(view.configuration, /99|price_delta/);
  row.details = { configuration_summary: 'Papel: Couchê 300 g | Acabamento: Fosco' };
  assert.match(documentItem(row).configuration, /Couchê 300 g/);
});
test('high-volume order preserves four decimal places in unit value', async () => {
  const data = fixture(1); data.order.items[0].quantity = 10000; data.order.items[0].total_price = 10;
  const buffer = await renderToBuffer(React.createElement(OrderPdfDocument, { data }));
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }); const pdf = await task.promise;
  const content = await (await pdf.getPage(1)).getTextContent(); assert.match(content.items.map(item => item.str).join(' '), /0,001/); await task.destroy();
});

for (const count of [1, 10, 50]) {
  for (const kind of ['order', 'production', 'protocol']) test(`real ${kind} PDF with ${count} items keeps all rows and document boundaries`, async () => {
    const data = fixture(count);
    const document = kind === 'order' ? React.createElement(OrderPdfDocument, { data, signature: true }) : React.createElement(OrderOperationalDocument, { data, kind, copies: 1 });
    const buffer = await renderToBuffer(document);
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
    const pdf = await task.promise; let text = '';
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index); const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      assert.ok(pageText.includes('Gráfica de validação'), 'company identity repeats');
      assert.ok(pageText.includes('via PrintFlowPRO.'), 'footer repeats');
      assert.ok(pageText.includes(`${index} / ${pdf.numPages}`), 'page number is rendered');
      for (const token of content.items.filter(token => token.str.trim())) {
        assert.ok(token.transform[4] >= 30 && token.transform[4] <= 570, `horizontal clipping: ${token.str}`);
        assert.ok(token.transform[5] >= 15 && token.transform[5] <= 825, `vertical clipping: ${token.str}`);
      }
      text += pageText + '\n';
    }
    assert.match(text, /Produto 001/); assert.ok(text.includes(`Produto ${String(count).padStart(3, '0')}`));
    if (kind !== 'production') assert.doesNotMatch(text, /SEGREDO INTERNO/);
    if (kind !== 'order') assert.doesNotMatch(text, /R\$|UNITÁRIO|TOTAL DO PEDIDO/);
    if (kind === 'order') assert.match(text, /TOTAL DO PEDIDO/);
    assert.ok(pdf.numPages <= (count === 1 ? 1 : count === 10 ? 3 : 8), `unexpected page count ${pdf.numPages}`);
    if (process.env.ORDER_DOCUMENT_ARTIFACTS === '1') { await mkdir('.local-backup/order-documents-pdf', { recursive: true }); await writeFile(`.local-backup/order-documents-pdf/${kind}-${count}.pdf`, buffer); }
    await task.destroy();
  });
}

test('label uses user-confirmed 100×50mm; protocol produces two complete copies', async () => {
  const data = fixture(1);
  for (const kind of ['label', 'protocol']) {
    const buffer = await renderToBuffer(React.createElement(OrderOperationalDocument, { data, kind, copies: 2 }));
    const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }); const pdf = await task.promise;
    assert.equal(pdf.numPages, kind === 'label' ? 1 : 2);
    const first = await pdf.getPage(1);
    if (kind === 'label') { const box = first.getViewport({ scale: 1 }); assert.ok(Math.abs(box.width - 283.465) < 0.1); assert.ok(Math.abs(box.height - 141.732) < 0.1); }
    if (process.env.ORDER_DOCUMENT_ARTIFACTS === '1') await writeFile(`.local-backup/order-documents-pdf/${kind}.pdf`, buffer);
    await task.destroy();
  }
});

function client(tables) {
  const filters = [];
  return { filters, from(table) { const query = { select(columns) { filters.push([table, 'select', columns]); return this; }, eq(key, value) { filters.push([table, key, value]); return this; }, is() { return this; }, in() { return this; }, range() { return this; }, order() { return this; }, async maybeSingle() { return { data: tables[table] ?? null, error: null }; }, then(resolve) { resolve({ data: tables[table] ?? [], error: null }); } }; return query; } };
}
test('configured empty role list denies order document, including admin', async () => {
  const supabase = client({ role_permissions: [{ path: '/orders', roles: [] }] });
  await assert.rejects(requireDocumentPermissions({ supabase, access: { role: 'admin', companyId: 'company' } }), error => error instanceof PdfAccessError && error.status === 403);
});
test('sales can print own order values without financial permission; tenant is explicitly filtered', async () => {
  const data = fixture(1); const supabase = client({ role_permissions: [{ path: '/financial', roles: [] }], orders: data.order, order_items: data.order.items, companies: data.company, customers: data.customer, settings: {}, financial_transactions: [] });
  const result = await loadOrderPdfData('o1', { supabase, access: { role: 'vendas', companyId: 'company' } });
  assert.equal(result.order.notes, ''); assert.equal(result.order.items[0].details.notes, undefined);
  assert.ok(supabase.filters.some(row => row[0] === 'orders' && row[1] === 'company_id' && row[2] === 'company'));
  await assert.rejects(loadOrderPdfData('o1', { supabase, access: { role: 'vendas', companyId: 'company' } }, 'production'), error => error.status === 403);
});
test('direct receipt URL rejects pending transaction and requires finance permission', async () => {
  const data = fixture(1); const transaction = { id: 't', order_id: 'o1', company_id: 'company', type: 'receita', status: 'pendente', amount: 20 };
  // The loader's single transaction query and list query receive separate shapes.
  const supabase = client({ orders: data.order, order_items: data.order.items, companies: data.company, customers: data.customer, settings: {}, financial_transactions: [] });
  const original = supabase.from.bind(supabase);
  supabase.from = table => { const query = original(table); if (table === 'financial_transactions') query.maybeSingle = async () => ({ data: transaction, error: null }); return query; };
  assert.equal(await loadReceiptPdfData('t', { supabase, access: { role: 'admin', companyId: 'company' } }), null);
  await assert.rejects(loadReceiptPdfData('t', { supabase, access: { role: 'vendas', companyId: 'company' } }), error => error.status === 403);
});

test('receipt resolves an active legacy PED/ORD payment without order_id in the same tenant', async () => {
  const data = fixture(1); const transaction = { id: 'legacy-t', order_number: 'ORD-0027', type: 'receita', status: 'pago', amount: 20, paid_at: '2026-10-22T12:00:00Z', created_at: '2026-10-22T12:00:00Z' };
  const supabase = client({ orders: data.order, order_items: data.order.items, companies: data.company, customers: data.customer, settings: {}, financial_transactions: [transaction] });
  const original = supabase.from.bind(supabase); supabase.from = table => { const query = original(table); if (table === 'financial_transactions') query.maybeSingle = async () => ({ data: transaction, error: null }); return query; };
  const receipt = await loadReceiptPdfData('legacy-t', { supabase, access: { role: 'admin', companyId: 'company' } });
  assert.equal(receipt.order.id, 'o1'); assert.equal(receipt.accumulatedPaid, 20); assert.equal(receipt.pendingAmount, 90);
});

test('reversed receipts and explicit other-order IDs never inflate the order PDF', async () => {
  const data = fixture(1); data.order.paid_amount = 0;
  const transactions = [
    { id: 'reversed', order_id: 'o1', type: 'receita', status: 'pago', amount: 100, reversed_at: '2026-10-22' },
    { id: 'other', order_id: 'other-order', order_number: 'ORD-0027', type: 'receita', status: 'pago', amount: 100 },
    { id: 'legacy', order_number: 'ORD-0027', type: 'receita', status: 'pago', amount: 30 }
  ];
  const supabase = client({ orders: data.order, order_items: data.order.items, companies: data.company, customers: data.customer, settings: {}, financial_transactions: transactions });
  const result = await loadOrderPdfData('o1', { supabase, access: { role: 'admin', companyId: 'company' } });
  assert.equal(result.order.paid_amount, 30);
  assert.ok(supabase.filters.filter(row => row[0] === 'financial_transactions' && row[1] === 'select').every(row => row[2].includes('reversed_at')));
});

test('OP DTO omits order-level negotiation notes, including automatic discount amount', async () => {
  const data = fixture(1); data.order.notes = 'Ajuste comercial — desconto: R$ 50,00 | Motivo: Negociação interna';
  const supabase = client({ orders: data.order, order_items: data.order.items, companies: data.company, customers: data.customer, settings: {}, financial_transactions: [], production_queue: [] });
  const result = await loadOrderPdfData('o1', { supabase, access: { role: 'admin', companyId: 'company' } }, 'production');
  assert.equal(result.internalNotes, undefined); assert.equal(result.order.notes, '');
});

test('order payment loader pages beyond the REST limit and keeps tenant/order filters', async () => {
  const data = fixture(1); data.order.paid_amount = 0;
  const supabase = client({ orders: data.order, order_items: data.order.items, companies: data.company, customers: data.customer, settings: {} });
  const original = supabase.from.bind(supabase); const offsets = [];
  supabase.from = table => {
    const query = original(table); if (table !== 'financial_transactions') return query;
    let legacy = false, offset = 0;
    query.is = () => { legacy = true; return query; };
    query.range = (start) => { offset = start; offsets.push(start); return query; };
    query.then = resolve => resolve({ data: legacy ? [] : Array.from({ length: offset === 0 ? 1000 : 1 }, (_, index) => ({ id: `p${offset + index}`, order_id: 'o1', type: 'receita', status: 'pago', amount: 1 })), error: null });
    return query;
  };
  const result = await loadOrderPdfData('o1', { supabase, access: { role: 'admin', companyId: 'company' } });
  assert.equal(result.order.paid_amount, 1001); assert.ok(offsets.includes(1000));
  assert.ok(supabase.filters.some(row => row[0] === 'financial_transactions' && row[1] === 'order_id' && row[2] === 'o1'));
});

test('long commercial configurations flow across pages; long label stays on its physical size', async () => {
  const data = fixture(1); data.order.items[0].details.pricing_snapshot.custom_fields = [{ label: 'Configuração', value: 'Acabamento personalizado de validação. '.repeat(90) + 'FIM DA CONFIGURAÇÃO' }];
  const buffer = await renderToBuffer(React.createElement(OrderPdfDocument, { data }));
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }); const pdf = await task.promise;
  let text = ''; for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const content = await page.getTextContent(); text += content.items.map(item => item.str).join(' '); for (const item of content.items.filter(item => item.str.trim())) assert.ok(item.transform[5] > 15 && item.transform[5] < 825, item.str); }
  assert.ok(/FIM\s+DA\s+CONFIGURAÇÃO/.test(text), text.slice(-400)); await task.destroy();
  data.customer.name = 'Razão social muito longa '.repeat(10); data.order.delivery_address = 'Endereço muito longo com referência '.repeat(15);
  const label = await renderToBuffer(React.createElement(OrderOperationalDocument, { data, kind: 'label' }));
  const labelTask = getDocument({ data: new Uint8Array(label), useSystemFonts: true }); const labelPdf = await labelTask.promise; assert.equal(labelPdf.numPages, 1); await labelTask.destroy();
  if (process.env.ORDER_DOCUMENT_ARTIFACTS === '1') { await writeFile('.local-backup/order-documents-pdf/order-long.pdf', buffer); await writeFile('.local-backup/order-documents-pdf/label-long.pdf', label); }
});
