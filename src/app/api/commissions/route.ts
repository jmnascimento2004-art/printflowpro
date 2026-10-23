import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {commercialDate} from '@/lib/commercial-intelligence';
import {validateFinanceWindow} from '@/lib/finance/finance-model';
import {exportCsv} from '@/lib/reports/report-model';
import {commissionCsvRows,commissionSummaryRows,COMMISSION_CSV_COLUMNS,COMMISSION_SUMMARY_COLUMNS,type CommissionModel} from '@/lib/commissions';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
function failure(error:unknown){const e=error as {code?:string;status?:number;message?:string};const status=e.status===401?401:e.status===403||e.code==='42501'?403:e.code==='40001'?409:e.code==='P0002'?404:400;const safe=e.code==='22023'&&/^(Vendedor |Pedido |Origem |Período|Períodos|Valor |Reabertura |Ajuste |Aprove |Feche |Comissão |Sem saldo |Selecione |Data |Motivo |Pagamento |Vendas |Reabra |Reduza )/.test(e.message||'')?e.message:status===401?'Entre novamente para continuar.':status===403?'Sem permissão para Comissões.':status===409?'Os dados mudaram. Atualize antes de tentar novamente.':'Não foi possível concluir. Confira os campos e tente novamente.';return NextResponse.json({error:safe},{status,headers});}
export async function GET(request:Request){try{
 await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request),params=new URL(request.url).searchParams,today=commercialDate(new Date());
 const from=params.get('from')||`${today.slice(0,7)}-01`,to=params.get('to')||today;validateFinanceWindow(from,to);
 const page=Number(params.get('page')||0);if(!Number.isInteger(page)||page<0||page>10000)throw new Error('Invalid page');
 const {data,error}=await client.rpc('commission_source',{p_period:params.get('period')||null,p_from:from,p_to:to,p_seller:params.get('seller')||null,p_origin:params.get('origin')||null});if(error)throw error;
 const model=data as CommissionModel;
 if(params.get('format')==='csv'){const detail=params.get('detail')==='1';return new Response(exportCsv(detail?commissionCsvRows(model):commissionSummaryRows(model),detail?COMMISSION_CSV_COLUMNS:COMMISSION_SUMMARY_COLUMNS),{headers:{...headers,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="printflow-comissoes.csv"'}});}
 return NextResponse.json({...model,totalRows:model.rows.length,rows:model.rows.slice(page*50,page*50+50)},{headers});
 }catch(error){return failure(error);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers});
 await authenticatePdfRequest(request);const text=await request.text();if(text.length>18000)throw new Error('Invalid command');const body=JSON.parse(text);
 if(!body||!['rule_save','assign','period_create','close','approve','reopen','adjust','pay','reverse'].includes(body.action)||typeof body.operationId!=='string'||!/^[\da-f-]{36}$/i.test(body.operationId)||!body.payload||typeof body.payload!=='object')throw new Error('Invalid command');
 const {data,error}=await getAuthenticatedPdfClient(request).rpc('commission_command',{p_operation_id:body.operationId,p_action:body.action,p_payload:body.payload});if(error)throw error;return NextResponse.json(data,{headers});
 }catch(error){return failure(error);}}
