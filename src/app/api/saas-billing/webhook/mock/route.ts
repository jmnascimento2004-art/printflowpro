import {NextResponse} from 'next/server';
import {billingBody,billingHeaders,consumeBillingEvent} from '@/lib/billing/server';
export const runtime='nodejs';
export async function POST(request:Request){try{
 const result=await consumeBillingEvent(await billingBody(request,2048),request.headers.get('x-billing-timestamp')||'',request.headers.get('x-billing-signature')||'');
 return NextResponse.json({result:result.result},{headers:billingHeaders});
}catch{return NextResponse.json({error:'Evento inválido.'},{status:400,headers:billingHeaders});}}
