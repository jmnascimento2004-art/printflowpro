import {NextRequest} from 'next/server';
import {chatHeaders,chatVisitorContext,chatVisitorRead} from '@/lib/chat/public.server';
import {reviewRate} from '@/lib/reviews-server';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:NextRequest){try{
 const ctx=await chatVisitorContext(request);await reviewRate(request,`chat-stream:${ctx.companyId}`,12);
 if(ctx.hash)await reviewRate(request,`chat-stream-session:${ctx.companyId}:${ctx.hash}`,3);
 const initial=await chatVisitorRead(ctx);if(!initial.conversation)return new Response(null,{status:204,headers:chatHeaders});
 const cid=initial.conversation.id,encoder=new TextEncoder();let cleanup=()=>{};
 const stream=new ReadableStream({async start(controller){
 let ended=false,busy=false;const send=()=>{if(!ended)controller.enqueue(encoder.encode('event: refresh\ndata: {}\n\n'));};
 const channel=ctx.client.channel(`store-chat:${cid}:${crypto.randomUUID()}`).on('postgres_changes',{event:'*',schema:'public',table:'store_chat_conversations',filter:`id=eq.${cid}`},()=>{void validate();});
 const end=()=>{if(ended)return;ended=true;clearInterval(heartbeat);clearTimeout(deadline);request.signal.removeEventListener('abort',end);void ctx.client.removeChannel(channel);controller.close();};
 // Never forward service-role payloads. Revalidate the bounded session before emitting an invalidation.
 const validate=async()=>{if(busy||ended)return;busy=true;try{const verified=await chatVisitorContext(request);if(verified.actor!==ctx.actor||verified.hash!==ctx.hash){end();return;}const current=await chatVisitorRead(verified);if(current.conversation?.id!==cid){end();return;}send();}catch{end();}finally{busy=false;}};
 const heartbeat=setInterval(()=>{void validate();},10000),deadline=setTimeout(end,45000);cleanup=end;
 request.signal.addEventListener('abort',end,{once:true});
 channel.subscribe(status=>{if(status==='SUBSCRIBED')void validate();if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')end();});
 if(request.signal.aborted)end();
 },cancel(){cleanup();}});
 return new Response(stream,{headers:{...chatHeaders,'Content-Type':'text/event-stream','X-Accel-Buffering':'no','Connection':'keep-alive'}});
 }catch{return new Response(null,{status:403,headers:chatHeaders});}}
