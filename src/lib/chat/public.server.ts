import 'server-only';
import {createHash,randomBytes} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {resolveStoreBoundary} from '@/lib/store/store-boundary.server';
import {reviewActor} from '@/lib/reviews-server';
import type {ChatPublic} from './types';
import {billingErrorMessage} from '@/lib/billing/errors.mjs';
export const chatCookie=process.env.NODE_ENV==='production'?'__Secure-pf-chat':'pf-chat';
export const chatHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function chatVisitorContext(request:NextRequest,create=false){
 const {client,companyId}=await resolveStoreBoundary(request),actor=await reviewActor(request);
 const existing=request.cookies.get(chatCookie)?.value;
 const token=existing&&/^[a-f0-9]{64}$/.test(existing)?existing:create?randomBytes(32).toString('hex'):null;
 return {client,companyId,actor,token,hash:token?createHash('sha256').update(token).digest('hex'):null};
}
export async function chatVisitorRead(ctx:Awaited<ReturnType<typeof chatVisitorContext>>,action='read',payload:Record<string,unknown>={}){
 if(!ctx.hash)return {conversation:null,messages:[]} as ChatPublic;
 const {data,error}=await ctx.client.rpc('store_chat_visitor',{p_company:ctx.companyId,p_token_hash:ctx.hash,p_actor:ctx.actor,p_action:action,p_payload:payload});
 if(error){const controlled=['Aguarde antes de enviar mais mensagens','Mensagem inválida','Comando já utilizado','Contexto indisponível'].find(message=>error.message===message);throw new Error(billingErrorMessage(error)||controlled||(error.message.includes('expirada')?'Sessão de atendimento expirada. Inicie outra conversa.':'Não foi possível acessar o atendimento.'));}
 return data as ChatPublic;
}
export function setChatCookie(response:NextResponse,token:string){response.cookies.set(chatCookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/store/chat',maxAge:7*24*60*60});}
