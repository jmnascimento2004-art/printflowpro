'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabaseClient';
import {useAuth} from '@/context/auth-context';
import {useDatabase} from '@/context/database-context';
import {canAccessModule} from '@/lib/module-permissions';
export function ChatUnreadBadge(){
 const {activeProfile}=useAuth(),{company,rolePermissions}=useDatabase(),[count,setCount]=useState(0),allowed=canAccessModule(activeProfile.role,'/attendance',rolePermissions);
 useEffect(()=>{if(!allowed)return;let active=true;let timer:ReturnType<typeof setTimeout>;const refresh=async()=>{if(document.hidden)return;const {data,error}=await supabase.rpc('store_chat_unread');if(active&&!error)setCount(Number(data)||0);};const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{void refresh();},300);};void refresh();const channel=supabase.channel(`chat-unread:${company.id}:${crypto.randomUUID()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'store_chat_messages',filter:`company_id=eq.${company.id}`},schedule).subscribe();const poll=setInterval(refresh,30000);window.addEventListener('chat:read',schedule);window.addEventListener('focus',schedule);return()=>{active=false;clearTimeout(timer);clearInterval(poll);window.removeEventListener('chat:read',schedule);window.removeEventListener('focus',schedule);void supabase.removeChannel(channel);};},[company.id,activeProfile.id,allowed]);
 return allowed&&count>0?<span aria-live="polite" aria-label={`${count} mensagens não lidas no Atendimento`} className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">{count>99?'99+':count}</span>:null;
}
