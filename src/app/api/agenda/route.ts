import { NextResponse } from 'next/server';
import { authenticatePdfRequest, getAuthenticatedPdfClient } from '@/lib/pdf/pdf-server-auth';
import { canAccessModule } from '@/lib/module-permissions';
import { agendaDate, agendaSummary, dueReminders, shiftDate, validateManual, validateWindow, type AgendaEvent } from '@/lib/agenda';
import { loadAgenda } from '@/lib/agenda-server';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
async function context(request:Request) {
  const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request);
  const {data,error}=await client.from('role_permissions').select('path,roles').eq('company_id',access.companyId);
  if(error) throw error;
  const configured=Object.fromEntries((data||[]).map(r=>[r.path,r.roles]));
  const allowed=(path:string)=>canAccessModule(access.role,path,configured);
  if(!allowed('/agenda')) throw Object.assign(new Error('Sem permissão para Agenda.'),{status:403});
  return {access,client,allowed};
}
function failure(error:unknown) { const status=error&&typeof error==='object'&&'status'in error?Number(error.status):500;
  return NextResponse.json({error:status===401?'Entre novamente para continuar.':status===403?'Sem permissão para Agenda.':status===409?'Este compromisso mudou. Atualize a agenda antes de editar.':status===400&&error instanceof Error?error.message:'Não foi possível carregar ou salvar a agenda.'},{status:[400,401,403,409].includes(status)?status:500,headers}); }
export async function GET(request:Request) {
  try {
    const {access,client,allowed}=await context(request),p=new URL(request.url).searchParams;
    const permissions=Object.fromEntries(['/agenda','/orders','/quotes','/production','/shipment','/financial','/crm','/field-services'].map(path=>[path,allowed(path)]));
    if(p.get('mode')==='options') {
      const search=(p.get('q')||'').trim().slice(0,80).replace(/[%_]/g,'');
      const [profiles,customers]=await Promise.all([
        client.from('profiles').select('id,name').eq('company_id',access.companyId).eq('active',true).not('auth_user_id','is',null).order('name').limit(500),
        allowed('/crm')?client.from('customers').select('id,name').eq('company_id',access.companyId).ilike('name',`%${search}%`).order('name').limit(40):{data:[],error:null}
      ]);
      if(profiles.error||customers.error) throw new Error('Falha ao consultar opções.');
      return NextResponse.json({profiles:profiles.data,customers:customers.data,permissions},{headers});
    }
    const reminderMode=p.get('mode')==='reminders',today=agendaDate(new Date());
    const from=reminderMode?shiftDate(today,-1):p.get('from')||today,to=reminderMode?shiftDate(today,7):p.get('to')||today;
    try {validateWindow(from,to);} catch(error) {throw Object.assign(error as Error,{status:400});}
    let events=await loadAgenda(client,access.companyId,reminderMode?()=>false:allowed,from,to,p.get('finance')==='1');
    if(reminderMode) {
      events=dueReminders(events).filter(e=>e.responsible_profile_id===access.profileId);
      const {data:acks,error}=await client.from('agenda_reminder_acks').select('event_id,occurrence_at').eq('user_id',access.userId).gte('occurrence_at',`${from}T00:00:00-03:00`).lte('occurrence_at',`${to}T23:59:59-03:00`);
      if(error) throw error;
      events=events.filter(e=>!acks?.some(a=>a.event_id===e.source_id && Date.parse(a.occurrence_at)===Date.parse(e.start_at)));
      return NextResponse.json({events:events.slice(0,20),total:events.length},{headers});
    }
    for(const [param,key] of [['source','source_type'],['type','event_type'],['responsible','responsible_profile_id'],['customer','customer_id'],['status','status']] as const) {
      const value=p.get(param); if(value) events=events.filter(e=>e[key]===value||(param==='responsible'&&e.participant_profile_ids?.includes(value)));
    }
    if(p.get('late')==='1') events=events.filter(e=>e.status==='agendado'&&e.date<today);
    const page=Number(p.get('page')||0); if(!Number.isInteger(page)||page<0||page>10000) throw Object.assign(new Error('Página inválida.'),{status:400});
    const days:Record<string,number>={}; for(const e of events) days[e.date]=(days[e.date]||0)+1;
    return NextResponse.json({events:events.slice(page*100,page*100+100),total:events.length,page,days,summary:agendaSummary(events,new Date(),from,to),permissions,from,to,timezone:'America/Bahia'},{headers});
  } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
  try {
    const {access,client}=await context(request);
    const body=await request.json().catch(()=>{throw Object.assign(new Error('Dados inválidos.'),{status:400});});
    if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Dados inválidos.'),{status:400});
    if(body.action==='ack') {
      const today=agendaDate(new Date()),events=dueReminders(await loadAgenda(client,access.companyId,()=>false,shiftDate(today,-1),shiftDate(today,7),false));
      const event=events.find((e:AgendaEvent)=>e.source_id===body.id&&e.start_at===body.start_at&&e.responsible_profile_id===access.profileId);
      if(!event) throw Object.assign(new Error('Lembrete indisponível.'),{status:400});
      const {error}=await client.from('agenda_reminder_acks').insert({event_id:event.source_id,occurrence_at:event.start_at,user_id:access.userId});
      if(error&&error.code!=='23505') throw error;
      return NextResponse.json({ok:true},{headers});
    }
    let patch; try {patch=validateManual(body);} catch(error) {throw Object.assign(error as Error,{status:400});}
    if(body.id && !body.updated_at) throw Object.assign(new Error('Atualize antes de editar.'),{status:409});
    const query=body.id?client.from('agenda_events').update(patch).eq('id',body.id).eq('company_id',access.companyId).eq('updated_at',body.updated_at):client.from('agenda_events').insert({...patch,company_id:access.companyId,created_by:access.userId});
    const {data,error}=await query.select('id,updated_at').maybeSingle();
    if(error) {if(['23514','23503','22P02'].includes(error.code)) throw Object.assign(new Error('Dados, cliente ou responsável inválidos.'),{status:400});throw error;}
    if(!data) throw Object.assign(new Error('Conflito'),{status:409});
    return NextResponse.json(data,{headers});
  } catch(error) {return failure(error);}
}
