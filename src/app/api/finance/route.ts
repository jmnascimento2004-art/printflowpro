import { NextResponse } from 'next/server';
import { authenticatePdfRequest, getAuthenticatedPdfClient } from '@/lib/pdf/pdf-server-auth';
import { buildFinanceModel, validateFinanceWindow, type FinanceSource } from '@/lib/finance/finance-model';
import { commercialDate } from '@/lib/commercial-intelligence';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown) {
 const e=error as {code?:string;status?:number;message?:string};
 const status=e.status===401?401:e.code==='42501'?403:e.code==='40001'?409:e.code==='P0002'?404:['22023','23514','23503','23502','23505','22P02','22007','22008'].includes(e.code||'')?400:500;
 const message=status===401?'Entre novamente para continuar.':status===403?'Sem permissão para o Financeiro.':status===409?'O registro mudou. Atualize os dados antes de tentar novamente.':status===404?'Registro indisponível para sua empresa.':status===400?'Confira os campos, a conta ativa e o estado atual do lançamento.':'Não foi possível concluir a operação financeira.';
 if(e.code==='42501'&&e.message==='Use Comissões para reverter este pagamento')return NextResponse.json({error:e.message},{status:403,headers});
 const cashSessionMessage='Caixa físico com sessão aberta: use o PDV ou encerre a sessão antes de movimentar pelo Financeiro.';
 return NextResponse.json({error:e.code==='22023'&&e.message===cashSessionMessage?cashSessionMessage:message},{status,headers});
}
export async function GET(request:Request) {
 try {
  await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request),p=new URL(request.url).searchParams;
  const today=commercialDate(new Date()),from=p.get('from')||`${today.slice(0,7)}-01`,to=p.get('to')||today;
  try {validateFinanceWindow(from,to);} catch {return NextResponse.json({error:'Selecione datas válidas, até 366 dias.'},{status:400,headers});}
  const page=Number(p.get('page')||0);if(!Number.isInteger(page)||page<0||page>10000)return NextResponse.json({error:'Página inválida.'},{status:400,headers});
  const {data,error}=await client.rpc('finance_source');if(error)throw error;
  return NextResponse.json(buildFinanceModel(data as FinanceSource,{from,to,account:p.get('account')||'',method:p.get('method')||'',search:(p.get('search')||'').slice(0,120),status:p.get('status')||'',id:p.get('id')||'',page}),{headers});
 } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
 try {
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers});
  await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request);
  const body=await request.json().catch(()=>null);
  if(!body||typeof body!=='object'||!body.operationId||!body.action||!body.payload)return NextResponse.json({error:'Comando inválido.'},{status:400,headers});
  const {data,error}=await client.rpc('finance_command',{p_operation_id:body.operationId,p_action:body.action,p_payload:body.payload});
  if(error)throw error;return NextResponse.json(data,{headers});
 } catch(error) {return failure(error);}
}
