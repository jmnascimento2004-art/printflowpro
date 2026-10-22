'use client';
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/context/auth-context';
import { AGENDA_TYPES, agendaDate, agendaTime, localInstant, type ManualEvent } from '@/lib/agenda';
import { useAgenda, type AgendaOptions } from './use-agenda';
export const fieldClass='w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm';
export function EventForm({event,date,onClose,onSaved}:{event?:ManualEvent;date:string;onClose:()=>void;onSaved:()=>void}) {
  const {session,activeProfile}=useAuth();
  const [search,setSearch]=useState('');
  const [responsible,setResponsible]=useState(event?.responsible_profile_id||activeProfile.id);
  const [customer,setCustomer]=useState(event?.customer_id||'');
  const options=useAgenda<AgendaOptions>(`mode=options&q=${encodeURIComponent(search)}`);
  const [recurrence,setRecurrence]=useState(event?.recurrence||'none');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(busy)return;
    const f=new FormData(e.currentTarget), start=String(f.get('date')),time=String(f.get('time')),end=String(f.get('end'));
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/agenda',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({
        id:event?.id,updated_at:event?.updated_at,title:f.get('title'),description:f.get('description'),event_type:f.get('event_type'),
        start_at:localInstant(start,time),end_at:end?localInstant(String(f.get('end_date')||start),end):null,
        responsible_profile_id:f.get('responsible'),customer_id:f.get('customer')||null,status:f.get('status'),recurrence,recurrence_until:f.get('until'),
        reminder_minutes:f.get('reminder')===''?null:Number(f.get('reminder'))
      })});
      const result=await response.json();if(!response.ok)throw new Error(result.error);onSaved();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-[80] flex justify-end bg-black/40" role="dialog" aria-modal="true" aria-label={event?'Editar compromisso':'Novo compromisso'}>
    <form onSubmit={save} className="h-full w-full max-w-lg overflow-y-auto bg-card p-5 pb-24 shadow-xl space-y-4">
      <fieldset disabled={busy} className="space-y-4">
      <div className="flex justify-between items-center"><h2 className="font-bold text-lg">{event?'Editar compromisso':'Novo compromisso'}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Fechar compromisso">✕</button></div>
      <p className="text-xs text-muted-foreground">Horários de Brasília · America/Bahia. {event?.recurrence!=='none'&&event?'Alterações e status se aplicam à série inteira.':''}</p>
      <label className="block text-sm">Título<input autoFocus required maxLength={160} name="title" defaultValue={event?.title} className={fieldClass}/></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Data<input required type="date" name="date" defaultValue={event?agendaDate(event.start_at):date} className={fieldClass}/></label><label className="text-sm">Hora início<input required type="time" name="time" defaultValue={event?agendaTime(event.start_at):'09:00'} className={fieldClass}/></label>
      <label className="text-sm">Data fim<input type="date" name="end_date" defaultValue={event?.end_at?agendaDate(event.end_at):date} className={fieldClass}/></label><label className="text-sm">Hora fim (opcional)<input type="time" name="end" defaultValue={event?.end_at?agendaTime(event.end_at):''} className={fieldClass}/></label></div>
      <label className="block text-sm">Responsável<select required name="responsible" value={responsible} onChange={e=>setResponsible(e.target.value)} className={fieldClass}>
        <option value="">Selecione</option>{event&&!options.data?.profiles.some(p=>p.id===event.responsible_profile_id)&&<option value={event.responsible_profile_id}>Responsável atual (confirme disponibilidade)</option>}{options.data?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <label className="block text-sm">Buscar cliente<input value={search} onChange={e=>setSearch(e.target.value)} className={fieldClass} placeholder="Nome do cliente"/></label>
      <label className="block text-sm">Cliente (opcional)<select name="customer" value={customer} onChange={e=>setCustomer(e.target.value)} className={fieldClass}><option value="">Sem cliente</option>{customer&&!options.data?.customers.some(c=>c.id===customer)&&<option value={customer}>Cliente vinculado</option>}{options.data?.customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">Tipo<select name="event_type" defaultValue={event?.event_type||'compromisso'} className={fieldClass}>{Object.entries(AGENDA_TYPES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      <label className="text-sm">Status<select name="status" defaultValue={event?.status||'agendado'} className={fieldClass}><option value="agendado">Agendado</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></label></div>
      <label className="block text-sm">Observação<textarea name="description" maxLength={4000} defaultValue={event?.description} className={fieldClass} rows={3}/></label>
      <label className="block text-sm">Lembrete<select name="reminder" defaultValue={event?.reminder_minutes??''} className={fieldClass}><option value="">Sem lembrete</option>{[[0,'Na hora'],[15,'15 minutos antes'],[30,'30 minutos antes'],[60,'1 hora antes'],[1440,'1 dia antes'],[10080,'7 dias antes']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label className="block text-sm">Recorrência<select value={recurrence} onChange={e=>setRecurrence(e.target.value as ManualEvent['recurrence'])} className={fieldClass}><option value="none">Não repete</option><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></label>
      {recurrence!=='none'&&<label className="block text-sm">Repetir até<input required name="until" type="date" defaultValue={event?.recurrence_until||''} className={fieldClass}/><span className="text-xs text-muted-foreground">Até dois anos. Mensal: dias inexistentes usam o último dia do mês. O status vale para toda a série.</span></label>}
      {(error||options.error)&&<p role="alert" className="text-sm text-red-600">{error||options.error}</p>}
      <button disabled={busy||!options.data} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy?'Salvando…':'Salvar compromisso'}</button>
      </fieldset>
    </form>
  </div>;
}
