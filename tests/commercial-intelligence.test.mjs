import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', 'require', code)(module.exports, module, name => { assert.ok(dependencies[name], name); return dependencies[name]; });
  return module.exports;
}
const numbers = await compile('../src/lib/order-number.ts');
const statuses = await compile('../src/lib/order-status.ts');
const finance = await compile('../src/lib/finance-rules.ts', { '@/lib/order-number': numbers, '@/lib/order-status': statuses });
const model = await compile('../src/lib/commercial-intelligence.ts', { './finance-rules': finance, './order-status': statuses, './order-number': numbers });
const pricing = await compile('../src/lib/pricing.ts');
const assistant = await compile('../src/lib/quote-text-assistant.ts', { './pricing': pricing });
const permissions = await compile('../src/lib/module-permissions.ts');
const now = new Date('2026-10-21T15:00:00Z');
const customer = (id, extra = {}) => ({ id, company_id: 'a', name: id, document: '', tags: [], created_at: '2026-10-20T12:00:00Z', ...extra });
const order = (id, extra = {}) => ({ id, company_id: 'a', number: id, customer_id: 'c1', customer_name: 'Customer', status: 'producao', total_amount: 100, paid_amount: 0, created_at: '2026-10-21T10:00:00Z', items: [], ...extra });
const payment = (id, extra = {}) => ({ id, company_id: 'a', order_id: 'o1', type: 'receita', status: 'pago', amount: 40, due_date: '2026-10-21', created_at: '2026-10-21T10:00:00Z', ...extra });
const empty = { orders: [], customers: [], quotes: [], financial: [], production: [] };

