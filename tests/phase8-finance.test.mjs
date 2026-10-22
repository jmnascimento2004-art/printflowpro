import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
async function compile(path,dependencies={}){const text=await readFile(new URL(path,import.meta.url),'utf8');const code=ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('exports','module','require',code)(m.exports,m,k=>{assert.ok(dependencies[k],k);return dependencies[k];});return m.exports;}
const numbers=await compile('../src/lib/order-number.ts'),status=await compile('../src/lib/order-status.ts');
const finance=await compile('../src/lib/finance-rules.ts',{'@/lib/order-number':numbers,'@/lib/order-status':status});
const commercial=await compile('../src/lib/commercial-intelligence.ts',{'./finance-rules':finance,'./order-status':status,'./order-number':numbers});
const m=await compile('../src/lib/finance/finance-model.ts',{'../finance-rules':finance,'../order-number':numbers,'../order-status':status,'../commercial-intelligence':commercial});
const now=new Date('2026-10-21T15:00Z'),filters={from:'2026-10-01',to:'2026-10-31'};
const tx=(id,extra={})=>({id,company_id:'a',account_id:'a',type:'receita',amount:100,description:id,category:'Vendas',status:'pago',payment_method:'pix',due_date:'2026-10-21',paid_at:'2026-10-21T12:00Z',created_at:'2026-10-21T12:00Z',...extra});
const order=(id,extra={})=>({id,number:'PED-0001',customer_id:'c',customer_name:'Cliente',total_amount:300,paid_amount:0,status:'producao',created_at:'2026-10-01T12:00Z',...extra});
const empty={transactions:[],orders:[],customers:[],accounts:[{id:'a',name:'A',active:true},{id:'b',name:'B',active:true}],categories:[],suppliers:[],settings:{tax_rate:0}};
const build=(extra,filter={})=>m.buildFinanceModel({...empty,...extra},{...filters,...filter},now);
test('cashflow totals follow the same method and search filters as the table',()=>{
 const data=build({transactions:[tx('pix',{amount:80}),tx('cash',{payment_method:'dinheiro',amount:120})]},{method:'pix',search:'pix'});
 assert.equal(data.cashflow.total,1);assert.equal(data.flow.income,80);assert.equal(data.flow.net,80);assert.equal(data.flow.closing,200);
});
test('historical B2B customer names retain billing terms without customer id',()=>{
 const data=build({orders:[order('old',{customer_id:undefined})],customers:[{id:'c',name:'Cliente',billing_type:'faturado',payment_terms_days:15}]});
 assert.equal(data.receivables.rows[0].b2b,true);assert.equal(data.receivables.rows[0].due_date,'2026-10-16');assert.equal(data.overview.b2b,300);
});
test('transfers debit and credit accounts with no artificial operational result',()=>{
 const data=build({transactions:[tx('opening',{economic_kind:'opening',amount:1000}),tx('out',{type:'despesa',economic_kind:'transfer'}),tx('in',{account_id:'b',economic_kind:'transfer'})]});
 assert.deepEqual(data.accounts.map(a=>a.balance),[900,100]);assert.equal(data.overview.balance,1000);assert.equal(data.overview.receivedMonth,0);assert.equal(data.flow.net,0);assert.equal(data.flow.transfers,100);
});
test('payable title and settlement are not double counted; reversal retains cash history',()=>{
 const transactions=[tx('title',{entry_role:'payable',type:'despesa',is_fixed:true}),tx('settlement',{type:'despesa',payable_id:'title',reversed_at:'2026-10-21T14:00Z'}),tx('reverse',{reversal_of:'settlement',source:'reversal'})];
 const data=build({transactions});assert.equal(data.flow.net,0);assert.equal(data.flow.operatingExpense,0);assert.equal(data.overview.receivedMonth,0);assert.equal(data.payables.total,1);assert.equal(data.cashflow.total,2);assert.equal(data.breakEven.fixed,100);
 assert.equal(finance.calculatePeriodExpenses(transactions,()=>true,()=>undefined),0);
});
test('two identical payments with distinct ids both count; PED/ORD fallback only without id',()=>{
 const orders=[order('o')],transactions=[tx('p1',{order_id:'o'}),tx('p2',{order_id:'o'}),tx('p3',{order_number:'ORD-0001'}),tx('wrong',{order_id:'other',order_number:'ORD-0001'})];
 assert.equal(finance.calculateOrderPaidAmount(orders[0],transactions),300);
 const data=build({orders,transactions});assert.equal(data.overview.receivable,0);assert.equal(data.overview.paidOrders,1);
});
test('partial, total and B2B balances are derived without inserting receivable duplicates',()=>{
 const source={orders:[order('o')],customers:[{id:'c',billing_type:'faturado',payment_terms_days:30}],transactions:[tx('p',{order_id:'o',amount:80}),tx('future',{order_id:'o',amount:220,status:'pendente',payment_method:'faturado'})]};
 const data=build(source);assert.equal(data.overview.receivable,220);assert.equal(data.overview.b2b,220);assert.equal(data.receivables.rows[0].status,'parcial');assert.equal(data.flow.income,80);
});
test('cancelled payables are excluded; overdue is derived, not persisted',()=>{
 const data=build({transactions:[tx('late',{entry_role:'payable',type:'despesa',status:'pendente',due_date:'2026-10-01',paid_at:null}),tx('cancel',{entry_role:'payable',type:'despesa',status:'pendente',cancelled_at:'2026-10-20'})]});
 assert.equal(data.overview.payable,100);assert.equal(data.payables.rows.find(r=>r.id==='late').overdue,true);assert.equal(data.payables.rows.find(r=>r.id==='cancel').displayStatus,'cancelado');
});
test('break-even fixed costs and explicit managerial margin; zero/absent base is honest',()=>{
 const transactions=[tx('rent',{entry_role:'payable',type:'despesa',is_fixed:true,amount:200})];
 let data=build({transactions,settings:{tax_rate:0,contribution_margin:40,profit_target:100,revenue_target:1000}});
 assert.equal(data.breakEven.equilibrium,500);assert.equal(data.breakEven.suggestedTarget,750);assert.equal(data.breakEven.fixedPaidPercent,100);
 data=build({transactions});assert.equal(data.breakEven.equilibrium,null);assert.equal(data.breakEven.margin,null);
 assert.equal(build({}).breakEven.equilibrium,0);
});
test('cash dates honor Bahia midnight and account filtering',()=>{
 const data=build({transactions:[tx('early',{paid_at:'2026-10-21T01:00Z'}),tx('other',{account_id:'b'})]},{from:'2026-10-20',to:'2026-10-20',account:'a'});
 assert.equal(data.cashflow.total,1);assert.equal(data.cashflow.rows[0].date,'2026-10-20');assert.equal(data.flow.income,100);assert.equal(data.overview.receivedToday,100);
});
test('invalid periods rejected instead of silently returning partial metrics',()=>{
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2026-12-01','2026-11-01'],['2020-01-01','2026-01-01']])assert.throws(()=>m.validateFinanceWindow(from,to));
});
