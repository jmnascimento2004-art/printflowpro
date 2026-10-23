import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {paymentHeaders,paymentOrigin,simulateQaEvent} from '@/lib/payments/server';
import {paymentAdapter} from '@/lib/payments/provider.mjs';
import {exportCsv} from '@/lib/reports/report-model';
import {PAYMENT_LINK_STATUS,type PaymentLink} from '@/lib/payments/payment-links';
import {commercialDate} from '@/lib/commercial-intelligence';
import {resolveSystemWhatsAppMessage} from '@/lib/whatsapp/system-message-resolver.server';
import {authorizeOperationalSystemMessageContext} from '@/lib/whatsapp/system-message-auth.server';
export const runtime='nodejs';export const dynamic='force-dynamic';
function fail(error:unknown){const e=error as {code?:string;status?:number;message?:string};const status=e.status===401?401:e.status===403||e.code==='42501'?403:e.code==='40001'?409:e.code==='P0002'?404:400;const safe=e.code==='22023'&&/^(Provedor |Pedido |Recebível |Selecione |Valor |Vencimento |Pagamento |Limite )/.test(e.message||'')?e.message:status===403?'Sem permissão para Links de Pagamento.':status===401?'Entre novamente para continuar.':status===409?'Os dados mudaram. Atualize e tente novamente.':'Não foi possível concluir. Confira os dados e tente novamente.';return NextResponse.json({error:safe},{status,headers:paymentHeaders});}
async function source(request:Request){
 const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request),params=new URL(request.url).searchParams;
 const {data,error}=await client.rpc('payment_links_source',{p_order:params.get('order')||null});if(error)throw error;
 const {data:company,error:companyError}=await getSupabaseAdminClient().from('companies').select('store_domain').eq('id',access.companyId).single();if(companyError)throw companyError;
 const origin=paymentOrigin(company.store_domain);
 return {...data,rows:data.rows.map((row:PaymentLink&{token:string;token_hash?:string})=>{const {token,token_hash,...safe}=row;void token_hash;return {...safe,url:`${origin}/pay/${token}`};})};
}
export async function GET(request:Request){try{
 const model=await source(request),params=new URL(request.url).searchParams;
 const rows=model.rows.filter((r:PaymentLink)=>(!params.get('status')||r.status===params.get('status'))&&(!params.get('search')||`${r.customer} ${r.number}`.toLowerCase().includes(params.get('search')!.toLowerCase()))&&(!params.get('provider')||r.provider===params.get('provider'))&&(!params.get('from')||commercialDate(new Date(r.created_at))>=params.get('from')!)&&(!params.get('to')||commercialDate(new Date(r.created_at))<=params.get('to')!));
 if(params.get('format')==='csv')return new Response(exportCsv(rows.map((r:PaymentLink)=>({customer:r.customer,order:r.number,amount:r.amount,status:PAYMENT_LINK_STATUS[r.status],provider:'QA — sem cobrança real',created:r.created_at,expires:r.expires_on,paid:r.paid_at||''})),[['customer','Cliente'],['order','Pedido'],['amount','Valor'],['status','Status'],['provider','Provedor'],['created','Criado'],['expires','Vencimento'],['paid','Pago em']]),{headers:{...paymentHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="printflow-links-pagamento.csv"'}});
 return NextResponse.json({...model,rows},{headers:paymentHeaders});
 }catch(error){return fail(error);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers:paymentHeaders});
 const access=await authenticatePdfRequest(request),text=await request.text();if(text.length>8192)throw new Error('Invalid command');const body=JSON.parse(text);
 if(!body||!['create','cancel','reconcile','qa_confirm','whatsapp'].includes(body.action)||typeof body.operationId!=='string'||!/^[a-f0-9-]{36}$/i.test(body.operationId)||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new Error('Invalid command');
 const client=getAuthenticatedPdfClient(request);
 if(body.action==='whatsapp'){
  await authorizeOperationalSystemMessageContext(request,'order_payment_pending');
  const model=await source(request),link=model.rows.find((r:PaymentLink)=>r.id===body.payload.id);if(!link||!['active','processing'].includes(link.status))throw new Error('Unavailable link');
  const draftContent=`{{saudacao}}, {{cliente_nome}}!\n{{empresa_nome}}\nDemonstração de link de pagamento do Pedido {{pedido_codigo}}:\n${link.url}\nAMBIENTE QA — não efetue pagamento real.`;
  const resolved=await resolveSystemWhatsAppMessage({trustedCompanyId:access.companyId,context:{eventKey:'order_payment_pending',orderId:link.order_id},draftContent,allowMissingRecipient:true});
  if(!resolved.active)throw new Error('WhatsApp template inactive');
  return NextResponse.json({content:resolved.renderedContent,href:resolved.recipientAvailable?resolved.testHref:null},{headers:paymentHeaders});
 }
 const adapter=paymentAdapter(body.payload.provider||'qa');
 if(body.action==='cancel')await adapter.cancelPaymentLink();
 const {data,error}=await client.rpc('payment_link_command',{p_operation_id:body.operationId,p_action:body.action==='qa_confirm'?'qa_prepare':body.action,p_payload:body.payload});if(error)throw error;
 if(body.action==='create')await adapter.createPaymentLink({externalId:data.id});
 if(body.action==='qa_confirm')return NextResponse.json(await simulateQaEvent(data),{headers:paymentHeaders});
 return NextResponse.json(data,{headers:paymentHeaders});
 }catch(error){return fail(error);}}
