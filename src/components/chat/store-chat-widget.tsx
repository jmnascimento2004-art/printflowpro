'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {usePathname} from 'next/navigation';
import {MessageCircle,Send,X,ArrowUpRight} from 'lucide-react';
import {useDatabase} from '@/context/database-context';
import {useStoreCustomer} from '@/context/store-customer-context';
import {chatFetch,watchPublicChat} from '@/lib/chat/client';
import {chatStatus,mergeChatMessages,type ChatPublic,type ChatMessage} from '@/lib/chat/types';
import {ChatMessages} from './chat-messages';
type PublicData=ChatPublic&{brand?:{name:string;logo_url?:string};hours?:string;greeting?:string;away_message?:string};
export function StoreChatWidget({hidden=false,productId,orderId}:{hidden?:boolean;productId?:string;orderId?:string}){
 const pathname=usePathname(),{company}=useDatabase(),{session}=useStoreCustomer();
 const [open,setOpen]=useState(false),[data,setData]=useState<PublicData>({conversation:null,messages:[]}),[text,setText]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false),[handoff,setHandoff]=useState('');
 const [context,setContext]=useState({product_id:productId,order_id:orderId}),busy=useRef(false),generation=useRef(0),sendCommand=useRef<{id:string;text:string}|null>(null);
 const [history,setHistory]=useState<ChatMessage[]>([]);
 const [ready,setReady]=useState(false);
 const conversationId=data.conversation?.id;
 const allowed=pathname==='/store'||pathname.startsWith('/store/product/')||pathname.startsWith('/store/conta/pedidos');
 const refresh=useCallback(async()=>{if(busy.current||document.hidden)return;busy.current=true;const g=generation.current;try{const next=await chatFetch<PublicData>('/api/store/chat');if(g===generation.current){setData(old=>({...old,...next}));setReady(true);setError('');}}catch(e){if(g===generation.current){setReady(false);setError((e as Error).message);}}finally{busy.current=false;}},[]);
 useEffect(()=>{generation.current++;busy.current=false;setReady(false);setData({conversation:null,messages:[]});setHistory([]);setHandoff('');sendCommand.current=null;if(open)void refresh();},[session?.user.id,open,refresh]);
 useEffect(()=>{const listener=(event:Event)=>{const detail=(event as CustomEvent).detail||{};setContext({product_id:detail.productId,order_id:detail.orderId});setOpen(true);};window.addEventListener('store-chat:open',listener);return()=>window.removeEventListener('store-chat:open',listener);},[]);
 useEffect(()=>{setContext({product_id:productId,order_id:orderId});},[productId,orderId]);
 useEffect(()=>{if(!open||hidden||!allowed)return;const poll=window.setInterval(()=>{void refresh();},15000),focus=()=>{void refresh();};window.addEventListener('focus',focus);const stop=conversationId?watchPublicChat(focus):()=>{};return()=>{clearInterval(poll);window.removeEventListener('focus',focus);stop();};},[open,hidden,allowed,conversationId,session?.user.id,refresh]);
 const visibleSeq=data.messages.at(-1)?.seq||0;
 useEffect(()=>{if(open&&!hidden&&conversationId&&visibleSeq&&!document.hidden)void chatFetch('/api/store/chat',{action:'read_cursor',seq:visibleSeq}).catch(()=>{});},[open,hidden,conversationId,visibleSeq]);
 const send=async()=>{if(pending||!ready||!text.trim())return;setPending(true);setError('');const g=generation.current;if(sendCommand.current?.text!==text)sendCommand.current={id:crypto.randomUUID(),text};try{
 const next=await chatFetch<ChatPublic>('/api/store/chat',{action:data.conversation?'send':'create',content:text,command_id:sendCommand.current.id,...context});if(g===generation.current){setData(old=>({...old,...next}));setText('');sendCommand.current=null;}
 }catch(e){if(g===generation.current)setError((e as Error).message);}finally{setPending(false);}};
 const resetSession=async()=>{if(pending)return;setPending(true);const g=++generation.current;setReady(false);setData({conversation:null,messages:[]});setHistory([]);setHandoff('');sendCommand.current=null;try{await chatFetch('/api/store/chat',{action:'reset'});if(g===generation.current){setError('');await refresh();}}catch(e){if(g===generation.current)setError((e as Error).message);}finally{setPending(false);}};
 const prepareHandoff=async()=>{if(pending)return;setPending(true);const g=generation.current;try{const result=await chatFetch<{href:string}>('/api/store/chat',{action:'whatsapp'});if(g===generation.current)setHandoff(result.href);}catch(e){if(g===generation.current)setError((e as Error).message);}finally{setPending(false);}};
 if(!allowed||hidden)return null;
 const primary=({emerald:'#5b3df4',blue:'#2563eb',violet:'#5b3df4',amber:'#d97706',rose:'#e11d48'} as Record<string,string>)[company.theme_color||'']||(/^#[a-f0-9]{6}$/i.test(company.theme_color||'')?company.theme_color:'#5b3df4');
 return <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-[45] font-sans md:bottom-6" style={{color:'var(--foreground)'}}>
 {!open?<button type="button" onClick={()=>setOpen(true)} style={{backgroundColor:primary}} className="flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-bold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" aria-label="Abrir atendimento da loja"><MessageCircle className="h-5 w-5"/><span className="hidden sm:inline">Atendimento</span></button>:
 <section role="dialog" aria-modal="false" aria-labelledby="store-chat-title" className="flex h-[min(560px,calc(100dvh-9rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
 <header style={{backgroundColor:primary}} className="flex items-center gap-3 p-4 text-white">{company.logo_url&&
 // eslint-disable-next-line @next/next/no-img-element
 <img src={company.logo_url} alt="" className="h-9 w-9 rounded-lg bg-white object-contain p-1"/>}<div className="min-w-0 flex-1"><h2 id="store-chat-title" className="truncate text-sm font-bold">{data.brand?.name||company.name||'Atendimento'}</h2><p className="mt-0.5 text-[11px] text-white/80">{data.conversation?chatStatus[data.conversation.status]:'Converse com nossa equipe'}</p></div><button type="button" aria-label="Fechar atendimento" onClick={()=>setOpen(false)} className="rounded-lg p-2 hover:bg-white/10"><X className="h-5 w-5"/></button></header>
 {!data.conversation&&<div className="space-y-2 px-4 pt-4 text-sm text-slate-700"><p>{data.greeting||'Olá! Como podemos ajudar?'}</p><p className="text-xs text-slate-500">Não é necessário informar dados pessoais. Sessão de 7 dias. <a className="underline" href="/store/privacidade">Privacidade</a></p></div>}
 <ChatMessages messages={mergeChatMessages(history,data.messages)} publicView onHistory={()=>{const g=generation.current,before=mergeChatMessages(history,data.messages)[0]?.seq;void chatFetch<ChatPublic>(`/api/store/chat?before=${before}`).then(result=>{if(g===generation.current)setHistory(old=>mergeChatMessages(old,result.messages));}).catch(e=>setError(e.message));}}/>
 {data.hours&&<p className="border-t px-4 py-2 text-[11px] text-slate-500">Horário: {data.hours}. {data.away_message}</p>}
 {data.conversation?.status==='closed'&&<p className="px-4 py-2 text-xs text-slate-600">Atendimento encerrado. Uma nova mensagem reabre esta conversa durante a sessão.</p>}
 {error&&<div role="alert" className="px-4 py-2 text-xs text-red-700">{error}{error.startsWith('Sessão')?<button className="ml-2 underline" disabled={pending} onClick={()=>void resetSession()}>Iniciar outra conversa</button>:<button className="ml-2 underline" onClick={()=>void refresh()}>Tentar novamente</button>}</div>}
 {handoff&&<div className="border-t bg-white px-4 py-3 text-xs text-slate-700"><p>O WhatsApp abrirá com uma referência curta, sem o histórico.</p><a href={handoff} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1 font-bold text-emerald-800" onClick={()=>setHandoff('')}>Abrir WhatsApp <ArrowUpRight className="h-4 w-4"/></a></div>}
 <form onSubmit={event=>{event.preventDefault();void send();}} className="border-t border-slate-200 bg-white p-3"><label htmlFor="store-chat-message" className="sr-only">Digite sua mensagem</label><div className="flex items-end gap-2"><textarea id="store-chat-message" placeholder="Digite sua mensagem…" value={text} onChange={e=>setText(e.target.value)} maxLength={2000} rows={2} className="min-w-0 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100"/><button disabled={pending||!ready||!text.trim()} aria-label="Enviar mensagem" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white disabled:opacity-40"><Send className="h-4 w-4"/></button></div><div className="mt-2 flex items-center justify-between text-[10px] text-slate-500"><span>{text.length}/2000</span>{data.conversation&&<button type="button" className="min-h-8 font-semibold text-emerald-800" disabled={pending} onClick={()=>void prepareHandoff()}>Continuar no WhatsApp ↗</button>}</div></form>
 </section>}
 </div>;
}
