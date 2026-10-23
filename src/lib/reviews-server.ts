import 'server-only';
import {createHash} from 'node:crypto';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
export const reviewHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function boundedBody(request:Request,limit:number){
 if(Number(request.headers.get('content-length'))>limit)throw new Error('Payload muito grande.');
 const reader=request.body?.getReader();if(!reader)throw new Error('Payload inválido.');
 const parts:Uint8Array[]=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw new Error('Payload muito grande.');parts.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts);
}
export async function reviewRate(request:Request,scope:string,limit:number){
 const ip=request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 const key=createHash('sha256').update(`${scope}:${ip}`).digest('hex');
 const {data,error}=await getSupabaseAdminClient().rpc('product_review_rate',{p_key:key,p_limit:limit});if(error||data!==true)throw new Error('Limite de tentativas. Tente novamente em um minuto.');
}
export async function reviewActor(request:Request,required=false){
 const authorization=request.headers.get('authorization');const token=authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
 if(!token){if(required)throw new Error('Entre com a conta vinculada à compra.');return null;}
 const {data,error}=await getSupabaseAdminClient().auth.getUser(token);if(error||!data.user||data.user.is_anonymous)throw new Error('Entre com a conta vinculada à compra.');return data.user.id;
}
export function reviewOrigin(host:string){
 if(process.env.VERCEL_ENV==='preview'){const h=process.env.VERCEL_BRANCH_URL||process.env.VERCEL_URL;if(h&&/^[a-z0-9.-]+\.vercel\.app$/.test(h))return `https://${h}`;}
 if(process.env.NODE_ENV!=='production')return 'http://localhost:3000';
 if(/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host))return `https://${host}`;throw new Error('Domínio público indisponível.');
}
