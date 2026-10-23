'use client';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import type {ProductGalleryImage} from '@/lib/dummy-data';
import {supabase} from '@/lib/supabaseClient';
import {uploadManagedImage} from '@/lib/media-upload-client';
import {validateProductImage,validateProductGalleryLimit} from '@/lib/product-images';
import {useActionDialog} from '@/components/action-dialog-provider';
export function ProductMediaEditor({images,onChange,productId,video,onVideo,onBusy}:{images:ProductGalleryImage[];onChange:(images:ProductGalleryImage[])=>void;productId?:string;video:string;onVideo:(url:string)=>void;onBusy:(busy:boolean)=>void}){
 const requestAction=useActionDialog(),alive=useRef(true),drag=useRef<number|null>(null),retry=useRef<File[]>([]);
 const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;onBusy(false);};},[onBusy]);
 async function upload(files:File[]){if(busy||!files.length)return;const limit=validateProductGalleryLimit(images.length,files.length);if(!limit.valid){setError(limit.message);return;}
  const invalid=files.map(validateProductImage).find(v=>!v.valid);if(invalid&&!invalid.valid){setError(invalid.message);return;}
  retry.current=files;setBusy(true);onBusy(true);setError('');setProgress(0);
  try{const added:ProductGalleryImage[]=[];for(let i=0;i<files.length;i++){const asset=await uploadManagedImage(supabase,files[i],'products',productId||'draft',p=>{if(alive.current)setProgress(Math.round((i*100+p)/files.length));});added.push({url:asset.url,alt:'',is_primary:images.length===0&&i===0});}
   if(alive.current){onChange([...images,...added]);retry.current=[];}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Falha no envio.');}finally{if(alive.current){setBusy(false);onBusy(false);}}
 }
 function move(from:number,to:number){if(busy||to<0||to>=images.length||from===to)return;const next=[...images];next.splice(to,0,next.splice(from,1)[0]);onChange(next);}
 async function remove(index:number){await requestAction({title:'Remover imagem do produto?',description:images[index].is_primary?'A próxima imagem disponível será a capa. A alteração será aplicada ao salvar o produto.':'A imagem será retirada da galeria ao salvar. Arquivos compartilhados não serão apagados.',confirmLabel:'Remover imagem',variant:'warning'},()=>{const next=images.filter((_,i)=>i!==index);if(next.length&&!next.some(i=>i.is_primary))next[0]={...next[0],is_primary:true};onChange(next);});}
 return <section aria-label="Mídia do produto" className="space-y-4"><p className="text-sm text-muted-foreground">Até 3 imagens, 2 MB por arquivo. Novos uploads são otimizados em WEBP. Arraste para ordenar ou use as setas; salve o produto para aplicar.</p>
 <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">{images.map((image,index)=><article key={image.url} draggable={!busy} onDragStart={()=>{drag.current=index;}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(drag.current!==null)move(drag.current,index);drag.current=null;}} className="min-w-0 rounded-xl border border-border bg-background p-3">
 <Image unoptimized width={200} height={150} src={image.url} alt={image.alt||`Imagem ${index+1} do produto`} className="aspect-[4/3] w-full rounded-lg object-contain"/>
 <p className="my-2 text-xs font-semibold">Imagem {index+1}{image.is_primary?' · Capa':''}</p><div className="flex flex-wrap gap-1">
 <button type="button" className="pf-button-secondary" disabled={busy||index===0} aria-label={`Mover imagem ${index+1} para antes`} onClick={()=>move(index,index-1)}>←</button><button type="button" className="pf-button-secondary" disabled={busy||index===images.length-1} aria-label={`Mover imagem ${index+1} para depois`} onClick={()=>move(index,index+1)}>→</button>
 <button type="button" className="pf-button-secondary" disabled={busy||image.is_primary} aria-label={`Definir capa ${index+1}`} onClick={()=>onChange(images.map((img,i)=>({...img,is_primary:i===index})))}>{image.is_primary?'Capa atual':'Definir capa'}</button><button type="button" className="pf-button-secondary" disabled={busy} aria-label={`Remover imagem ${index+1}`} onClick={()=>void remove(index)}>Remover</button></div></article>)}</div>
 <label className="block text-sm font-semibold">Adicionar imagens<input className="mt-2 block max-w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy||images.length>=3} onChange={e=>{void upload(Array.from(e.currentTarget.files||[]));e.currentTarget.value='';}}/></label>
 {busy&&<div role="status"><p className="text-xs">Enviando e otimizando imagens… {progress}%</p><progress className="w-full" value={progress} max={100}/></div>}{error&&<div role="alert" className="text-sm text-rose-700"><p>{error}</p>{retry.current.length>0&&<button type="button" className="pf-button-secondary mt-2" disabled={busy} onClick={()=>void upload(retry.current)}>Tentar envio novamente</button>}</div>}
 <label className="block text-sm font-semibold">Vídeo do produto (opcional)<input className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 text-sm" type="url" maxLength={500} placeholder="https://www.youtube.com/watch?v=… ou https://vimeo.com/…" value={video} onChange={e=>onVideo(e.target.value)}/></label><p className="text-xs text-muted-foreground">Somente YouTube ou Vimeo. Sem autoplay; o vídeo é carregado quando o cliente solicita.</p></section>;
}