test('commercial dates preserve civil dates and convert timestamps at Bahia midnight', () => {
  assert.equal(model.commercialDate('2026-10-21'), '2026-10-21');
  assert.equal(model.commercialDate('2026-11-01'), '2026-11-01');
  assert.equal(model.commercialDate('2026-10-21T01:00:00Z'), '2026-10-20');
  assert.equal(model.commercialDate('2026-10-21T03:00:00Z'), '2026-10-21');
  assert.equal(model.periodStart('7', now), '2026-10-15');
  assert.equal(model.periodStart('year', now), '2026-01-01');
});
test('overview uses canonical paid cash, deduplication and balances; cancelled orders excluded', () => {
  const orders = [order('o1'), order('cancel', { status: 'cancelado', total_amount: 900 })];
  const p = payment('p1');
  const financial = [p, p, payment('cancel-p', { order_id: 'cancel', amount: 900 }), payment('pending', { status: 'pendente', amount: 60, due_date: '2026-10-20' }), payment('expense', { type: 'despesa', amount: 15, order_id: null })];
  const result = model.buildCommercialOverview({ ...empty, orders, financial }, 7, now);
  assert.equal(result.incomeToday, 40); assert.equal(result.receivable, 60);
  assert.equal(result.ordersToday, 1); assert.equal(result.overdueReceivables, 1);
  assert.equal(result.chart.at(-1).expense, 15); assert.equal(result.chart.at(-1).income, 40);
  assert.equal(result.receivable, finance.calculateAccountsReceivable(orders, financial));
});
test('deadlines today are not late; production uses queue and excludes completed/cancelled', () => {
  const orders = [order('today', { deadline: '2026-10-21' }), order('late', { deadline: '2026-10-20' }), order('done', { deadline: '2026-10-19', status: 'entregue' }), order('cancel', { status: 'cancelado' })];
  const production = [{ order_id: 'today', status: 'fila' }, { order_id: 'late', status: 'producao' }, { order_id: 'done', status: 'concluido' }, { order_id: 'cancel', status: 'producao' }];
  const result = model.buildCommercialOverview({ ...empty, orders, production }, 30, now);
  assert.equal(result.delayedCount, 1); assert.equal(result.productionCount, 2); assert.equal(result.chart.length, 30);
});
test('bestsellers count catalog identities without merging unrelated manual items', () => {
  const items=[{product_id:'',product_name:'Manual A',quantity:2,total_price:200},{product_id:'',product_name:'Manual B',quantity:1,total_price:900},{product_id:'real',product_name:'Banner',quantity:2,total_price:42}];
  const result=model.buildCommercialOverview({...empty,orders:[order('o1',{items})]},7,now);
  assert.deepEqual(result.bestsellers,[{id:'real',name:'Banner',quantity:2,total:42}]);
});
test('ranking aggregates by ID, stable ties, zero purchases, cancellation and inclusive period', () => {
  const customers = [customer('c3'), customer('c2'), customer('c1')];
  const orders = [order('1'), order('2', { customer_id: 'c2', total_amount: 50 }), order('3', { customer_id: 'c2', total_amount: 50 }), order('4', { customer_id: 'c3', status: 'cancelado', total_amount: 999 }), order('5', { created_at: '2026-09-21T12:00:00Z' })];
  const result = model.buildCustomerRanking(customers, orders, '30', now);
  assert.deepEqual(result.map(row => row.id), ['c2', 'c1', 'c3']);
  assert.equal(result[0].total, 100); assert.equal(result[0].count, 2); assert.equal(result[0].average, 50);
  assert.equal(result[2].lastPurchase, null); assert.equal(result[2].average, 0);
  assert.equal(model.buildCustomerRanking(customers, orders, 'all', now)[0].total, 200);
  assert.deepEqual(model.buildCustomerRanking([], orders, '90', now), []);
  assert.deepEqual(model.buildCustomerRanking([customer('b'),customer('a')], [], 'year', now).map(row=>row.id), ['a','b']);
});
test('tags support custom create/rename/remove, case deduplication and empty removal', () => {
  assert.deepEqual(model.normalizeCustomerTags(' VIP, Agência, vip, , Parceiro '), ['vip', 'Agência', 'Parceiro']);
  assert.deepEqual(model.normalizeCustomerTags('Revenda, Agência'), ['Revenda', 'Agência']);
  assert.deepEqual(model.normalizeCustomerTags(''), []);
});
const banner = { id: 'banner', name: 'Banner m²', pricing_type: 'm2', sales_price: 70, pricing_details: { configurator_options: { min_area: .3 } } };
const cards = { id: 'cards', name: 'Cartão de visita', pricing_type: 'unidade', sales_price: 1, volume_pricing: [{ min_qty: 500, price: .5 }] };
const sticker = { id: 'stickers', name: 'Adesivo', pricing_type: 'm2', sales_price: 50 };
test('text fixtures split conjunction without splitting frente e verso, preserving quantities', () => {
  const parsed = assistant.interpretQuoteText('Preciso de 2 banners 1,20 x 0,80 e 500 cartões frente e verso', [banner, cards], []);
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].quantity, 2); assert.equal(parsed.items[0].width, 1.2); assert.equal(parsed.items[0].height, .8);
  assert.equal(parsed.items[1].quantity, 500); assert.equal(parsed.items[1].productId, 'cards');
  assert.equal(parsed.items[1].text, '500 cartões frente e verso');
});
test('unitless 5x5 requires human review, explicit cm and mixed units convert correctly', () => {
  const ambiguous = assistant.interpretQuoteText('1000 adesivos 5x5', [sticker], []).items[0];
  assert.equal(ambiguous.quantity, 1000); assert.equal(ambiguous.measureNeedsReview, true); assert.equal(ambiguous.confidence, 'Baixa');
  const cm = assistant.interpretQuoteText('1000 adesivos 5x5 cm', [sticker], []).items[0];
  assert.equal(cm.width, .05); assert.equal(cm.height, .05);
  const mixed = assistant.interpretQuoteText('2 banners 1 m x 80 cm', [banner], []).items[0];
  assert.equal(mixed.width, 1); assert.equal(mixed.height, .8); assert.equal(mixed.quantity, 2);
});
test('unknown and ambiguous products never invent products; unique customer match only', () => {
  const result = assistant.interpretQuoteText('Cliente: Ana; 2 banners 1x1; 3 foguetes', [banner, { ...banner, id: 'b2', name: 'Banner padrão' }], [customer('ana', { name: 'Ana' })]);
  assert.equal(result.customerId, 'ana'); assert.equal(result.items[0].productId, ''); assert.equal(result.items[0].candidateIds.length, 2);
  assert.equal(result.items[1].productId, ''); assert.deepEqual(result.unrecognized, ['3 foguetes']);
  assert.equal(assistant.interpretQuoteText('Cliente: Ana; 1 banner', [banner], [customer('1',{name:'Ana'}),customer('2',{name:'Ana'})]).customerId, '');
  assert.equal(assistant.interpretQuoteText(Array(21).fill('1 banner').join(';'), [banner], []).truncated, true);
});
test('assistant canonical pricing preserves floor, physical measures, quantity and ignores quoted price', () => {
  const intent = assistant.interpretQuoteText('2 banners 0,40 x 0,50 por R$ 1', [banner], []).items[0];
  const item = assistant.buildAssistedQuoteItem(banner, intent, intent.text);
  assert.equal(item.quantity, 2); assert.equal(item.total_price, 42); assert.equal(item.unit_price, 21);
  assert.equal(item.details.width, .4); assert.equal(item.details.pricing_snapshot.area, .2); assert.equal(item.details.pricing_snapshot.billable_area, .3);
  assert.equal(assistant.buildAssistedQuoteItem(banner, {quantity:3,width:1.2,height:.8}, '').total_price, 201.6);
  assert.equal(assistant.buildAssistedQuoteItem(cards, {quantity:500}, '').total_price, 250);
  assert.throws(()=>assistant.buildAssistedQuoteItem(banner, {quantity:1}, ''), /medidas/);
  assert.throws(()=>assistant.buildAssistedQuoteItem(banner, {quantity:1.5,width:1,height:1}, ''), /quantidade/);
});
test('linear measurement does not become quantity and matrix needs registered combination', () => {
  const linear = {id:'linear',name:'Faixa',pricing_type:'linear',sales_price:10};
  const intent = assistant.interpretQuoteText('2 faixas 2,5 metros', [linear], []).items[0];
  assert.equal(intent.quantity, 2); assert.equal(intent.length, 2.5);
  const item = assistant.buildAssistedQuoteItem(linear, intent, '');
  assert.equal(item.total_price,50); assert.equal(item.details.width,undefined);
  const matrix={...cards,pricing_details:{configurator_options:{variant_pricing_matrix:[{id:'r',material:'Paper',size:'A4',colors:'4x4',finishing:'Cut',tiers:[{quantity:500,unit_price:1.5,total_price:750}]}]}}};
  assert.throws(()=>assistant.buildAssistedQuoteItem(matrix,{quantity:500},''));
  const config={quantity:500,customOptions:{variantSelection:{material:'Paper',size:'A4',colors:'4x4',finishing:'Cut'}}};
  const result=assistant.buildAssistedQuoteItem(matrix,config,'frente e verso');
  assert.equal(result.total_price,750); assert.equal(result.details.configuration_snapshot.quantity_tier,500);
  assert.equal(result.details.configuration_snapshot.colors,'4x4');
});

