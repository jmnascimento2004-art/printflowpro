'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { AGENDA_TYPES, agendaDate, agendaTime, localInstant, type ManualEvent } from '@/lib/agenda';
import { useAgenda, type AgendaOptions } from './use-agenda';
import { CustomerPicker } from './customer-picker';

export const fieldClass='w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm';
const inputClass = 'h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60';
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 space-y-1 text-xs font-semibold text-muted-foreground">{label}{children}</label>;
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3 rounded-xl border border-border bg-secondary/20 p-3 sm:p-4"><h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>{children}</section>;
}
export function EventForm({event,date,onClose,onSaved}:{event?:ManualEvent;date:string;onClose:()=>void;onSaved:()=>void}) {
  const {session,activeProfile}=useAuth();
  const [search,setSearch]=useState('');
  const [responsible,setResponsible]=useState(event?.responsible_profile_id||activeProfile.id);
  const [customer,setCustomer]=useState(event?.customer_id||'');
  const options=useAgenda<AgendaOptions>(`mode=options&q=${encodeURIComponent(search)}`);
  const [recurrence,setRecurrence]=useState(event?.recurrence||'none');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const containers = [document.documentElement, document.body, ...document.querySelectorAll('main')];
    const overflows = containers.map(container => container.style.overflow);
    containers.forEach(container => { container.style.overflow = 'hidden'; });
    element.showModal();
    element.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => {
      element.close();
      containers.forEach((container, index) => { container.style.overflow = overflows[index]; });
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  async function save(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();if(submitting.current)return;
    const f=new FormData(e.currentTarget), start=String(f.get('date')),time=String(f.get('time')),end=String(f.get('end'));
    submitting.current=true;setBusy(true);setError('');
    try {
      const response=await fetch('/api/agenda',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token}`},body:JSON.stringify({
        id:event?.id,updated_at:event?.updated_at,title:f.get('title'),description:f.get('description'),event_type:f.get('event_type'),
        start_at:localInstant(start,time),end_at:end?localInstant(String(f.get('end_date')||start),end):null,
        responsible_profile_id:f.get('responsible'),customer_id:f.get('customer')||null,status:f.get('status'),recurrence,recurrence_until:f.get('until'),
        reminder_minutes:f.get('reminder')===''?null:Number(f.get('reminder'))
      })});
      const result=await response.json();if(!response.ok)throw new Error(result.error);onSaved();
    }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.');}finally{submitting.current=false;setBusy(false);}
  }
  if (typeof document === 'undefined') return null;
  return createPortal(<dialog ref={dialog} role="dialog" aria-modal="true" aria-labelledby="agenda-form-title" aria-describedby="agenda-form-description"
    onCancel={e => { e.preventDefault(); if (!submitting.current) onClose(); }}
    onKeyDown={e => {
      if (e.key !== 'Tab') return;
      const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)'));
      const first = controls[0], last = controls.at(-1);
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }}
    className="m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-slate-950/65 backdrop:backdrop-blur-sm sm:max-h-[calc(100dvh-3rem)] sm:w-[calc(100%-3rem)]">
    <form onSubmit={save} className="flex max-h-[calc(100dvh-1rem-2px)] flex-col sm:max-h-[calc(100dvh-3rem-2px)]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-[18px] w-[18px]" aria-hidden="true" /></span><div>
          <h2 id="agenda-form-title" className="text-sm font-bold uppercase tracking-wider">{event?'Editar compromisso':'Novo compromisso'}</h2>
          <p id="agenda-form-description" className="mt-0.5 text-[11px] text-muted-foreground">Cadastre compromissos, visitas, entregas e lembretes.</p>
        </div></div>
        <button type="button" disabled={busy} onClick={onClose} aria-label="Fechar compromisso" className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-secondary disabled:opacity-50"><X className="h-4 w-4" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
        <fieldset disabled={busy} className="min-w-0 space-y-4">
          <Section title="Compromisso">
            <Field label="Título"><input required maxLength={160} name="title" defaultValue={event?.title} placeholder="Descreva o compromisso" className={inputClass}/></Field>
            <div className={`grid gap-3 ${event ? 'sm:grid-cols-2' : ''}`}>
              <Field label="Tipo"><select name="event_type" defaultValue={event?.event_type||'compromisso'} className={inputClass}>{Object.entries(AGENDA_TYPES).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
              {event ? <Field label="Status"><select name="status" defaultValue={event.status} className={inputClass}><option value="agendado">Agendado</option><option value="concluido">Concluído</option><option value="cancelado">Cancelado</option></select></Field> : <input type="hidden" name="status" value="agendado" />}
            </div>
          </Section>
          <Section title="Data e horário">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Data inicial"><input required type="date" name="date" defaultValue={event?agendaDate(event.start_at):date} className={inputClass}/></Field>
              <Field label="Hora início"><input required type="time" name="time" defaultValue={event?agendaTime(event.start_at):'09:00'} className={inputClass}/></Field>
              <Field label="Data final"><input type="date" name="end_date" defaultValue={event?.end_at?agendaDate(event.end_at):date} className={inputClass}/></Field>
              <Field label="Hora fim (opcional)"><input type="time" name="end" defaultValue={event?.end_at?agendaTime(event.end_at):''} className={inputClass}/></Field>
            </div>
            <p className="text-[11px] text-muted-foreground">Horários de Brasília · America/Bahia.</p>
          </Section>
          <Section title="Vínculos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Responsável"><select required name="responsible" value={responsible} onChange={e=>setResponsible(e.target.value)} className={inputClass}>
                <option value="">Selecione</option>{responsible&&!options.data?.profiles.some(p=>p.id===responsible)&&<option value={responsible}>Responsável atual (confirme disponibilidade)</option>}{options.data?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
              </select></Field>
              <CustomerPicker value={customer} onChange={setCustomer} query={search} onQuery={setSearch} options={options.data?.customers || []} loading={!options.data && !options.error} inputClass={inputClass}/>
            </div>
          </Section>
          <Section title="Lembrete e recorrência">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Recorrência"><select value={recurrence} onChange={e=>setRecurrence(e.target.value as ManualEvent['recurrence'])} className={inputClass}><option value="none">Não repete</option><option value="daily">Diário</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></Field>
              <Field label="Lembrete"><select name="reminder" defaultValue={event?.reminder_minutes??''} className={inputClass}><option value="">Sem lembrete</option>{[[0,'Na hora'],[15,'15 minutos antes'],[30,'30 minutos antes'],[60,'1 hora antes'],[1440,'1 dia antes'],[10080,'7 dias antes']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Field>
            </div>
            {recurrence!=='none'&&<Field label="Repetir até"><input required name="until" type="date" defaultValue={event?.recurrence_until||''} className={inputClass}/><span className="block text-[11px] font-normal text-muted-foreground">Até dois anos. Mensal: dias inexistentes usam o último dia do mês. O status vale para toda a série.</span></Field>}
            <Field label="Observações"><textarea name="description" maxLength={4000} defaultValue={event?.description} className={`${inputClass} h-auto py-2`} rows={3}/></Field>
          </Section>
        </fieldset>
      </div>
      <footer className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3.5 sm:px-6">
        {(error||options.error)&&<p role="alert" className="text-sm text-red-600">{error||options.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="min-h-10 rounded-xl bg-secondary px-4 py-2 text-xs font-semibold disabled:opacity-50">Cancelar</button>
          <button disabled={busy||!options.data} className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true"/> : <Check className="h-4 w-4" aria-hidden="true"/>}{busy?'Salvando…':event?'Salvar alterações':'Criar compromisso'}
          </button>
        </div>
      </footer>
    </form>
  </dialog>, document.body);
}
