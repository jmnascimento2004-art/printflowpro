// Project operational timezone, shared with commercial reporting. Civil dates never pass through UTC midnight.
export const AGENDA_TIMEZONE = 'America/Bahia';
export const AGENDA_TYPES = { compromisso: 'Compromisso', reuniao: 'Reunião', visita: 'Visita técnica', instalacao: 'Instalação', retirada: 'Retirada', entrega: 'Entrega', outro: 'Outro' };
export const AGENDA_SOURCES = { manual: 'Compromissos', orders: 'Pedidos', quotes: 'Orçamentos', production: 'Produção', shipping: 'Expedição', financial: 'Financeiro',field_services:'Serviços externos' };
export type AgendaSource = keyof typeof AGENDA_SOURCES;
export type AgendaStatus = 'agendado' | 'concluido' | 'cancelado';
export type ManualEvent = {
  id: string; company_id: string; title: string; description: string; event_type: keyof typeof AGENDA_TYPES;
  start_at: string; end_at: string | null; customer_id: string | null; responsible_profile_id: string;
  status: AgendaStatus; reminder_minutes: number | null; recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrence_until: string | null; updated_at: string;
};
export type AgendaEvent = {
  id: string; source_type: AgendaSource; source_id: string; url: string; title: string; start_at: string; end_at: string | null;
  date: string; all_day: boolean; status: AgendaStatus; source_status: string; event_type: string;
  customer_id: string | null; responsible_profile_id: string | null; responsible_name?: string; manual?: ManualEvent;
  conflict?: boolean; participant_profile_ids?:string[];
};
const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: AGENDA_TIMEZONE, year:'numeric', month:'2-digit', day:'2-digit' });
export const agendaDate = (value: string | Date) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayFormatter.format(new Date(value));
export const agendaTime = (value: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: AGENDA_TIMEZONE, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).format(new Date(value));
export const localInstant = (date: string, time='00:00') => new Date(`${date}T${time}:00-03:00`).toISOString();
export function shiftDate(date: string, days: number) { const d=new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
export function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value; }
export function validateWindow(from: string, to: string) {
  if (!validDate(from) || !validDate(to) || to<from || (Date.parse(to)-Date.parse(from))/86400000>61) throw new Error('Selecione um período de até 62 dias.');
}
export function calendarWindow(date: string, view: string) {
  if (view==='day') return {from:date,to:date};
  if (view==='week') { const dow=new Date(`${date}T12:00Z`).getUTCDay(); const from=shiftDate(date,-((dow+6)%7)); return {from,to:shiftDate(from,6)}; }
  const first=`${date.slice(0,7)}-01`, d=new Date(`${first}T12:00Z`); d.setUTCMonth(d.getUTCMonth()+1); d.setUTCDate(0);
  return {from:first,to:d.toISOString().slice(0,10)};
}
export function validateManual(input: Record<string, unknown>) {
  const title=String(input.title||'').trim(), description=String(input.description||'');
  if (!title || title.length>160 || description.length>4000 || !Object.hasOwn(AGENDA_TYPES,String(input.event_type))) throw new Error('Informe título e tipo válidos.');
  const start=String(input.start_at||''), end=input.end_at ? String(input.end_at) : null;
  if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(start) || !Number.isFinite(Date.parse(start)) || (end && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(end) || !Number.isFinite(Date.parse(end)) || Date.parse(end)<=Date.parse(start) || Date.parse(end)-Date.parse(start)>604800000))) throw new Error('Horário final deve ser posterior ao início (até 7 dias).');
  const recurrence=String(input.recurrence||'none'), until=input.recurrence_until ? String(input.recurrence_until) : null;
  if (!['none','daily','weekly','monthly'].includes(recurrence) || (recurrence!=='none' && (!until || !validDate(until) || until<agendaDate(start) || until>shiftDate(agendaDate(start),730)))) throw new Error('Defina o fim da repetição, em até dois anos.');
  const reminder=input.reminder_minutes===null || input.reminder_minutes===undefined ? null : Number(input.reminder_minutes);
  if (reminder!==null && (!Number.isInteger(reminder)||reminder<0||reminder>10080)) throw new Error('Antecedência inválida.');
  if (!input.responsible_profile_id || !['agendado','concluido','cancelado'].includes(String(input.status||'agendado'))) throw new Error('Informe responsável e status válidos.');
  return {title,description,event_type:String(input.event_type),start_at:start,end_at:end,customer_id:input.customer_id ? String(input.customer_id) : null,responsible_profile_id:String(input.responsible_profile_id),status:String(input.status||'agendado'),recurrence,recurrence_until:recurrence==='none'?null:until,reminder_minutes:reminder};
}
// Expand only the requested window. Monthly dates clamp to month end (31 Jan -> 28 Feb), then return to the original day.
export function expandManual(rows: ManualEvent[], from: string, to: string): AgendaEvent[] {
  validateWindow(from,to); const events:AgendaEvent[]=[];
  for (const row of rows) {
    const original=agendaDate(row.start_at), duration=row.end_at ? Date.parse(row.end_at)-Date.parse(row.start_at) : 0;
    for (let day=shiftDate(from,-7);day<=to;day=shiftDate(day,1)) {
      if (day<original || (row.recurrence_until && day>row.recurrence_until)) continue;
      const distance=(Date.parse(day)-Date.parse(original))/86400000;
      const last=new Date(Date.UTC(Number(day.slice(0,4)),Number(day.slice(5,7)),0)).getUTCDate();
      const matches=row.recurrence==='none'?day===original:row.recurrence==='daily'?true:row.recurrence==='weekly'?distance%7===0:Number(day.slice(8))===Math.min(Number(original.slice(8)),last);
      if (!matches) continue;
      const start=row.recurrence==='none'?row.start_at:localInstant(day,agendaTime(row.start_at));
      const end=duration?new Date(Date.parse(start)+duration).toISOString():null;
      if (day<from && (!end || Date.parse(end)<=Date.parse(localInstant(from)))) continue;
      events.push({id:`manual:${row.id}:${start}`,source_type:'manual',source_id:row.id,url:'/agenda',title:row.title,start_at:start,end_at:end,date:day,all_day:false,status:row.status,source_status:row.status,event_type:row.event_type,customer_id:row.customer_id,responsible_profile_id:row.responsible_profile_id,manual:row});
    }
  }
  return events;
}
export function markConflicts(events: AgendaEvent[]) {
  const groups=new Map<string,AgendaEvent[]>();
  for (const e of events) if(['manual','field_services'].includes(e.source_type)&&e.status==='agendado'&&e.end_at) for(const id of new Set([e.responsible_profile_id,...(e.participant_profile_ids||[])].filter((id):id is string=>!!id))) { const group=groups.get(id)||[]; group.push(e);groups.set(id,group); }
  for(const group of groups.values()) { group.sort((a,b)=>Date.parse(a.start_at)-Date.parse(b.start_at)); let longest:AgendaEvent|undefined;
    for(const e of group) { if(longest && Date.parse(e.start_at)<Date.parse(longest.end_at!)) {e.conflict=true;longest.conflict=true;} if(!longest || Date.parse(e.end_at!)>Date.parse(longest.end_at!)) longest=e; }
  } return events;
}
export function agendaSummary(events:AgendaEvent[], now=new Date(), from?:string, to?:string) {
  const today=agendaDate(now), active=events.filter(e=>e.status==='agendado');
  return {total:events.length,pending:active.length,completed:events.filter(e=>e.status==='concluido').length,cancelled:events.filter(e=>e.status==='cancelado').length,
    overdue:active.filter(e=>e.date<today).length,today:active.filter(e=>e.date===today).length,conflicts:events.filter(e=>e.conflict).length,
    plannedHours:Math.round(active.filter(e=>['manual','field_services'].includes(e.source_type)&&e.end_at).reduce((sum,e)=>sum+Math.max(0,Math.min(Date.parse(e.end_at!),to?Date.parse(localInstant(shiftDate(to,1))):Infinity)-Math.max(Date.parse(e.start_at),from?Date.parse(localInstant(from)):-Infinity))/3600000,0)*100)/100,
    busyPeople:new Set(active.filter(e=>['manual','field_services'].includes(e.source_type)&&e.end_at).flatMap(e=>[e.responsible_profile_id,...(e.participant_profile_ids||[])].filter(Boolean))).size};
}
export function dueReminders(events:AgendaEvent[], now=new Date()) { return events.filter(e=>e.manual?.reminder_minutes!==null && e.manual?.reminder_minutes!==undefined && e.status==='agendado' && now.getTime()>=Date.parse(e.start_at)-e.manual.reminder_minutes*60000 && now.getTime()<=Date.parse(e.end_at||e.start_at)+3600000); }