async function requestRoute({ role = 'admin', companyId = 'a', rules = [], datasets = {}, maxRows = 1000, authError = null } = {}, query = '') {
  const calls = [];
  const client = { from(table) {
    const state = {table};
    const builder = {
      select() { return builder; }, eq(field,value) { state[field]=value; return builder; }, order() { return builder; }, range(start,end) { state.start=start; state.end=end; return builder; },
      then(resolve) {
        calls.push({...state});
        const all = (table === 'role_permissions' ? rules : datasets[table] || []).filter(row => row.company_id === state.company_id);
        return Promise.resolve({data:all.slice(state.start || 0, Math.min((state.start || 0)+maxRows, (state.end ?? Infinity)+1)),count:all.length,error:null}).then(resolve);
      }
    }; return builder;
  }};
  const route = await compile('../src/app/api/commercial-intelligence/route.ts', {
    'next/server': { NextResponse: { json: (body, options) => ({body,...options}) } },
    '@/lib/pdf/pdf-server-auth': { authenticatePdfRequest: async()=>{if(authError) throw authError; return {role,companyId};}, getAuthenticatedPdfClient: ()=>client },
    '@/lib/module-permissions': permissions, '@/lib/commercial-intelligence': model
  });
  return { response: await route.GET(new Request('https://example.test/api/commercial-intelligence'+query)), calls };
}
test('API rejects unauthenticated/inactive sessions and configured module denial', async () => {
  for (const status of [401,403]) assert.equal((await requestRoute({authError:{status}})).response.status,status);
  const denied = await requestRoute({rules:[{company_id:'a',path:'/dashboard',roles:[]}]});
  assert.equal(denied.response.status,403); assert.equal(denied.calls.length,1);
  assert.equal((await requestRoute({rules:[{company_id:'a',path:'/orders',roles:[]}]},'?mode=ranking')).response.status,403);
  assert.equal((await requestRoute({},'?period=999')).response.status,400);
});
test('API derives tenant from auth; paginates capped responses, no N queries per customer', async () => {
  const customers=Array.from({length:1003},(_,i)=>customer(String(i)));
  customers.push(customer('foreign',{company_id:'b',name:'SECRET'}));
  const {response,calls}=await requestRoute({datasets:{customers},maxRows:500},'?mode=ranking&period=all&company_id=b');
  assert.equal(response.body.ranking.length,1003); assert.ok(!JSON.stringify(response.body).includes('SECRET'));
  assert.ok(calls.every(call=>call.company_id==='a'));
  assert.equal(calls.filter(call=>call.table==='customers').length,3);
  assert.equal(response.headers['Cache-Control'],'private, no-store');
});
test('API does not query or return financial values without financial permission', async () => {
  const {response,calls}=await requestRoute({role:'vendas',datasets:{orders:[order('o1')],financial_transactions:[payment('p1')]}});
  assert.equal(response.body.overview.incomeToday,null); assert.equal(response.body.overview.receivable,null);
  assert.deepEqual(response.body.overview.chart,[]); assert.ok(!calls.some(call=>call.table==='financial_transactions'));
  const onlyDash=await requestRoute({rules:['/financial','/orders','/quotes','/crm','/production'].map(path=>({company_id:'a',path,roles:[]}))});
  assert.deepEqual(onlyDash.response.body.overview.recentOrders,[]); assert.deepEqual(onlyDash.response.body.overview.recentCustomers,[]);
  assert.equal(onlyDash.calls.length,1);
});
