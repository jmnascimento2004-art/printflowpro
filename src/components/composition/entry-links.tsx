'use client';
import Link from 'next/link';
import {useAuth} from '@/context/auth-context';
import {useDatabase} from '@/context/database-context';
import {canAccessModule} from '@/lib/module-permissions';
import type {Product} from '@/lib/dummy-data';
import {useComposition} from './use-composition';
import {activeConsumption,outsourcingNumber} from '@/lib/composition/model';
import {commercialDate} from '@/lib/commercial-intelligence';
export function ProductCompositionEntry({product}:{product?:Product}){return <section className="my-4 space-y-3 rounded-xl border p-4"><h3 className="font-bold">Composição e componentes</h3><p className="text-sm text-muted-foreground">Produto composto ou kit virtual usa insumos e serviços cadastrados. Salve os dados gerais antes de abrir a composição.</p>{product?<Link className="pf-button-secondary inline-flex" href={`/products/composition?productId=${encodeURIComponent(product.id)}`}>Gerenciar composição</Link>:<p className="text-sm">A composição fica disponível após cadastrar o produto.</p>}</section>;}
export function CompositionReportLink(){const {activeProfile}=useAuth(),{rolePermissions}=useDatabase();return canAccessModule(activeProfile.role,'/outsourcing',rolePermissions)?<Link className="pf-button-secondary" href="/outsourcing?view=reports">Composição e terceirização</Link>:null;}
export function ProductionCompositionLinks(){const {activeProfile}=useAuth();return <ProductionCompositionSummary key={`${activeProfile.company_id}:${activeProfile.id}:${activeProfile.role}`}/>;}
function ProductionCompositionSummary(){
 const {activeProfile}=useAuth(),{rolePermissions}=useDatabase(),state=useComposition(),today=commercialDate(new Date()),source=state.source;
 const activeItems=source?.items.filter(i=>i.order_status!=='cancelado'&&source.production.some(q=>q.order_item_id===i.id&&!['concluido','expedicao','entregue','finalizado'].includes(q.status)))||[];
 const missing=activeItems.filter(i=>!activeConsumption(source!,i.id)&&i.requirements.some(r=>r.stock_controlled&&!r.is_outsourced&&r.shortage>0));
 const delayed=source?.dependencies.filter(d=>d.due_date<today&&!['received','cancelled'].includes(d.status)&&activeItems.some(i=>i.id===d.order_item_id))||[];
 return <section className="space-y-3"><div className="flex flex-wrap gap-2"><Link className="pf-button-secondary" href="/production/components">Componentes e necessidades</Link>{canAccessModule(activeProfile.role,'/outsourcing',rolePermissions)&&<Link className="pf-button-secondary" href="/outsourcing">Terceirizações</Link>}<button className="pf-button-secondary" disabled={state.loading} onClick={()=>void state.refresh().catch(e=>state.setError((e as Error).message))}>Atualizar necessidades</button></div>
 {state.error&&<p role="alert" className="text-sm text-destructive">{state.error}</p>}{(missing.length>0||delayed.length>0)&&<div role="status" className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/5 p-4 text-sm"><strong>{missing.length} {missing.length===1?'item':'itens'} com falta de material · {delayed.length} {delayed.length===1?'terceirização atrasada':'terceirizações atrasadas'}</strong>{missing.slice(0,10).map(i=><p key={i.id}><Link className="text-primary underline" href={`/production/components?item=${encodeURIComponent(i.id)}`}>{i.order_number} · {i.product_name} — conferir necessário, disponível e faltante</Link></p>)}{delayed.slice(0,10).map(d=><p key={d.id}><Link className="text-primary underline" href={`/production/components?item=${encodeURIComponent(d.order_item_id)}`}>{outsourcingNumber(d.number)} — dependência atrasada</Link></p>)}</div>}</section>;
}
