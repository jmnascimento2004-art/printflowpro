'use client';
import {useEffect,useState} from 'react';
import {Field,purchaseField as field} from '@/components/purchasing/shared';
import {qualityRequest} from '@/lib/quality/client';
import {SOURCES,type OriginContext,type OriginSearch,type OriginSelection} from '@/lib/quality/model';

export function OriginPicker({initial,onChange,busy}:{initial:{kind:keyof typeof SOURCES;id:string;item:string};onChange:(origin:OriginContext|null)=>void;busy:boolean}) {
 const [kind,setKind]=useState(initial.kind),[id,setId]=useState(initial.id),[item,setItem]=useState(initial.item),[search,setSearch]=useState(''),[offset,setOffset]=useState(0),[revision,setRevision]=useState(0);
 const [results,setResults]=useState<OriginSearch|null>(null),[selection,setSelection]=useState<OriginSelection|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');
  const timer=setTimeout(()=>{qualityRequest<OriginSearch>(`/origins?${new URLSearchParams({kind,q:search,offset:String(offset)})}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted)setResults(data);}).catch(e=>{if(!controller.signal.aborted){setResults(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});},200);
  return()=>{clearTimeout(timer);controller.abort();};
 },[kind,search,offset]);
 useEffect(()=>{
  const controller=new AbortController();
  setSelection(null);onChange(null);
  if(id)qualityRequest<OriginSelection>(`/origins?${new URLSearchParams({kind,id,...(item?{item}:{})})}`,{signal:controller.signal}).then(data=>{if(!controller.signal.aborted){setSelection(data);onChange(data.origin);}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[kind,id,item,revision,onChange]);
 return <section className="space-y-4 rounded-xl border p-4">
  <h3 className="font-semibold">Origem canônica</h3>
  <div className="grid gap-4 sm:grid-cols-2">
   <Field label="Tipo de origem *"><select className={field} value={kind} disabled={busy} onChange={e=>{onChange(null);setSelection(null);setKind(e.target.value as keyof typeof SOURCES);setId('');setItem('');setOffset(0);setSearch('');}}>{Object.entries(SOURCES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
   <Field label="Pesquisar referência"><input className={field} value={search} disabled={busy} placeholder="Número, cliente, produto ou fornecedor" onChange={e=>{setSearch(e.target.value);setOffset(0);}}/></Field>
   <Field label="Referência *"><select className={field} value={id} disabled={busy||loading} required onChange={e=>{onChange(null);setSelection(null);setId(e.target.value);setItem('');}}><option value="">{loading?'Pesquisando…':'Selecione a referência'}</option>{id&&!results?.options.some(r=>r.id===id)&&<option value={id}>{selection?.origin.snapshot.label||'Referência selecionada'}</option>}{results?.options.map(r=><option key={r.id} value={r.id}>{r.label} · {r.status}</option>)}</select></Field>
   {selection&&['order','purchase','receipt','field_service'].includes(kind)&&!!selection.items.length&&<Field label="Item da origem"><select className={field} value={item||selection.origin.order_item_id||selection.origin.purchase_item_id||''} disabled={busy||(kind==='field_service'&&!!selection.origin.snapshot.service?.order_item_id)} onChange={e=>{onChange(null);setItem(e.target.value);}}><option value="">Documento inteiro</option>{selection.items.map(i=><option key={i.id} value={i.id}>{i.name} · {i.quantity}</option>)}</select></Field>}
  </div>
  <div className="flex flex-wrap items-center gap-2"><button type="button" className="pf-button-secondary" disabled={busy||loading||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-50))}>Anteriores</button><button type="button" className="pf-button-secondary" disabled={busy||loading||!results?.has_more} onClick={()=>setOffset(v=>v+50)}>Mais referências</button>{id&&<button type="button" className="pf-button-secondary" disabled={busy} onClick={()=>{setError('');setRevision(v=>v+1);}}>Recarregar origem</button>}</div>
  {selection&&<div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm"><p className="break-words font-medium">{selection.origin.snapshot.label}</p><p>{selection.origin.snapshot.customer_name||selection.origin.snapshot.supplier_name||'Origem interna'} · Quantidade de referência: {selection.origin.quantity}</p>{selection.origin.snapshot.item_name&&<p className="break-words">{selection.origin.snapshot.item_name}</p>}<p className="text-xs text-muted-foreground">Para retrabalho na Produção, vincule a NC ao item. Para retorno técnico, use o Serviço Externo original. A origem fica preservada após o registro.</p></div>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
