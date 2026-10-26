'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {useAuth} from '@/context/auth-context';
import {useDatabase} from '@/context/database-context';
import {canAccessModule} from '@/lib/module-permissions';
import {qualityRequest} from '@/lib/quality/client';
import {NC_STATUS,SEVERITIES,ncNumber,type QualityLink,type QualityExecutionLink} from '@/lib/quality/model';
type Kind='order'|'production'|'purchase'|'receipt'|'outsourcing'|'field_service'|'supplier'|'product';
type Linked={links:QualityLink[];executions:QualityExecutionLink[]};
function useQualityLinks(kind:Kind,ids:string[],revision='') {
 const key=JSON.stringify([...new Set(ids.filter(Boolean))].sort()),[data,setData]=useState<Linked>({links:[],executions:[]}),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController(),references=JSON.parse(key) as string[];setData({links:[],executions:[]});setError('');setLoading(true);
  const batches:string[][]=[];for(let offset=0;offset<references.length;offset+=200)batches.push(references.slice(offset,offset+200));
  Promise.all(batches.map(batch=>qualityRequest<Linked>(`/links?${new URLSearchParams({kind,ids:JSON.stringify(batch)})}`,{signal:controller.signal}))).then(results=>{if(!controller.signal.aborted)setData({links:results.flatMap(r=>r.links),executions:results.flatMap(r=>r.executions||[])});}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[kind,key,revision]);
 return {data,error,loading};
}
export function QualityReferences({kind,id,revision=''}:{kind:Kind;id:string;revision?:string}) {
 const {activeProfile}=useAuth(),{rolePermissions}=useDatabase();
 return canAccessModule(activeProfile.role,'/quality',rolePermissions)?<References key={`${activeProfile.company_id}:${activeProfile.id}:${activeProfile.role}:${kind}:${id}`} kind={kind} id={id} revision={revision} canOpen={canAccessModule(activeProfile.role,'/quality/open',rolePermissions)}/>:null;
}
function References({kind,id,revision,canOpen}:{kind:Kind;id:string;revision:string;canOpen:boolean}) {
 const {data,error,loading}=useQualityLinks(kind,[id],revision),sourceKinds=['order','production','purchase','receipt','outsourcing','field_service'];
 return <section className="my-4 min-w-0 space-y-3 rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Qualidade e não conformidades</h3>{canOpen&&sourceKinds.includes(kind)&&<Link className="pf-button-secondary text-xs" href={`/quality?${new URLSearchParams({new:'1',source:kind,reference:id})}`}>Registrar NC</Link>}</div>{loading?<p className="text-xs text-muted-foreground">Conferindo vínculos de Qualidade…</p>:error?<p role="alert" className="text-xs text-destructive">{error}</p>:data.links.length?<div className="space-y-2">{data.links.slice(0,10).map(n=><p key={n.id} className="break-words text-sm"><Link className="text-primary underline" href={`/quality?id=${n.id}`}>{ncNumber(n.number)} · {NC_STATUS[n.status]} · {SEVERITIES[n.severity]}{n.blocking?' · bloqueia conclusão':''}</Link><span className="mt-1 block text-xs text-muted-foreground">{n.description}</span></p>)}{data.links.length>10&&<p className="text-xs">{data.links.length} NCs relacionadas. Consulte a listagem por período.</p>}</div>:<p className="text-xs text-muted-foreground">Sem NCs relacionadas a este registro.</p>}<Link className="inline-flex min-h-9 items-center text-xs text-primary underline" href={`/quality${kind==='supplier'?`?supplier=${encodeURIComponent(id)}`:kind==='product'?`?product=${encodeURIComponent(id)}`:''}`}>Consultar Qualidade por período</Link></section>;
}
type ProductionLinks=Linked&{canOpen:boolean};
const ProductionQualityContext=createContext<ProductionLinks>({links:[],executions:[],canOpen:false});
export function ProductionQualityProvider({items,children}:{items:{id:string;updated_at?:string}[];children:ReactNode}) {
 const {activeProfile}=useAuth(),{rolePermissions}=useDatabase();
 if(!canAccessModule(activeProfile.role,'/quality',rolePermissions))return <>{children}</>;
 return <ProductionProvider key={`${activeProfile.company_id}:${activeProfile.id}:${activeProfile.role}`} items={items} canOpen={canAccessModule(activeProfile.role,'/quality/open',rolePermissions)}>{children}</ProductionProvider>;
}
function ProductionProvider({items,canOpen,children}:{items:{id:string;updated_at?:string}[];canOpen:boolean;children:ReactNode}) {
 const {data,error}=useQualityLinks('production',items.map(i=>i.id),items.map(i=>`${i.id}:${i.updated_at||''}`).join('|'));
 return <ProductionQualityContext.Provider value={{...data,canOpen}}>{error&&<p role="alert" className="mb-3 rounded-xl border border-destructive/40 p-3 text-sm">Vínculos de Qualidade indisponíveis: {error}</p>}{children}</ProductionQualityContext.Provider>;
}
export function ProductionQualityBadge({id}:{id:string}) {
 const {links,executions,canOpen}=useContext(ProductionQualityContext),related=links.filter(n=>n.reference_id===id),pending=related.filter(n=>!['closed','cancelled'].includes(n.status)),execution=executions.find(q=>q.reference_id===id);
 return <div className="mt-2 space-y-1" onPointerDown={event=>event.stopPropagation()}>
  {execution&&execution.execution_number>1&&<p className="text-xs font-semibold text-primary">RETRABALHO · execução {execution.execution_number}{execution.action_state==='cancelled'?' · ação cancelada':''}</p>}
  {pending.map(n=><Link key={n.id} href={`/quality?id=${n.id}`} className={`block min-h-9 py-1 text-xs underline ${n.blocking?'font-semibold text-destructive':'text-primary'}`}>{ncNumber(n.number)} · {NC_STATUS[n.status]}{n.blocking?' · conclusão bloqueada':''}</Link>)}
  {!pending.length&&related.length>0&&<Link className="block min-h-9 py-1 text-xs text-primary underline" href={`/quality?id=${execution?.nc_id||related[0].id}`}>Histórico de Qualidade · {related.length} NC(s)</Link>}
  {canOpen&&<Link className="inline-flex min-h-9 items-center text-xs text-primary underline" href={`/quality?new=1&source=production&reference=${encodeURIComponent(id)}`}>Registrar NC desta etapa</Link>}
 </div>;
}
export function QualityReportLink() {
 const {activeProfile}=useAuth(),{rolePermissions}=useDatabase();
 return canAccessModule(activeProfile.role,'/quality',rolePermissions)?<Link className="pf-button-secondary" href="/quality?view=reports">Relatórios de Qualidade e retrabalho</Link>:null;
}
