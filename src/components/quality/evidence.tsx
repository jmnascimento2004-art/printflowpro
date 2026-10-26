'use client';
import Image from 'next/image';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Field,purchaseField as field} from '@/components/purchasing/shared';
import {qualityRequest,QualityRequestError} from '@/lib/quality/client';
import type {Evidence,Nonconformity} from '@/lib/quality/model';
import type {QualityMutation,QualityResult} from './use-quality';

export function QualityEvidenceImage({evidence}:{evidence:Evidence}) {
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();setUrl('');setError('');
  if(evidence.state==='ready')qualityRequest<{url:string}>(`/files?id=${encodeURIComponent(evidence.id)}`,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted)setUrl(result.url);}).catch(()=>{if(!controller.signal.aborted)setError('Arquivo indisponível ou acesso expirado.');});
  return()=>controller.abort();
 },[evidence.id,evidence.state,revision]);
 if(evidence.state==='removed')return <p className="text-sm text-muted-foreground">Arquivo removido com registro preservado.</p>;
 if(evidence.state==='pending')return <p className="text-sm">Upload pendente. Retome o mesmo arquivo ou solicite remoção a um gestor.</p>;
 if(error)return <div className="space-y-2 text-sm"><p>{error}</p><button className="pf-button-secondary" onClick={()=>setRevision(v=>v+1)}>Recarregar imagem</button></div>;
 return url?<Image src={url} unoptimized width={1200} height={800} alt={evidence.caption||'Evidência interna da não conformidade'} className="h-auto max-h-64 w-full rounded-xl border bg-white object-contain" onError={()=>setError('Arquivo indisponível ou acesso expirado.')}/>:<p className="text-xs text-muted-foreground">Carregando evidência…</p>;
}

export function QualityEvidenceUpload({nc,disabled,mutate,refresh}:{nc:Nonconformity;disabled:boolean;mutate:QualityMutation;refresh:()=>Promise<unknown>}) {
 const [file,setFile]=useState<File|null>(null),[caption,setCaption]=useState(''),[error,setError]=useState('');
 const input=useRef<HTMLInputElement>(null),pending=useRef(new Map<string,{operationId:string;version:string}>());
 async function submit(event:FormEvent) {
  event.preventDefault();setError('');
  if(!file){setError('Selecione a imagem.');return;}
  if(file.size>5242880){setError('Use um arquivo de até 5 MB.');return;}
  const key=JSON.stringify([nc.id,nc.cycle,file.name,file.size,file.lastModified,caption]);
  const operation=pending.current.get(key)||{operationId:crypto.randomUUID(),version:nc.updated_at};
  pending.current.set(key,operation);
  const form=new FormData();form.set('id',nc.id);form.set('updated_at',operation.version);form.set('operationId',operation.operationId);form.set('file',file);form.set('caption',caption);
  try {
   await mutate(()=>qualityRequest<QualityResult>('/files',{method:'POST',body:form}));
   pending.current.delete(key);setFile(null);setCaption('');if(input.current)input.current.value='';
  } catch(e) {
   if(e instanceof QualityRequestError&&e.status===409)pending.current.delete(key);
   setError((e as Error).message);
   try{await refresh();}catch{/* Keep the failed request and its retry key visible. */}
  }
 }
 return <form onSubmit={submit} className="space-y-3 rounded-xl border p-4">
  <h3 className="font-semibold">Adicionar foto ou anexo de imagem</h3>
  <Field label="Arquivo JPG, PNG ou WebP — até 5 MB"><input ref={input} type="file" required disabled={disabled} accept="image/jpeg,image/png,image/webp" className={field} onChange={e=>setFile(e.target.files?.[0]||null)}/></Field>
  <Field label="Legenda / contexto"><input className={field} value={caption} maxLength={300} disabled={disabled} onChange={e=>setCaption(e.target.value)}/></Field>
  <p className="text-xs text-muted-foreground">Evidência interna da empresa, vinculada ao ciclo atual. Uma repetição do mesmo arquivo e legenda retoma a reserva; um registro removido não é reativado.</p>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  <button type="submit" className="pf-button-primary" disabled={disabled||!file}>Adicionar evidência</button>
 </form>;
}
