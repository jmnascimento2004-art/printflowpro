'use client';
import {useEffect,useRef} from 'react';
import type {ChatMessage} from '@/lib/chat/types';
export function ChatMessages({messages,publicView=false,onHistory}:{messages:ChatMessage[];publicView?:boolean;onHistory?:()=>void}){
 const end=useRef<HTMLDivElement>(null);
 const lastMessageId=messages.at(-1)?.id;
 useEffect(()=>{end.current?.scrollIntoView({block:'nearest'});},[lastMessageId]);
 return <div className="flex-1 min-h-0 space-y-3 overflow-y-auto p-4" role="log" aria-label="Mensagens do atendimento" aria-live="polite">{messages[0]?.seq>1&&onHistory&&<button type="button" onClick={onHistory} className="mx-auto block min-h-9 rounded-lg border bg-card px-3 text-xs text-foreground">Carregar mensagens anteriores</button>}{messages.map(m=>{
 const mine=publicView?['visitor','customer'].includes(m.sender_type):m.sender_type==='agent';
 return <div key={m.id} className={`flex ${m.sender_type==='system'?'justify-center':mine?'justify-end':'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${m.sender_type==='system'?'bg-muted text-muted-foreground text-center text-xs':m.sender_type!=='agent'?'bg-primary text-primary-foreground rounded-br-sm':'bg-card border border-border text-foreground rounded-bl-sm'}`}><p className="mb-1 text-[10px] font-semibold">{m.sender_type==='system'?'Atendimento':m.sender_type==='agent'?'Equipe':publicView?'Você':'Cliente / visitante'}</p><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{m.content}</p><time className="mt-1 block text-right text-[10px]" dateTime={m.created_at}>{new Date(m.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</time></div></div>;
 })}<div ref={end}/></div>;
}
