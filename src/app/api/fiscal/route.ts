import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {assertFiscalSandbox,mockFiscalAdapter,type AdapterDocument} from '@/lib/fiscal/provider.mjs';
import {deliverMockEvent,fiscalHeaders,fiscalBody} from '@/lib/fiscal/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
function fail(e:unknown){const v=e as {code?:string;message?:string;status?:number};const forbidden=v.code==='42501'||v.status===403;return NextResponse.json({error:v.message==='FISCAL_REAL_EMISSION_REQUIRES_EXPLICIT_AUTHORIZATION'?v.message:v.code==='22023'&&v.message?.startsWith('Fiscal:')?v.message:forbidden?'Sem permissão para Fiscal.':v.status===401?'Entre novamente para continuar.':'Não foi possível concluir a operação fiscal. Atualize e confira os dados.'},{status:forbidden?403:v.status===401?401:400,headers:fiscalHeaders});}
export async function GET(request:Request){try{
 const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request),params=new URL(request.url).searchParams;
 const {data,error}=await client.rpc('fiscal_source',{p_order:params.get('order')||null});if(error)throw error;
 const id=params.get('entity'),kind=params.get('kind');
 if(id&&['customer','product'].includes(kind||'')){
  const customer=kind==='customer';const {data:entity,error:entityError}=await client.from(customer?'customers':'products').select('id,name').eq('id',id).eq('company_id',access.companyId).single();if(entityError)throw entityError;
  const {data:fiscal,error:fiscalError}=customer
   ?await client.from('fiscal_customer_data').select('municipality_code').eq('customer_id',id).eq('company_id',access.companyId).maybeSingle()
   :await client.from('fiscal_product_data').select('service_code,cnae').eq('product_id',id).eq('company_id',access.companyId).maybeSingle();if(fiscalError)throw fiscalError;
  data[customer?'customers':'products']=[{...entity,...fiscal}];
 }
 return NextResponse.json(data,{headers:fiscalHeaders});}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers:fiscalHeaders});
 await authenticatePdfRequest(request);const text=await fiscalBody(request,16384);const b=JSON.parse(text);
 if(!b||!['settings','customer','product','prevalidate','request','consult','cancel'].includes(b.action)||typeof b.operationId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(b.operationId)||!b.payload||typeof b.payload!=='object'||Array.isArray(b.payload))throw new Error('Invalid body');
 assertFiscalSandbox(b.payload);const client=getAuthenticatedPdfClient(request);
 if(b.action==='consult'){
  const {data,error}=await client.from('fiscal_documents').select('*').eq('id',b.payload.id).single();if(error)throw error;
  const d=data as AdapterDocument&{status:string};if(d.status==='queued')await deliverMockEvent(await mockFiscalAdapter.issueDocument(d));
  // A separate consultation completes the mock's asynchronous outcome.
  else if(d.status==='processing')await deliverMockEvent(await mockFiscalAdapter.getDocumentStatus(d,b.payload.outcome||'authorized_qa'));
  return NextResponse.json({ok:true},{headers:fiscalHeaders});
 }
 const {data,error}=await client.rpc('fiscal_command',{p_action:b.action==='cancel'?'cancel_prepare':b.action,p_payload:b.payload,p_operation_id:b.operationId});if(error)throw error;
 if(b.action==='request'&&data.id&&data.status==='queued')await deliverMockEvent(await mockFiscalAdapter.issueDocument(data));
 if(b.action==='cancel'&&data.status==='authorized_qa')await deliverMockEvent(await mockFiscalAdapter.cancelDocument(data));
 return NextResponse.json(data,{headers:fiscalHeaders});
 }catch(e){return fail(e);}}
