import {NextResponse} from 'next/server';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {paymentHeaders,paymentRate} from '@/lib/payments/server';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{token:string}>}){try{
 await paymentRate(request,'public-payment',60);const {token}=await params;
 const host=request.headers.get('host')?.toLowerCase().split(':')[0];if(!host||!/^[a-z0-9.-]+$/.test(host))throw new Error('Invalid host');
 const preview=process.env.VERCEL_ENV==='preview'&&[process.env.VERCEL_BRANCH_URL,process.env.VERCEL_URL].includes(host)||process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(host);
 const {data,error}=await getSupabaseAdminClient().rpc('payment_public_source',{p_token:token,p_host:host,p_preview:preview});if(error)throw error;
 if(!data)return NextResponse.json({error:'Link indisponível.'},{status:404,headers:paymentHeaders});return NextResponse.json(data,{headers:paymentHeaders});
 }catch(error){return NextResponse.json({error:'Não foi possível consultar o link agora.'},{status:error instanceof Error&&error.message==='RATE_LIMIT'?429:503,headers:paymentHeaders});}}
