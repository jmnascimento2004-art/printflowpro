import {NextRequest,NextResponse} from 'next/server';
import {boundedBody,reviewRate} from '@/lib/reviews-server';
import {requireStoreOrigin} from '@/lib/store/store-boundary.server';
import {chatCookie,chatHeaders,chatVisitorContext,chatVisitorRead,setChatCookie} from '@/lib/chat/public.server';
import {resolveStoreChatWhatsAppHandoff} from '@/lib/whatsapp/system-message-resolver.server';
export const runtime='nodejs';
export async function GET(request:NextRequest){try{
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new Error('Origem inválida.');
 const ctx=await chatVisitorContext(request,true);await reviewRate(request,`chat-read:${ctx.companyId}`,180);
 const before=new URL(request.url).searchParams.get('before');const data=await chatVisitorRead(ctx,'read',before?{before_seq:Number(before)}:{});
 const [{data:company},{data:settings},{data:chat}]=await Promise.all([
 ctx.client.from('companies').select('name,logo_url').eq('id',ctx.companyId).single(),
 ctx.client.from('settings').select('top_bar_hours').eq('company_id',ctx.companyId).maybeSingle(),
 ctx.client.from('store_chat_settings').select('greeting,away_message').eq('company_id',ctx.companyId).maybeSingle()]);
 const response=NextResponse.json({...data,brand:company,hours:settings?.top_bar_hours||'',greeting:chat?.greeting||'Olá! Como podemos ajudar?',away_message:chat?.away_message||'Recebemos sua mensagem. Responderemos no horário de atendimento.'},{headers:chatHeaders});
 if(ctx.token&&!/^[a-f0-9]{64}$/.test(request.cookies.get(chatCookie)?.value||''))setChatCookie(response,ctx.token);
 return response;
 }catch{return NextResponse.json({error:'Sessão de atendimento indisponível. Você pode iniciar outra conversa.'},{status:403,headers:chatHeaders});}}
export async function POST(request:NextRequest){try{
 requireStoreOrigin(request);const body=JSON.parse((await boundedBody(request,12000)).toString());
 if(body.action==='reset'){const response=NextResponse.json({conversation:null,messages:[]},{headers:chatHeaders});response.cookies.set(chatCookie,'',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/store/chat',maxAge:0});return response;}
 if(!['create','send','read_cursor','whatsapp'].includes(body.action))throw new Error('Ação inválida.');
 const ctx=await chatVisitorContext(request);
 if(!ctx.token)throw new Error('Atualize o atendimento antes de enviar sua primeira mensagem.');
 await reviewRate(request,`chat-${body.action}:${ctx.companyId}`,body.action==='create'?5:body.action==='send'?20:60);
 if(['create','send'].includes(body.action)&&(typeof body.content!=='string'||!body.content.trim()||body.content.length>2000||! /^[0-9a-f-]{36}$/i.test(body.command_id||'')))throw new Error('Envie uma mensagem de até 2.000 caracteres.');
 // Explicit payload; browser cannot select sender, customer, tenant or assignee.
 const payload={content:body.content,command_id:body.command_id,product_id:body.product_id,order_id:body.order_id,seq:body.seq};
 let href:string|undefined;
 if(body.action==='whatsapp'){
 const current=await chatVisitorRead(ctx);if(!current.conversation)throw new Error('Conversa indisponível.');
 const result=await resolveStoreChatWhatsAppHandoff(ctx.companyId,current.conversation.id);href=result.href;
 }
 const data=await chatVisitorRead(ctx,body.action,payload),response=NextResponse.json({...data,...(href?{href}: {})},{headers:chatHeaders});
 return response;
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Atendimento indisponível.'},{status:400,headers:chatHeaders});}}
