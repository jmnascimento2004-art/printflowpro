import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {assertBillingQa,BILLING_ACTIONS,mockBillingAdapter} from '@/lib/billing/provider.mjs';
import {billingBody,billingHeaders,deliverBillingEvent} from '@/lib/billing/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
function fail(e:unknown){const v=e as {code?:string;message?:string;status?:number};return NextResponse.json({error:v.message==='SAAS_REAL_BILLING_REQUIRES_EXPLICIT_AUTHORIZATION'?v.message:v.message?.startsWith('Billing:')?v.message:v.code==='42501'?'Seu perfil não pode gerenciar a assinatura.':'Não foi possível carregar ou alterar a assinatura. Atualize e tente novamente.'},{status:v.status===401?401:v.code==='42501'?403:v.code==='40001'?409:400,headers:billingHeaders});}
export async function GET(request:Request){try{
 await authenticatePdfRequest(request);const minimal=new URL(request.url).searchParams.get('access')==='1';
 const {data,error}=await getAuthenticatedPdfClient(request).rpc(minimal?'saas_billing_access':'saas_billing_source');if(error)throw error;
 return NextResponse.json(data,{headers:billingHeaders});
}catch(e){return fail(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers:billingHeaders});
 await authenticatePdfRequest(request);const b=JSON.parse(await billingBody(request,4096));
 if(!b||Object.keys(b).some(k=>!['action','payload','operationId'].includes(k))||!BILLING_ACTIONS.includes(b.action)||typeof b.operationId!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(b.operationId)||!b.payload||typeof b.payload!=='object'||Array.isArray(b.payload))throw new Error('Invalid request');
 assertBillingQa(b.payload);
 const {data,error}=await getAuthenticatedPdfClient(request).rpc('saas_billing_prepare',{p_action:b.action,p_payload:b.payload,p_operation_id:b.operationId});if(error)throw error;
 const event=b.action==='start_trial'?await mockBillingAdapter.createSubscription(data):b.action==='change_plan'?await mockBillingAdapter.changePlan(data):b.action==='cancel'?await mockBillingAdapter.cancelSubscription(data):await mockBillingAdapter.getSubscription(data);
 const result=await deliverBillingEvent(event);if(result.result==='stale')return NextResponse.json({error:'Assinatura alterada. Atualize antes de continuar.'},{status:409,headers:billingHeaders});
 return NextResponse.json({result:result.result},{headers:billingHeaders});
}catch(e){return fail(e);}}
