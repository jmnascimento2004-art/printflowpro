import {NextResponse} from 'next/server';
import {consumePaymentWebhook,paymentHeaders,paymentRate} from '@/lib/payments/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{provider:string}>}){
 try{
  if((await params).provider!=='qa')return NextResponse.json({error:'Provedor indisponível.'},{status:404,headers:paymentHeaders});
  await paymentRate(request,'webhook',120);
  if(Number(request.headers.get('content-length')||0)>8192)return new Response(null,{status:413,headers:paymentHeaders});
  const result=await consumePaymentWebhook(await request.text(),request.headers.get('x-payment-timestamp')||'',request.headers.get('x-payment-signature')||'');
  return NextResponse.json(result,{headers:paymentHeaders});
 }catch(error){const e=error as {message?:string;code?:string};const status=e.message==='RATE_LIMIT'?429:e.code==='40001'?503:e.code==='22023'?409:e.code?503:401;return NextResponse.json({error:status===503?'Tente novamente.':'Evento não autorizado ou inválido.'},{status,headers:paymentHeaders});}
}
