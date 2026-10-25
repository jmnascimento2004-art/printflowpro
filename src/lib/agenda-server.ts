import type { SupabaseClient } from '@supabase/supabase-js';
import { agendaDate, expandManual, localInstant, markConflicts, shiftDate, type AgendaEvent, type ManualEvent } from './agenda';
import {SERVICE_TYPES,serviceNumber,type Service} from './field-services/model';
type Row = Record<string, string | null>;
type Allowed = (path:string)=>boolean;
// All sources are bounded by a period, paged on the server, and projected without commercial amounts.
// Abort rather than silently return incomplete indicators for unusually dense periods.
async function readRows(client:SupabaseClient, table:string, select:string, company:string, column:string, from:string, to:string, recurring=false) {
  const result:Row[]=[];
  for(let offset=0;offset<10000;offset+=500) {
    let query=client.from(table).select(select).eq('company_id',company).order('id').range(offset,offset+499);
    if(recurring) query=query.lt('start_at',localInstant(shiftDate(to,1))).or(`end_at.gte.${localInstant(from)},start_at.gte.${localInstant(from)},recurrence_until.gte.${shiftDate(from,-7)}`);
    else query=query.gte(column, column==='due_date'||column==='valid_until'?from:localInstant(from)).lt(column,column==='due_date'||column==='valid_until'?shiftDate(to,1):localInstant(shiftDate(to,1)));
    const {data,error}=await query; if(error) throw new Error('Não foi possível consultar os eventos.');
    result.push(...(data||[]) as unknown as Row[]); if((data||[]).length<500) return result;
  }
  throw Object.assign(new Error('Período muito movimentado. Selecione uma janela menor.'),{status:400});
}
export async function loadAgenda(client:SupabaseClient, company:string, allowed:Allowed, from:string,to:string,finance:boolean) {
  const [manual,orders,quotes,production,shipped,delivered,financial,fieldServices]=await Promise.all([
    readRows(client,'agenda_events','*',company,'start_at',from,to,true),
    allowed('/orders')?readRows(client,'orders','id,number,deadline,status,customer_id,delivery_type',company,'deadline',from,to):[],
    allowed('/quotes')?readRows(client,'quotes','id,number,valid_until,status,customer_id',company,'valid_until',from,to):[],
    allowed('/production')?readRows(client,'production_queue','id,order_number,product_name,deadline,status,responsible_name,orders(status)',company,'deadline',from,to):[],
    allowed('/shipment')?readRows(client,'shipments','id,order_number,shipped_at,status',company,'shipped_at',from,to):[],
    allowed('/shipment')?readRows(client,'shipments','id,order_number,delivered_at,status',company,'delivered_at',from,to):[],
    finance&&allowed('/financial')?readRows(client,'financial_transactions','id,type,description,due_date,status,orders(status),cancelled_at,payable_id,reversal_of,economic_kind',company,'due_date',from,to):[],
    allowed('/field-services')?readRows(client,'field_services','id,number,title,service_type,status,scheduled_start,scheduled_end,customer_id,assigned_profile_id,team',company,'scheduled_start',shiftDate(from,-7),to):[]
  ]);
  const events=expandManual(manual as unknown as ManualEvent[],from,to);
  function add(rows:Row[], source:AgendaEvent['source_type'], path:string,dateKey:string,title:(r:Row)=>string,done:string[],allDay=false,eventType='prazo') {
    for(const r of rows) {if(!r[dateKey]||r.status==='cancelado'||r.status==='reprovado') continue;
      const linkedOrder=(r as unknown as {orders?:{status:string}}).orders;
      if(linkedOrder?.status==='cancelado' && (source==='production'||(source==='financial'&&r.status==='pendente'))) continue;
      const start=allDay?localInstant(r[dateKey]!):r[dateKey]!;
      events.push({id:`${source}:${r.id}:${dateKey}`,source_type:source,source_id:r.id!,url:`${path}?${source==='orders'?'orderId':'agendaId'}=${encodeURIComponent(r.id!)}`,
        title:title(r),start_at:start,end_at:null,date:agendaDate(start),all_day:allDay,status:done.includes(r.status||'')?'concluido':'agendado',source_status:r.status||'',event_type:eventType,customer_id:r.customer_id||null,responsible_profile_id:null,responsible_name:r.responsible_name||undefined});
    }
  }
  add(orders,'orders','/orders','deadline',r=>`${r.number} · ${r.delivery_type==='retirada'?'Retirada prevista':'Prazo do pedido'}`,['entregue','finalizado']);
  add(quotes,'quotes','/quotes','valid_until',r=>`ORÇ-${r.number} · Validade`,['aprovado'],true);
  add(production,'production','/production','deadline',r=>`${r.order_number} · ${r.product_name}`,['concluido','expedicao','entregue','finalizado']);
  add(shipped,'shipping','/shipment','shipped_at',r=>`${r.order_number} · Envio realizado`,['enviado','em_rota','entregue'],false,'envio');
  add(delivered,'shipping','/shipment','delivered_at',r=>`${r.order_number} · Entrega realizada`,['entregue'],false,'entrega');
  add(financial.filter(r=>!r.cancelled_at&&!r.payable_id&&!r.reversal_of&&(!r.economic_kind||r.economic_kind==='operating')),'financial','/financial','due_date',r=>`${r.type==='despesa'?'A pagar':'A receber'} · ${r.description||'Vencimento'}`,['pago'],true);
  events.push(...fieldAgendaEvents(fieldServices as unknown as Service[],from));
  return markConflicts(events).sort((a,b)=>a.start_at.localeCompare(b.start_at)||a.id.localeCompare(b.id));
}
export function fieldAgendaEvents(rows:Service[],from:string):AgendaEvent[]{return rows.filter(s=>s.status!=='cancelled'&&s.scheduled_start&&s.scheduled_end&&Date.parse(s.scheduled_end)>Date.parse(localInstant(from))).map(s=>({id:`field_services:${s.id}`,source_type:'field_services',source_id:s.id,url:`/field-services?id=${encodeURIComponent(s.id)}`,title:`${serviceNumber(s.number)} · ${SERVICE_TYPES[s.service_type]} · ${s.title}`,start_at:s.scheduled_start!,end_at:s.scheduled_end,date:agendaDate(s.scheduled_start!),all_day:false,status:s.status==='completed'?'concluido':'agendado',source_status:s.status,event_type:s.service_type==='installation'?'instalacao':s.service_type==='technical_delivery'?'entrega':'visita',customer_id:s.customer_id,responsible_profile_id:s.assigned_profile_id,participant_profile_ids:s.team}));}
