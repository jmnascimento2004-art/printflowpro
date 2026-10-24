'use client';
import {supabase} from '@/lib/supabaseClient';
export async function chatFetch<T>(path:string,body?:unknown,signal?:AbortSignal):Promise<T>{
 const {data}=await supabase.auth.getSession();
 const perform=()=>fetch(path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(data.session?{Authorization:`Bearer ${data.session.access_token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal});
 // Coordinate first HttpOnly cookie bootstrap across tabs, without creating a conversation.
 const response=!body&&path==='/api/store/chat'&&typeof navigator!=='undefined'&&navigator.locks?await navigator.locks.request('printflow-store-chat-bootstrap',perform):await perform();
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Atendimento indisponível.');return result;
}
/** Stream carries invalidations only. REST supplies the authorized immutable message DTO. */
export function watchPublicChat(refresh:()=>void){
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
 const run=async()=>{try{
 const {data}=await supabase.auth.getSession();
 const response=await fetch('/api/store/chat/stream',{headers:data.session?{Authorization:`Bearer ${data.session.access_token}`}:{},cache:'no-store',signal:controller.signal});
 if(!response.ok||!response.body)throw new Error('Stream unavailable');
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(!controller.signal.aborted){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const frames=buffer.split('\n\n');buffer=frames.pop()||'';for(const frame of frames)if(frame.includes('event: refresh'))refresh();}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 }catch{/* The visible conversation continues through the bounded polling fallback. */}
 if(!controller.signal.aborted)timer=setTimeout(run,6000);};void run();
 return()=>{controller.abort();clearTimeout(timer);};
}
