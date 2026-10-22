import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {canAccessModule} from '@/lib/module-permissions';
import {validateFinanceWindow,buildReceivableRows,FINANCE_METHODS,type FinanceSource} from '@/lib/finance/finance-model';
import {commercialDate} from '@/lib/commercial-intelligence';
import {REPORT_COLUMNS,REPORT_MODES,REPORT_ORIGINS,buildCommercialReport,cashIndicators,comparison,exportCsv,previousWindow,type ReportMode,type CashReport,type CommercialSource,type ReportRow} from '@/lib/reports/report-model';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(request:Request){
 try {
  const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request),p=new URL(request.url).searchParams;
  const {data:permissions,error:permissionsError}=await client.from('role_permissions').select('path,roles').eq('company_id',access.companyId);if(permissionsError)throw permissionsError;
  const configured=Object.fromEntries((permissions||[]).map(r=>[r.path,r.roles]));
  const allowed=(path:string)=>canAccessModule(access.role,path,configured);
  const modes=Object.keys(REPORT_MODES).filter(mode=>mode==='finance'?allowed('/financial'):mode==='sales'?allowed('/orders'):mode==='products'?allowed('/products')&&allowed('/orders'):allowed('/crm')&&allowed('/orders'));
  if(p.get('capabilities')==='1')return NextResponse.json({modes}, {headers});
  const mode=(p.get('mode')||'finance') as ReportMode;
  if(!Object.hasOwn(REPORT_MODES,mode))return NextResponse.json({error:'Relatório inválido.'},{status:400,headers});
  if(!modes.includes(mode))return NextResponse.json({error:'Sem permissão para este relatório.'},{status:403,headers});
  const today=commercialDate(new Date()),from=p.get('from')||`${today.slice(0,7)}-01`,to=p.get('to')||today;
  try{validateFinanceWindow(from,to);}catch{return NextResponse.json({error:'Selecione datas válidas, até 366 dias.'},{status:400,headers});}
  const page=Number(p.get('page')||0),format=p.get('format')||'json';if(!Number.isInteger(page)||page<0||page>10000||!['json','csv','pdf'].includes(format))return NextResponse.json({error:'Formato ou página inválida.'},{status:400,headers});
  const filters=Object.fromEntries(['account','category','method','origin','type','customer','supplier','status'].map(k=>[k,(p.get(k)||'').slice(0,120)]));
  if(format==='pdf'&&mode!=='finance')return NextResponse.json({error:'Resumo PDF disponível no Financeiro.'},{status:400,headers});
  const limit=format==='csv'?10000:50;
  async function source(start:string,end:string,index:number,size:number){const {data,error}=await client.rpc('reports_source',{p_mode:mode,p_from:start,p_to:end,p_filters:filters,p_page:index,p_limit:size});if(error)throw error;return data;}
  const previous=previousWindow(from,to);
  const [current,prior]=await Promise.all([source(from,to,format==='csv'?0:page,limit),format==='json'?source(previous.from,previous.to,0,1):null]);
  let rows:ReportRow[],model:Record<string,unknown>,total:number;
  if(mode==='finance'){
   const cash=current as CashReport;
   rows=cash.rows;total=cash.total;
   const {data:exposure,error:exposureError}=await client.rpc('reports_receivable_source',{p_from:from,p_to:to});if(exposureError)throw exposureError;
   const receivables=buildReceivableRows(exposure as FinanceSource);
   // Reuse canonical order-balance rules; this exposure is explicitly independent of cash filters.
   model={...cash,summary:cashIndicators(cash.summary),comparison:prior?{income:comparison(cash.summary.income,prior.summary.income),expense:comparison(cash.summary.expense,prior.summary.expense),result:comparison(cash.summary.result,prior.summary.result)}:null,
   exposure:{amount:receivables.reduce((n,r)=>n+r.amount,0),pendingOrders:receivables.filter(r=>r.amount>0).length,overdue:receivables.filter(r=>r.overdue).reduce((n,r)=>n+r.amount,0),label:'Saldo atual dos pedidos criados no período; independente dos filtros de caixa.'}};
  } else {
   const currentModel=buildCommercialReport(current as CommercialSource,mode,from,to,format==='csv'?0:page,limit);
   const priorModel=prior?buildCommercialReport(prior as CommercialSource,mode,previous.from,previous.to,0,1):null;
   const customers=[...new Map((current as CommercialSource).orders.map(o=>[o.customer_id,{id:o.customer_id,name:o.customer_name}])).values()].filter(c=>c.id);
   if(customers.length>500)return NextResponse.json({error:'Mais de 500 clientes no período. Reduza a janela para explorar os filtros.'},{status:400,headers});
   rows=currentModel.rows;total=currentModel.total;model={...currentModel,options:{customers},comparison:priorModel?{sold:comparison(currentModel.summary.sold,priorModel.summary.sold),count:comparison(currentModel.summary.count,priorModel.summary.count)}:null};
  }
  if(format==='csv'){
   if(total>limit)return NextResponse.json({error:'Mais de 10.000 linhas. Reduza o período ou os filtros para exportar sem truncamento.'},{status:400,headers});
   const selected=(p.get('columns')||'').split(',');
   const columns=REPORT_COLUMNS[mode].filter(([key])=>!p.has('columns')||selected.includes(key));
   if(!columns.length)return NextResponse.json({error:'Selecione pelo menos uma coluna.'},{status:400,headers});
   return new Response(exportCsv(rows,columns),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="printflow-${mode}-${from}-${to}.csv"`}});
  }
  if(format==='pdf'){
   const {renderReportPdf}=await import('@/lib/reports/report-pdf');
   const cash=current as CashReport;
   const dimensionLabel=(dimension:string,key:string)=>cash.groups.find(g=>g.dimension===dimension&&g.key===key)?.label;
   const displayFilters={...filters,account:filters.account?(cash.options.accounts.find(a=>a.id===filters.account)?.name||'Conta selecionada'):'',category:filters.category?(dimensionLabel('category',filters.category)||cash.options.categories.find(c=>c.id===filters.category)?.name||'Categoria selecionada'):'',customer:filters.customer?(dimensionLabel('customer',filters.customer)||'Cliente selecionado'):'',supplier:filters.supplier?(dimensionLabel('supplier',filters.supplier)||'Fornecedor selecionado'):'',method:FINANCE_METHODS[filters.method as keyof typeof FINANCE_METHODS]||filters.method,origin:REPORT_ORIGINS[filters.origin]||filters.origin,type:filters.type==='receita'?'Receita':filters.type==='despesa'?'Despesa':filters.type};
   const buffer=await renderReportPdf({from,to,summary:cash.summary,filters:displayFilters});
   return new Response(new Uint8Array(buffer),{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="printflow-dre-${from}-${to}.pdf"`}});
  }
  return NextResponse.json({...model,mode,modes,from,to,previous,page,timezone:'America/Bahia'}, {headers});
 }catch(error){const e=error as {status?:number;code?:string};const status=e.status===401?401:e.code==='42501'?403:e.code==='54000'||['22023','22007','22008','22P02'].includes(e.code||'')?400:500;return NextResponse.json({error:status===401?'Entre novamente para continuar.':status===403?'Sem permissão para este relatório.':status===400?'Reduza o período ou confira os filtros.':'Não foi possível carregar o relatório.'},{status,headers});}
}
