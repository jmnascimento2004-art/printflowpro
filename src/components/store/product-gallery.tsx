'use client';
import Image from 'next/image';
import {useEffect,useRef,useState} from 'react';
import type {Product} from '@/lib/dummy-data';
import {normalizeProductGallery} from '@/lib/product-images';
import {parseProductVideo} from '@/lib/product-media.mjs';
import {useCatalogTracking} from './use-catalog-tracking';
export function ProductGallery({product}:{product:Product}){
 const images=normalizeProductGallery(product);const [index,setIndex]=useState(()=>Math.max(0,images.findIndex(i=>i.is_primary))),[playing,setPlaying]=useState(false);const touch=useRef<number|null>(null),seen=useRef<string|null>(null);
 const {track}=useCatalogTracking(`/store/product/${product.slug||product.id}`,false);let video;try{video=parseProductVideo(product.pricing_details?.video_url);}catch{video=null;}
 const image=images[index]||images.find(i=>i.is_primary)||images[0];
 useEffect(()=>{if(image&&seen.current!==image.url){seen.current=image.url;track('media_viewed',{productId:product.id});}},[image,product.id,track]);
 function change(next:number){if(images.length){setIndex((next+images.length)%images.length);setPlaying(false);}}
 return <section aria-label="Galeria do produto" className="min-w-0 space-y-3"><div className="aspect-square overflow-hidden bg-white" onTouchStart={e=>{touch.current=e.touches[0].clientX;}} onTouchEnd={e=>{if(touch.current!==null){const delta=e.changedTouches[0].clientX-touch.current;if(Math.abs(delta)>40)change(index+(delta<0?1:-1));touch.current=null;}}}>
 {playing&&video?<iframe title={`Vídeo de ${product.name}`} src={video.embed} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-presentation" allowFullScreen className="h-full w-full border-0"/>:image?<Image unoptimized width={800} height={800} src={image.url} alt={image.alt||product.name} className="h-full w-full object-contain"/>:<p className="p-8 text-sm text-slate-500">Sem imagem</p>}</div>
 {images.length>1&&<div className="flex items-center gap-2 px-3"><button className="min-h-11 min-w-11 rounded-lg border bg-white" aria-label="Imagem anterior" onClick={()=>change(index-1)}>←</button><div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">{images.map((img,i)=><button key={img.url} type="button" className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white ${image?.url===img.url&&!playing?'border-emerald-600':'border-slate-200'}`} aria-label={`Ver imagem ${i+1}`} aria-pressed={image?.url===img.url&&!playing} onClick={()=>change(i)}><Image unoptimized loading="lazy" width={64} height={64} src={img.url} alt={img.alt||`${product.name}, imagem ${i+1}`} className="h-full w-full object-cover"/></button>)}</div><button className="min-h-11 min-w-11 rounded-lg border bg-white" aria-label="Próxima imagem" onClick={()=>change(index+1)}>→</button></div>}
 {video&&<div className="px-3"><button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-white p-3 text-left text-sm font-semibold text-slate-800" onClick={()=>{setPlaying(!playing);if(!playing)track('video_opened',{productId:product.id});}}>{!playing&&image?.url&&<Image unoptimized loading="lazy" width={80} height={48} src={image!.url} alt={`Capa do vídeo de ${product.name}`} className="h-12 w-20 rounded object-cover"/>}{playing?'Voltar às imagens':`Carregar vídeo externo · ${video.provider==='youtube'?'YouTube':'Vimeo'}`}</button></div>}</section>;
}
