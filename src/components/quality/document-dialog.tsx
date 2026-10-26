'use client';
import {useState} from 'react';
import {PurchaseModal} from '@/components/purchasing/shared';
import {PdfPreviewViewer} from '@/components/pdf/pdf-preview-viewer';
import {ncNumber,type Nonconformity,type QualitySource} from '@/lib/quality/model';
export function QualityDocumentDialog({source,nc,cycle,onClose}:{source:QualitySource;nc:Nonconformity;cycle:number;onClose:()=>void}) {
 const closure=source.closures.find(c=>c.cycle===cycle),files=closure?.snapshot.evidence||source.evidence.filter(e=>e.cycle===cycle);
 const photos=files.filter(e=>source.evidence.some(current=>current.id===e.id&&current.state==='ready'));
 const [selected,setSelected]=useState(()=>photos.map(e=>e.id));
 const query=new URLSearchParams({id:nc.id,cycle:String(cycle),evidence:selected.join(',')}),url=`/api/quality/pdf?${query}`;
 return <PurchaseModal title={`${ncNumber(nc.number)} · relatório interno · ciclo ${cycle}`} busy={false} onClose={onClose} wide>
  {!!photos.length&&<fieldset className="mb-4 rounded-xl border p-3"><legend className="px-2 text-sm font-medium">Evidências incluídas no PDF</legend><div className="flex flex-wrap gap-3">{photos.map((e,index)=><label key={e.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(e.id)} onChange={event=>setSelected(ids=>event.target.checked?[...ids,e.id]:ids.filter(id=>id!==e.id))}/>{e.caption||`Evidência ${index+1}`}</label>)}</div></fieldset>}
  <p className="mb-3 text-xs text-muted-foreground">Documento interno. Encerramentos preservam seus valores e resultados; arquivos removidos permanecem identificados. A seleção muda somente este documento.</p>
  <div className="h-[65dvh]"><PdfPreviewViewer embedded allowPrint title={`${ncNumber(nc.number)} · ciclo ${cycle}`} previewDataUrl={url} downloadUrl={`${url}&download=1`} height="100%"/></div>
 </PurchaseModal>;
}
