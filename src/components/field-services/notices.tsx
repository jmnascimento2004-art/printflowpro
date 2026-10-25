'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/auth-context';
import {useDatabase} from '@/context/database-context';
import {canAccessModule} from '@/lib/module-permissions';
import {fieldRequest} from '@/lib/field-services/client';
import {serviceNumber} from '@/lib/field-services/model';
type Notice={id:string;service_id:string;action:string;number:number;title:string;can_open:boolean;created_at:string};
const labels:Record<string,string>={created:'Novo serviço',updated:'Planejamento alterado',assigned:'Responsável / equipe atualizados',scheduled:'Agendamento confirmado',rescheduled:'Agendamento alterado',traveling:'Equipe em deslocamento',on_site:'Equipe no local',started:'Execução iniciada',blocked:'Impedimento informado',completed:'Execução concluída',reopened:'Nova execução aberta',cancelled:'Serviço cancelado'};
export function FieldNotices(){const {activeProfile}=useAuth(),{rolePermissions}=useDatabase();return canAccessModule(activeProfile.role,'/field-services',rolePermissions)?<NoticesContent key={`${activeProfile.company_id}:${activeProfile.id}:${activeProfile.role}`}/>:null;}
function NoticesContent(){const [rows,setRows]=useState<Notice[]>([]),[error,setError]=useState(false);useEffect(()=>{const controller=new AbortController();const read=()=>void fieldRequest<{notices:Notice[]}>('?notices=1',{signal:controller.signal}).then(d=>{setRows(d.notices);setError(false);}).catch(()=>{if(!controller.signal.aborted)setError(true);});read();const interval=setInterval(read,30000);return()=>{controller.abort();clearInterval(interval);};},[]);return <section className="space-y-2 border-t p-3"><h3 className="text-xs font-bold">Serviços externos · últimos 7 dias</h3>{rows.filter(n=>labels[n.action]).slice(0,8).map(n=><Link aria-disabled={!n.can_open} onClick={e=>{if(!n.can_open)e.preventDefault();}} key={n.id} href={`/field-services?id=${n.service_id}`} className="block rounded-lg border p-2 text-xs"><strong>{labels[n.action]} · {serviceNumber(n.number)}</strong><p className="mt-1 break-words">{n.title}</p></Link>)}{error?<p className="text-xs text-muted-foreground">Não foi possível atualizar os avisos de campo.</p>:!rows.some(n=>labels[n.action])&&<p className="text-xs text-muted-foreground">Sem atualizações para sua equipe.</p>}</section>;}
