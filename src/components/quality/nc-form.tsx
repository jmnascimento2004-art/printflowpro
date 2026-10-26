'use client';
import {useCallback,useRef,useState,type FormEvent} from 'react';
import {Field,FormFooter,PurchaseModal,purchaseField as field} from '@/components/purchasing/shared';
import {CATEGORIES,ORIGINS,SEVERITIES,ncNumber,type Nonconformity,type OriginContext,type QualitySource,type SOURCES} from '@/lib/quality/model';
import type {QualityCommand} from './use-quality';
import {OriginPicker} from './origin-picker';

export function NonconformityForm({source,nc,initial,command,busy,onClose,onSaved}:{source:QualitySource;nc?:Nonconformity;initial:{kind:keyof typeof SOURCES;id:string;item:string};command:QualityCommand;busy:boolean;onClose:()=>void;onSaved:(id:string)=>void}) {
 const [version]=useState(nc?.updated_at),[origin,setOrigin]=useState<OriginContext|null>(null),[quantity,setQuantity]=useState(String(nc?.affected_quantity||''));
 const [description,setDescription]=useState(nc?.description||''),[category,setCategory]=useState<Nonconformity['category']>(nc?.category||'production_error'),[severity,setSeverity]=useState<Nonconformity['severity']>(nc?.severity||'medium'),[responsibility,setResponsibility]=useState<Nonconformity['problem_origin']>(nc?.problem_origin||'undefined');
 const [assigned,setAssigned]=useState(nc?.assigned_profile_id||source.profile_id),[supplier,setSupplier]=useState(nc?.responsible_supplier_id||''),[team,setTeam]=useState(nc?.team||[]),[blocking,setBlocking]=useState(nc?.block_completion||false),[costApplicable,setCostApplicable]=useState(nc?.cost_applicable??true),[impact,setImpact]=useState(String(nc?.deadline_impact_days||0)),[error,setError]=useState('');
 const originRef=useRef<OriginContext|null>(null);
 const selectOrigin=useCallback((value:OriginContext|null)=>{originRef.current=value;setOrigin(value);setQuantity(value?String(value.quantity):'');},[]);
 const executing=!!nc&&['rework','reinspection'].includes(nc.status);
 async function submit(event:FormEvent) {
  event.preventDefault();setError('');
  try {
   const confirmedOrigin=originRef.current;
   if(!nc&&!confirmedOrigin)throw new Error('Selecione e confira a origem antes de salvar.');
   const result=await command(nc?'update':'create',{
    ...(nc?{id:nc.id,updated_at:version}:{source_type:initial.kind,source_id:initial.id}),
    ...(!nc&&confirmedOrigin?{source_type:originKind(confirmedOrigin),source_id:originId(confirmedOrigin),source_item_id:confirmedOrigin.order_item_id||confirmedOrigin.purchase_item_id,source_updated_at:confirmedOrigin.version,affected_quantity:Number(quantity)}:{}),
    description,category,severity,problem_origin:responsibility,assigned_profile_id:assigned||null,responsible_supplier_id:supplier||null,team,block_completion:blocking,cost_applicable:costApplicable,deadline_impact_days:Number(impact)
   });
   onSaved(result.id);
  } catch(e) {setError((e as Error).message);}
 }
 return <PurchaseModal title={nc?`Editar ${ncNumber(nc.number)}`:'Registrar não conformidade'} busy={busy} onClose={onClose} wide>
  <form onSubmit={submit} className="space-y-5"><fieldset disabled={busy} className="min-w-0 space-y-5">
   {nc?<p className="rounded-xl bg-muted/50 p-3 text-sm">Origem preservada: {nc.source_snapshot.label} · Quantidade afetada: {nc.affected_quantity}</p>:<OriginPicker initial={initial} onChange={selectOrigin} busy={busy}/>}
   <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Categoria *"><select className={field} value={category} onChange={e=>setCategory(e.target.value as Nonconformity['category'])}>{Object.entries(CATEGORIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Gravidade *"><select className={field} value={severity} disabled={executing} onChange={e=>setSeverity(e.target.value as Nonconformity['severity'])}>{Object.entries(SEVERITIES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Origem da responsabilidade"><select className={field} value={responsibility} onChange={e=>setResponsibility(e.target.value as Nonconformity['problem_origin'])}>{Object.entries(ORIGINS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
    {!nc&&<Field label="Quantidade afetada *"><input type="number" required min="0.000001" max={origin?.quantity||1000000} step="0.000001" className={field} value={quantity} onChange={e=>setQuantity(e.target.value)}/></Field>}
    <Field label="Responsável interno"><select className={field} value={assigned} onChange={e=>setAssigned(e.target.value)}><option value="">A definir</option>{assigned&&!source.profiles.some(p=>p.id===assigned)&&<option value={assigned}>Responsável inativo — selecione outro</option>}{source.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
    <Field label="Fornecedor responsável"><select className={field} value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="">Não se aplica / a definir</option>{supplier&&!source.suppliers.some(s=>s.id===supplier)&&<option value={supplier}>Fornecedor inativo — selecione outro</option>}{source.suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
    <Field label="Impacto declarado no prazo (dias)"><input type="number" min="0" max="365" step="1" required className={field} value={impact} onChange={e=>setImpact(e.target.value)}/></Field>
   </div>
   <Field label="Descrição do problema *"><textarea className={field} rows={4} required minLength={5} maxLength={5000} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
   <fieldset className="rounded-xl border p-3"><legend className="px-1 text-sm font-medium">Equipe de acompanhamento</legend><div className="grid gap-2 sm:grid-cols-2">{source.profiles.map(p=><label key={p.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={team.includes(p.id)} disabled={!team.includes(p.id)&&team.length>=20} onChange={e=>setTeam(values=>e.target.checked?[...values,p.id]:values.filter(id=>id!==p.id))}/>{p.name}</label>)}</div></fieldset>
   <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={severity==='critical'||blocking} disabled={executing||severity==='critical'} onChange={e=>setBlocking(e.target.checked)}/><span>Bloquear conclusão da Produção vinculada até resolver a NC. Gravidade crítica sempre bloqueia.</span></label>
   <label className="flex min-h-11 items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={costApplicable} onChange={e=>setCostApplicable(e.target.checked)}/><span>Há custos adicionais a apurar. O encerramento exige valores efetivos; ausência de custo não equivale a zero.</span></label>
   <p className="text-xs text-muted-foreground">O impacto de prazo é informativo. Registrar a NC não muda prazos, preços, status do Pedido ou execução automaticamente.</p>
   {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
   <FormFooter busy={busy} onClose={onClose}/>
  </fieldset></form>
 </PurchaseModal>;
}

// Preserve the selected source discriminator, rather than infer it from related IDs.
function originKind(origin:OriginContext) {return origin.source_type;}
function originId(origin:OriginContext) {return origin.source_id;}
