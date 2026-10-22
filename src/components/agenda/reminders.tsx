'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { useDatabase } from '@/context/database-context';
import { canAccessModule } from '@/lib/module-permissions';
import { agendaTime, type AgendaEvent } from '@/lib/agenda';
import { useAgenda } from './use-agenda';
export function AgendaReminders(){
  const {session,activeProfile}=useAuth(),{rolePermissions}=useDatabase();
  const allowed=canAccessModule(activeProfile.role,'/agenda',rolePermissions);
  const result=useAgenda<{events:AgendaEvent[];total:number}>('mode=reminders',allowed,60000);
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  async function ack(event:AgendaEvent){
    if(busy)return;setBusy(event.id);setError('');
    try{const response=await fetch('/api/agenda',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({action:'ack',id:event.source_id,start_at:event.start_at})});const value=await response.json();if(!response.ok)throw new Error(value.error);result.refresh();}
    catch(e){setError(e instanceof Error?e.message:'Falha ao confirmar lembrete.');}finally{setBusy('');}
  }
  if(!allowed)return null;
  return <section className="border-b border-border p-3 text-xs"><div className="flex justify-between font-bold"><Link href="/agenda">Lembretes da Agenda</Link><button onClick={()=>result.refresh()}>Atualizar</button></div>
    <div className="max-h-48 overflow-auto">{result.data?.events.map(e=><div key={e.id} className="py-2"><Link href="/agenda" className="block">{e.title} · {agendaTime(e.start_at)}</Link><button disabled={!!busy} onClick={()=>ack(e)} className="mt-1 text-primary disabled:opacity-50">{busy===e.id?'Confirmando…':'Marcar como visto'}</button></div>)}{result.data?.total===0&&<p className="mt-2 text-muted-foreground">Nenhum lembrete pendente.</p>}</div>
    {(error||result.error)&&<p role="alert" className="text-red-600">{error||result.error}</p>}
  </section>;
}
