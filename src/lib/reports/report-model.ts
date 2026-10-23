import type {Customer,Order} from '../dummy-data';
import {buildCustomerRankingWindow,commercialDate} from '../commercial-intelligence';
import {isActiveOrder} from '../order-status';
import {validateFinanceWindow} from '../finance/finance-model';

export const REPORT_MODES={finance:'Financeiro',sales:'Vendas',products:'Produtos',customers:'Clientes'};
export const REPORT_ORIGINS:Record<string,string>={commission:'Comissões',order_payment:'Pagamento de Pedido',manual:'Manual',accounts_payable:'Conta a pagar',pdv:'PDV',legacy:'Histórico',transfer:'Transferência',opening:'Abertura',reversal:'Reversão'};
export const REPORT_STATUSES:Record<string,string>={orcamento:'Orçamento',aguardando_aprovacao:'Aguardando aprovação',aguardando_pagamento:'Aguardando pagamento',producao:'Produção',impressao:'Impressão',acabamento:'Acabamento',expedicao:'Expedição',entregue:'Entregue',finalizado:'Finalizado',cancelado:'Cancelado'};
export type ReportMode=keyof typeof REPORT_MODES;
export type ReportFilters={from:string;to:string;account:string;category:string;method:string;origin:string;type:string;customer:string;supplier:string;status:string};
export type ReportRow=Record<string,string|number|null>;
export type ReportGroup={dimension:string;key:string;label:string;count:number;income:number;expense:number;result:number};
export type CashSummary={income:number;expense:number;result:number;cashNet:number;excluded:number;days:number;count:number;transfer:number;opening:number;capital:number;adjustment:number};
export type CashReport={summary:CashSummary;groups:ReportGroup[];daily:{date:string;income:number;expense:number;result:number}[];rows:ReportRow[];total:number;options:{accounts:{id:string;name:string}[];categories:{id:string;name:string}[]}};
export type CommercialSource={orders:Order[];customers:Customer[]};
export const rounded=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function previousWindow(from:string,to:string){validateFinanceWindow(from,to);const days=Math.round((Date.parse(to)-Date.parse(from))/86400000)+1;const shift=(s:string,n:number)=>new Date(Date.parse(`${s}T12:00Z`)+n*86400000).toISOString().slice(0,10);return {from:shift(from,-days),to:shift(from,-1)};}
export function comparison(current:number,previous:number){return {current,previous,absolute:rounded(current-previous),percent:previous===0?null:rounded((current-previous)/Math.abs(previous)*100)};}
export function cashIndicators(s:CashSummary){return {...s,margin:s.income>0?rounded(s.result/s.income*100):null,dailyAverage:s.days?rounded(s.income/s.days):null};}
export function buildCommercialReport(source:CommercialSource,mode:Exclude<ReportMode,'finance'>,from:string,to:string,page=0,limit=50){
 validateFinanceWindow(from,to);
 const orders=source.orders.filter(o=>isActiveOrder(o)&&commercialDate(o.created_at)>=from&&commercialDate(o.created_at)<=to);
 const sold=rounded(orders.reduce((n,o)=>n+Number(o.total_amount),0));
 const daily=new Map<string,number>();for(const o of orders){const d=commercialDate(o.created_at);daily.set(d,(daily.get(d)||0)+Number(o.total_amount));}
 let rows:ReportRow[];
 if(mode==='sales') rows=orders.sort((a,b)=>b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id)).map(o=>({id:o.id,date:commercialDate(o.created_at),number:o.number,customer:o.customer_name,status:o.status,amount:Number(o.total_amount)}));
 else if(mode==='customers') rows=buildCustomerRankingWindow(source.customers,orders,from,to).filter(r=>r.count>0).map(r=>({id:r.id,position:r.position,name:r.name,total:rounded(r.total),count:r.count,average:rounded(r.average),lastPurchase:r.lastPurchase?commercialDate(r.lastPurchase):'',recurrence:r.count>1?'Recorrente':'Uma compra',tags:r.tags.join(', '),b2b:r.b2b?'Sim':'Não'}));
 else {const items=new Map<string,{id:string;name:string;quantity:number;total:number;orders:Set<string>}>();for(const order of orders)for(const item of order.items||[]){const id=item.product_id||`historical:${item.product_name}`;const row=items.get(id)||{id,name:item.product_name,quantity:0,total:0,orders:new Set<string>()};row.quantity+=Number(item.quantity);row.total+=Number(item.total_price);row.orders.add(order.id);items.set(id,row);}const total=[...items.values()].reduce((n,r)=>n+r.total,0);rows=[...items.values()].sort((a,b)=>b.total-a.total||a.id.localeCompare(b.id)).map(r=>({id:r.id,name:r.name,quantity:rounded(r.quantity),total:rounded(r.total),count:r.orders.size,average:rounded(r.total/r.orders.size),mix:total?rounded(r.total/total*100):0}));}
 const linked=new Set(source.customers.map(c=>c.id));
 const unattributed=mode==='customers'?orders.filter(o=>!linked.has(o.customer_id)):[];
 return {summary:{sold,count:orders.length,average:orders.length?rounded(sold/orders.length):null,itemTotal:mode==='products'?rounded(rows.reduce((n,r)=>n+Number(r.total),0)):null,unattributedCount:unattributed.length,unattributedTotal:rounded(unattributed.reduce((n,o)=>n+Number(o.total_amount),0))},daily:[...daily].sort(([a],[b])=>a.localeCompare(b)).map(([date,total])=>({date,total:rounded(total)})),status:Object.entries(orders.reduce<Record<string,number>>((a,o)=>({...a,[o.status]:(a[o.status]||0)+1}),{})),rows:rows.slice(page*limit,page*limit+limit),total:rows.length,top:[...rows].sort((a,b)=>Number(b.total||b.amount||0)-Number(a.total||a.amount||0)).slice(0,8).map(r=>({label:String(r.name||r.number),total:Number(r.total||r.amount||0)}))};
}
// Spreadsheet programs execute leading formula markers even inside quoted CSV cells.
export function csvCell(value:unknown){if(typeof value==='number')return `"${Number.isFinite(value)?value:''}"`;let s=String(value??'');if(/^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(s))s=`'${s}`;return `"${s.replaceAll('"','""')}"`;}
export function exportCsv(rows:ReportRow[],columns:[string,string][]){return '\uFEFF'+[columns.map(([,label])=>csvCell(label)).join(';'),...rows.map(row=>columns.map(([key])=>csvCell(row[key])).join(';'))].join('\r\n');}
export const REPORT_COLUMNS:Record<ReportMode,[string,string][]>={finance:[['date','Data caixa'],['description','Descrição'],['type','Tipo original'],['category','Categoria'],['origin','Origem'],['account','Conta'],['customer','Cliente'],['supplier','Fornecedor'],['payment_method','Método'],['amount','Caixa assinado'],['result','Resultado DRE'],['classification','Classificação']],sales:[['date','Data'],['number','Pedido'],['customer','Cliente'],['status','Status'],['amount','Vendido']],products:[['name','Produto'],['quantity','Quantidade'],['total','Receita dos itens'],['count','Pedidos'],['average','Ticket por pedido'],['mix','Mix %']],customers:[['position','Posição'],['name','Cliente'],['total','Comprado'],['count','Pedidos'],['average','Ticket'],['lastPurchase','Última compra no período'],['recurrence','Recorrência no período'],['tags','Tags'],['b2b','B2B']]};
