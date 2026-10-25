import type { Customer, FinancialTransaction, Order } from '../dummy-data';
import { calculateOrderBalance, calculateOrderPaidAmount, findCustomerForOrder } from '../finance-rules';
import { formatOrderDisplayNumber } from '../order-number';
import { isFinanciallyActiveOrder } from '../order-status';
import { commercialDate } from '../commercial-intelligence';

export const FINANCE_METHODS = { pix:'Pix',dinheiro:'Dinheiro',cartao_credito:'Cartão de crédito',cartao_debito:'Cartão de débito',boleto:'Boleto',faturado:'Faturado B2B' };
export const FINANCE_AREAS = {overview:'Visão Geral',breakEven:'Ponto de Equilíbrio',settings:'Impostos e Taxas',receivables:'Contas a Receber',payments:'Pagamentos',cashflow:'Fluxo de Caixa',payables:'Contas a Pagar',accounts:'Contas Bancárias'};
export const financialTransactionHref=(id:string)=>`/financial?transactionId=${encodeURIComponent(id)}`;
export const financialFocusId=(params:Pick<URLSearchParams,'get'>)=>params.get('transactionId')||params.get('agendaId')||'';
export type Account={id:string;name:string;institution:string;kind:'bank'|'cash'|'clearing';active:boolean;system_key:string|null;notes:string;updated_at:string};
export type Category={id:string;name:string;type:'receita'|'despesa';active:boolean};
export type FinanceSettings={updated_at?:string;tax_regime?:string;tax_rate:number;fees?:Record<string,number>;loss_rate?:number;variable_rate?:number;contribution_margin?:number|null;revenue_target?:number;profit_target?:number};
export type FinanceSource={transactions:FinancialTransaction[];orders:Order[];customers:Customer[];accounts:Account[];categories:Category[];suppliers:{id:string;name:string}[];settings:FinanceSettings};
export type FinanceFilters={from:string;to:string;account?:string;method?:string;search?:string;status?:string;page?:number;id?:string};
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const sum=(rows:FinancialTransaction[],fn:(row:FinancialTransaction)=>number=(r)=>Number(r.amount))=>round(rows.reduce((n,r)=>n+fn(r),0));
const signed=(r:FinancialTransaction)=>(r.type==='receita'?1:-1)*Number(r.amount);
export const cashEntry=(r:FinancialTransaction)=>r.entry_role!=='payable'&&r.status==='pago'&&!r.cancelled_at;
const operating=(r:FinancialTransaction)=>!r.economic_kind||r.economic_kind==='operating';
export function validateFinanceWindow(from:string,to:string) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||new Date(`${from}T12:00Z`).toISOString().slice(0,10)!==from||new Date(`${to}T12:00Z`).toISOString().slice(0,10)!==to||to<from||Date.parse(to)-Date.parse(from)>366*86400000) throw new Error('Selecione um período válido de até 366 dias.');
}
export function buildReceivableRows(source:Pick<FinanceSource,'orders'|'customers'|'transactions'>,filters:Pick<FinanceFilters,'account'|'method'>={},now=new Date()) {
 const today=commercialDate(now);
 const byId=new Map(source.orders.map(o=>[o.id,o]));
 const byNumber=new Map(source.orders.map(o=>[formatOrderDisplayNumber(o.number).toLowerCase(),o]));
 const byOrder=new Map<string,FinancialTransaction[]>();
 for(const r of source.transactions){const o=r.order_id?byId.get(r.order_id):byNumber.get(formatOrderDisplayNumber(r.order_number).toLowerCase());if(o){const group=byOrder.get(o.id)||[];group.push(r);byOrder.set(o.id,group);}}
 return source.orders.filter(isFinanciallyActiveOrder).map(o=>{
  const customer=findCustomerForOrder(o,source.customers),orderTransactions=byOrder.get(o.id)||[],related=orderTransactions.filter(r=>!r.cancelled_at);
  const terms=customer?.payment_terms_days||30;
  const fallback=new Date(`${commercialDate(o.created_at)}T12:00Z`);fallback.setUTCDate(fallback.getUTCDate()+terms);
  const due=related.filter(r=>r.status==='pendente'&&r.type==='receita').map(r=>r.due_date).sort()[0]||(customer?.billing_type==='faturado'?commercialDate(fallback):commercialDate(o.created_at));
  const amount=calculateOrderBalance(o,orderTransactions),paid=Math.max(Number(o.paid_amount),calculateOrderPaidAmount(o,orderTransactions));
  return {matchesAccountMethod:(!filters.account&&!filters.method)||related.some(r=>(!filters.account||r.account_id===filters.account)&&(!filters.method||r.payment_method===filters.method)),id:o.id,number:formatOrderDisplayNumber(o.number),customer:o.customer_name,amount,paid,total:Number(o.total_amount),date:commercialDate(o.created_at),due_date:due,overdue:amount>0&&due<today,status:amount<=0?'pago':paid>0?'parcial':'pendente',b2b:customer?.billing_type==='faturado',updated_at:o.updated_at};
 });
}
export function buildFinanceModel(source:FinanceSource,filters:FinanceFilters,now=new Date()) {
 validateFinanceWindow(filters.from,filters.to);
 const today=commercialDate(now),monthStart=`${today.slice(0,7)}-01`;
 const transactions=source.transactions,byId=new Map(source.orders.map(o=>[o.id,o]));
 const byNumber=new Map(source.orders.map(o=>[formatOrderDisplayNumber(o.number).toLowerCase(),o]));
 const orderFor=(r:FinancialTransaction)=>r.order_id?byId.get(r.order_id):r.order_number?byNumber.get(formatOrderDisplayNumber(r.order_number).toLowerCase()):undefined;
 const dateOf=(r:FinancialTransaction)=>commercialDate(r.paid_at||r.due_date||r.created_at);
 const within=(date:string)=>date>=filters.from&&date<=filters.to;
 const effective=transactions.filter(r=>!r.cancelled_at);
 const cash=effective.filter(cashEntry);
 const rows=cash.filter(r=>within(dateOf(r))&&(!filters.account||r.account_id===filters.account));
 // Reversals retain the original flow and compensate in the reversal's cash period.
 const income=(r:FinancialTransaction)=>operating(r)&&(!orderFor(r)||isFinanciallyActiveOrder(orderFor(r)))&&((!r.reversal_of&&r.type==='receita')||(!!r.reversal_of&&r.type==='despesa'))?signed(r):0;
 const expense=(r:FinancialTransaction)=>operating(r)&&((!r.reversal_of&&r.type==='despesa')||(!!r.reversal_of&&r.type==='receita'))?-signed(r):0;
 const receivables=buildReceivableRows(source,filters,now);
 const payables=transactions.filter(r=>r.type==='despesa'&&!r.payable_id&&!r.reversal_of&&operating(r)).map(r=>({...r,overdue:r.status==='pendente'&&!r.cancelled_at&&r.due_date<today,displayStatus:r.cancelled_at?'cancelado':r.status}));
 const accountRows=source.accounts.map(a=>({...a,balance:sum(cash.filter(r=>r.account_id===a.id),signed)}));
 const methods=Object.entries(FINANCE_METHODS).map(([id,name])=>{
  const group=rows.filter(r=>r.payment_method===id&&!r.reversal_of&&!r.reversed_at&&r.type==='receita'&&operating(r)&&(!orderFor(r)||isFinanciallyActiveOrder(orderFor(r))));
  return {id,name,count:group.length,amount:sum(group)};
 }).filter(r=>r.count).sort((a,b)=>b.count-a.count||b.amount-a.amount);
 const monthPayables=payables.filter(r=>!r.cancelled_at&&r.is_fixed&&r.due_date.slice(0,7)===today.slice(0,7));
 const fixed=sum(monthPayables),fixedPaid=sum(monthPayables.filter(r=>r.status==='pago'));
 const margin=Number(source.settings.contribution_margin)||null;
 const sold=round(source.orders.filter(o=>isFinanciallyActiveOrder(o)&&commercialDate(o.created_at)>=monthStart&&commercialDate(o.created_at)<=today).reduce((n,o)=>n+Number(o.total_amount),0));
 const equilibrium=margin?round(fixed/(margin/100)):fixed===0?0:null;
 const monthEnd=new Date(`${monthStart}T12:00Z`);monthEnd.setUTCMonth(monthEnd.getUTCMonth()+1);monthEnd.setUTCDate(0);
 const dates=Array.from({length:monthEnd.getUTCDate()},(_,i)=>new Date(`${monthStart}T12:00Z`).getTime()+i*86400000).map(t=>new Date(t));
 const working=dates.filter(d=>![0,6].includes(d.getUTCDay())),remaining=working.filter(d=>commercialDate(d)>today).length,elapsed=working.length-remaining;
 const target=margin?round((fixed+Number(source.settings.profit_target||0))/(margin/100)):null;
 const search=(filters.search||'').trim().toLocaleLowerCase('pt-BR').replace(/^ord-/,'ped-');
 const searchMatch=(values:(string|undefined)[])=>!search||values.some(v=>(v||'').toLocaleLowerCase('pt-BR').includes(search));
 const matches=(r:FinancialTransaction)=>searchMatch([r.description,r.category,formatOrderDisplayNumber(r.order_number),orderFor(r)?.customer_name])&&(!filters.method||r.payment_method===filters.method)&&(!filters.account||r.account_id===filters.account)&&(!filters.status||(r.cancelled_at?'cancelado':r.reversed_at?'estornado':r.status)===filters.status)&&(!filters.id||r.id===filters.id);
 const filteredRows=rows.filter(matches);
 const page=Math.max(0,Math.floor(filters.page||0));
 const paginate=<T,>(values:T[])=>({rows:values.slice(page*50,page*50+50),total:values.length,page});
 const describe=(r:FinancialTransaction)=>({...r,account:source.accounts.find(a=>a.id===r.account_id)?.name||'Conta indisponível',customer:orderFor(r)?.customer_name||'',displayOrder:r.order_number?formatOrderDisplayNumber(r.order_number):'',date:dateOf(r)});
 return {focusArea:filters.id?(transactions.find(r=>r.id===filters.id)?.type==='receita'?'payments':'payables'):null,today,from:filters.from,to:filters.to,timezone:'America/Bahia',
  overview:{receivedToday:sum(cash.filter(r=>dateOf(r)===today),income),receivedMonth:sum(cash.filter(r=>dateOf(r)>=monthStart&&dateOf(r)<=today),income),receivable:round(receivables.reduce((n,r)=>n+r.amount,0)),paidOrders:receivables.filter(r=>r.status==='pago').length,pendingOrders:receivables.filter(r=>r.amount>0).length,payable:sum(payables.filter(r=>!r.cancelled_at&&r.status==='pendente')),balance:sum(cash,signed),b2b:round(receivables.filter(r=>r.b2b).reduce((n,r)=>n+r.amount,0)),methods},
  flow:{income:sum(filteredRows.filter(r=>r.economic_kind!=='transfer'&&r.economic_kind!=='opening'),r=>r.type==='receita'?Number(r.amount):0),expense:sum(filteredRows.filter(r=>r.economic_kind!=='transfer'&&r.economic_kind!=='opening'),r=>r.type==='despesa'?Number(r.amount):0),net:sum(filteredRows.filter(r=>r.economic_kind!=='transfer'&&r.economic_kind!=='opening'),signed),operatingIncome:sum(filteredRows,income),operatingExpense:sum(filteredRows,expense),transfers:sum(filteredRows.filter(r=>r.economic_kind==='transfer'&&r.type==='despesa')),opening:sum(cash.filter(r=>dateOf(r)<filters.from&&(!filters.account||r.account_id===filters.account)),signed),closing:sum(cash.filter(r=>dateOf(r)<=filters.to&&(!filters.account||r.account_id===filters.account)),signed)},
  cashflow:paginate(filteredRows.sort((a,b)=>dateOf(b).localeCompare(dateOf(a))||b.id.localeCompare(a.id)).map(describe)),
  payments:paginate(transactions.filter(r=>r.type==='receita'&&r.entry_role!=='payable'&&operating(r)&&!r.reversal_of&&!!orderFor(r)&&(filters.id?true:within(dateOf(r)))&&matches(r)).map(describe)),
  payables:paginate(payables.filter(r=>(filters.id?r.id===filters.id:within(r.due_date))&&matches(r)).sort((a,b)=>a.due_date.localeCompare(b.due_date)).map(r=>({...describe(r),displayStatus:r.displayStatus,overdue:r.overdue}))),
  receivables:paginate(receivables.filter(r=>r.matchesAccountMethod&&within(r.due_date)&&searchMatch([r.customer,r.number])&&(!filters.status||r.status===filters.status))),
  breakEven:{month:today.slice(0,7),sold,fixed,fixedPaid,margin,equilibrium,remaining:equilibrium===null?null:round(Math.max(0,equilibrium-sold)),fixedPaidPercent:fixed?round(fixedPaid/fixed*100):0,workingDaysRemaining:remaining,profitTarget:Number(source.settings.profit_target||0),revenueTarget:Number(source.settings.revenue_target||0),suggestedTarget:target,projection:elapsed?round(sold/elapsed*working.length):null},
  accounts:accountRows,categories:source.categories,suppliers:source.suppliers,settings:source.settings};
}
export type FinanceModel=ReturnType<typeof buildFinanceModel>;
