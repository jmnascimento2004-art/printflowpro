import 'server-only';
import {createHash} from 'node:crypto';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {parseQaWebhook,signQaWebhook} from './provider.mjs';

export const paymentHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'};
export async function paymentRate(request:Request,scope:string,limit:number){
 const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 const key=createHash('sha256').update(`${scope}:${ip}`).digest('hex');
 const {data,error}=await getSupabaseAdminClient().rpc('payment_public_rate',{p_key:key,p_limit:limit});if(error||data!==true)throw new Error('RATE_LIMIT');
}
export async function qaSecret(){const {data,error}=await getSupabaseAdminClient().rpc('payment_provider_secret');if(error||typeof data!=='string'||data.length<32)throw new Error('Provider unavailable');return data;}
export async function consumePaymentWebhook(body:string,timestamp:string,signature:string){
 const event=parseQaWebhook(body,timestamp,signature,await qaSecret());
 const {data,error}=await getSupabaseAdminClient().rpc('payment_link_webhook',{p_event:event});if(error)throw error;return data;
}
export async function simulateQaEvent(event:Record<string,unknown>){
 const body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000)),signature=signQaWebhook(body,timestamp,await qaSecret());
 return consumePaymentWebhook(body,timestamp,signature);
}
export function paymentOrigin(storeHost?:string){
 if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production'){
  const host=process.env.VERCEL_BRANCH_URL||process.env.VERCEL_URL;if(host&&/^[a-z0-9.-]+\.vercel\.app$/.test(host))return `https://${host}`;
 }
 if(process.env.NODE_ENV!=='production')return 'http://localhost:3000';
 if(storeHost&&/^[a-z0-9.-]+\.[a-z]{2,}$/.test(storeHost))return `https://${storeHost}`;
 throw new Error('Public payment domain unavailable');
}
