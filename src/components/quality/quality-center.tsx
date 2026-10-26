'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {useAuth} from '@/context/auth-context';
import {agendaDate,shiftDate} from '@/lib/agenda';
import {CATEGORIES,NC_STATUS,ORIGINS,SEVERITIES,SOURCES,activeCase,blocksProduction,ncNumber,qualityMetrics,type Nonconformity} from '@/lib/quality/model';
import {purchaseMoney} from '@/lib/purchasing/model';
import {Empty,Field,purchaseField as field} from '@/components/purchasing/shared';
import {useQuality} from './use-quality';
import {NonconformityForm} from './nc-form';
import {QualityDetail} from './quality-detail';
import {QualityReports} from './reports';

export function QualityCenter() {
 const {activeProfile}=useAuth();
 return <QualityContent key={`${activeProfile.company_id}:${activeProfile.id}:${activeProfile.role}`}/>;
}
function QualityContent() {
 const {activeProfile}=useAuth(),params=useSearchParams(),today=agendaDate(new Date());
 const [from,setFrom]=useState(shiftDate(today,-30)),[to,setTo]=useState(today),[selected,setSelected]=useState(params.get('id')||''),[section,setSection]=useState(params.get('view')==='reports'?'reports':'cases');
 const [form,setForm]=useState<{nc?:Nonconformity}|null>(params.get('new')==='1'?{}:null),[search,setSearch]=useState(''),[status,setStatus]=useState(''),[severity,setSeverity]=useState(''),[category,setCategory]=useState(''),[origin,setOrigin]=useState(''),[responsible,setResponsible]=useState(''),[supplier,setSupplier]=useState(params.get('supplier')||''),[sourceType,setSourceType]=useState(''),[order,setOrder]=useState(''),[product,setProduct]=useState(params.get('product')||''),[blocked,setBlocked]=useState(false),[personal,setPersonal]=useState(false),[page,setPage]=useState(0);
 const locationId=params.get('id')||'',locationNew=params.get('new')==='1';
 useEffect(()=>{setSelected(locationId);},[locationId]);
 useEffect(()=>{if(locationNew)setForm({});},[locationNew]);
 const reports=section==='reports'&&!selected;
 const query=`?${new URLSearchParams({from,to,...(selected?{id:selected}:{}),...(reports?{reports:'1'}:{})})}`,state=useQuality(query);
 const source=state.source?.company_id===activeProfile.company_id&&state.source.from===from&&state.source.to===to&&state.source.report_mode===reports?state.source:null;
 const nc=source?.cases.find(n=>n.id===selected),metrics=source?qualityMetrics(source):null;
 const rows=(source?.cases||[]).filter(n=>(!status||n.status===status)&&(!severity||n.severity===severity)&&(!category||n.category===category)&&(!origin||n.problem_origin===origin)&&(!responsible||n.assigned_profile_id===responsible||n.team.includes(responsible))&&(!supplier||[n.supplier_id,n.responsible_supplier_id,n.action_supplier_id].includes(supplier))&&(!sourceType||n.source_type===sourceType)&&(!order||n.order_id===order)&&(!product||n.product_id===product)&&(!blocked||blocksProduction(n))&&(!personal||n.assigned_profile_id===source?.profile_id||n.team.includes(source!.profile_id))&&`${ncNumber(n.number)} ${n.description} ${n.source_snapshot.label} ${n.source_snapshot.customer_name||''} ${n.source_snapshot.supplier_name||''} ${n.root_cause}`.toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
 function select(id:string){setSelected(id);window.history.replaceState(null,'',`/quality?id=${encodeURIComponent(id)}`);}
 function back(){setSelected('');window.history.replaceState(null,'',section==='reports'?'/quality?view=reports':'/quality');}
 const rawKind=params.get('source')||'order',kind=(Object.keys(SOURCES).includes(rawKind)?rawKind:'order') as keyof typeof SOURCES;
 const initial={kind,id:params.get('reference')||'',item:params.get('item')||''};
 const orders=[...new Map((source?.cases||[]).filter(n=>n.order_id).map(n=>[n.order_id!,n.source_snapshot.order_number||'Pedido vinculado'])).entries()];
 const products=[...new Map((source?.cases||[]).filter(n=>n.product_id).map(n=>[n.product_id!,n.source_snapshot.item_name||'Produto vinculado'])).entries()];
 return <div className="min-w-0 space-y-5 pb-8">
  <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Qualidade</h1><p className="mt-1 text-sm text-muted-foreground">Não conformidades, ações corretivas, retrabalho e reinspeção com histórico.</p></div><div className="flex flex-wrap gap-2"><button className="pf-button-secondary" disabled={state.loading||state.busy} onClick={()=>void state.refresh().catch(e=>state.setError(e.message))}>Atualizar Qualidade</button>{!selected&&source?.permissions.open&&<button className="pf-button-primary" disabled={state.busy||!source.permissions.writable} onClick={()=>setForm({})}>Registrar NC</button>}</div></header>
  {!selected&&<div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="NCs abertas a partir de"><input type="date" required className={field} value={from} onChange={e=>{setFrom(e.target.value);setPage(0);}}/></Field><Field label="NCs abertas até"><input type="date" required className={field} value={to} onChange={e=>{setTo(e.target.value);setPage(0);}}/></Field><p className="self-end pb-2 text-xs text-muted-foreground">Período de abertura · America/Bahia · até 366 dias. Indicadores consideram o período completo.</p></div>}
  {state.error&&<p role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">{state.error}</p>}
  {state.notice&&<p role="status" className="text-sm">{state.notice}</p>}
  {section==='reports'&&!selected&&<button className="pf-button-secondary" onClick={()=>{setSection('cases');window.history.replaceState(null,'','/quality');}}>Voltar às NCs</button>}
  {source&&!source.permissions.writable&&<p className="rounded-xl border p-3 text-sm">Consulta disponível. O plano está em modo de leitura. <Link className="text-primary underline" href="/settings">Consultar assinatura em Configurações</Link></p>}
  {state.loading?<p role="status">Carregando Qualidade autorizada…</p>:!source?null:nc?<QualityDetail source={source} nc={nc} command={state.command} mutate={state.mutate} busy={state.busy} refresh={state.refresh} onBack={back} onEdit={()=>setForm({nc})}/>:selected?<p role="alert">NC indisponível nesta sessão. <button className="text-primary underline" onClick={back}>Voltar à lista</button></p>:<>
   {metrics&&<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
    ['Abertas',String(metrics.open)],['Em análise',String(metrics.analysis)],['Em retrabalho',String(metrics.in_rework)],['Aguardando reinspeção',String(metrics.awaiting_reinspection)],['Encerradas',String(metrics.closed)],['Críticas pendentes',String(metrics.critical)],['Taxa de retrabalho',metrics.rework_rate===null?'Sem base':`${metrics.rework_rate.toFixed(1)}%`],...(source.permissions.finance?[['Custo NCs com retrabalho',metrics.rework_actual===null?'Não informado':`${purchaseMoney(metrics.rework_actual)}${metrics.rework_partial?' · parcial':''}`]]:[])
   ].map(([label,value])=><div key={label} className="min-w-0 rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><strong className="mt-2 block break-words text-xl">{value}</strong></div>)}</div>}
   <nav aria-label="Áreas de Qualidade" className="flex flex-wrap gap-2"><button aria-pressed={section==='cases'} className={section==='cases'?'pf-button-primary':'pf-button-secondary'} onClick={()=>setSection('cases')}>NCs e retrabalhos</button>{source.permissions.reports&&<button aria-pressed={section==='reports'} className={section==='reports'?'pf-button-primary':'pf-button-secondary'} onClick={()=>setSection('reports')}>Relatórios de Qualidade</button>}</nav>
   {section==='reports'?<QualityReports source={source}/>:<>
    <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
     <Field label="Buscar NC"><input className={field} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Número, problema, cliente, referência ou causa"/></Field>
     <Field label="Estado"><select className={field} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="">Todos</option>{Object.entries(NC_STATUS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
     <Field label="Gravidade"><select className={field} value={severity} onChange={e=>{setSeverity(e.target.value);setPage(0);}}><option value="">Todas</option>{Object.entries(SEVERITIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
     <Field label="Categoria"><select className={field} value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}}><option value="">Todas</option>{Object.entries(CATEGORIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
     <Field label="Responsabilidade"><select className={field} value={origin} onChange={e=>{setOrigin(e.target.value);setPage(0);}}><option value="">Todas</option>{Object.entries(ORIGINS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
     <Field label="Responsável interno"><select className={field} value={responsible} onChange={e=>{setResponsible(e.target.value);setPage(0);}}><option value="">Todos</option>{source.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
     <Field label="Fornecedor vinculado"><select className={field} value={supplier} onChange={e=>{setSupplier(e.target.value);setPage(0);}}><option value="">Todos</option>{source.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
     <Field label="Tipo de origem"><select className={field} value={sourceType} onChange={e=>{setSourceType(e.target.value);setPage(0);}}><option value="">Todas</option>{Object.entries(SOURCES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
     <Field label="Pedido vinculado"><select className={field} value={order} onChange={e=>{setOrder(e.target.value);setPage(0);}}><option value="">Todos</option>{orders.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>
     <Field label="Produto vinculado"><select className={field} value={product} onChange={e=>{setProduct(e.target.value);setPage(0);}}><option value="">Todos</option>{products.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></Field>
    </div>
    <div className="flex flex-wrap gap-5"><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={blocked} onChange={e=>{setBlocked(e.target.checked);setPage(0);}}/>Somente bloqueantes</label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={personal} onChange={e=>{setPersonal(e.target.checked);setPage(0);}}/>Minhas NCs e da minha equipe</label></div>
    <div className="space-y-3">{rows.slice(page*50,page*50+50).map(n=><button key={n.id} className="grid w-full min-w-0 gap-3 rounded-2xl border bg-card p-4 text-left hover:border-primary sm:grid-cols-2 xl:grid-cols-4" onClick={()=>select(n.id)}><div><strong>{ncNumber(n.number)}</strong><p className="mt-1 text-xs text-muted-foreground">{NC_STATUS[n.status]} · {SEVERITIES[n.severity]}</p>{blocksProduction(n)&&<p className="mt-2 text-xs font-semibold text-destructive">Bloqueia conclusão da Produção</p>}</div><div className="min-w-0"><p className="break-words font-medium">{n.description}</p><p className="mt-1 break-words text-xs text-muted-foreground">{CATEGORIES[n.category]}</p></div><div className="min-w-0 text-sm"><p className="break-words">{n.source_snapshot.label}</p><p className="mt-1 break-words text-xs text-muted-foreground">{n.source_snapshot.customer_name||n.source_snapshot.supplier_name||SOURCES[n.source_type]}</p></div><div className="text-sm"><p>{agendaDate(n.opened_at).split('-').reverse().join('/')}</p><p className="mt-1 break-words text-xs text-muted-foreground">{source.profiles.find(p=>p.id===n.assigned_profile_id)?.name||'Responsável a definir'}</p>{n.action_due_date&&activeCase(n)&&<p className="mt-1 text-xs">Prazo: {n.action_due_date.split('-').reverse().join('/')}{n.action_due_date<today?' · Atrasado':''}</p>}</div></button>)}{!rows.length&&<Empty>Nenhuma NC para este período e filtros.</Empty>}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{rows.length} registros · Página {page+1} · {metrics?.cancelled||0} canceladas no período</span><div className="flex gap-2"><button className="pf-button-secondary" disabled={!page} onClick={()=>setPage(v=>v-1)}>Anterior</button><button className="pf-button-secondary" disabled={(page+1)*50>=rows.length} onClick={()=>setPage(v=>v+1)}>Próxima</button></div></div>
   </>}
  </>}
  {source&&form&&source.permissions.writable&&(form.nc?source.permissions.manage:source.permissions.open)&&<NonconformityForm key={`${form.nc?.id||'new'}:${initial.kind}:${initial.id}:${initial.item}`} source={source} nc={form.nc} initial={initial} command={state.command} busy={state.busy} onClose={()=>{setForm(null);if(locationNew)window.history.replaceState(null,'',selected?`/quality?id=${selected}`:'/quality');}} onSaved={id=>{setForm(null);select(id);}}/>}
 </div>;
}
