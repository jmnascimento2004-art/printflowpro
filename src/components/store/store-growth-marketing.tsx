'use client';
import { useEffect,useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { DEFAULT_CATALOG_MARKETING,marketingVisible,type CatalogMarketing } from '@/lib/catalog-growth';
import { getPublicProductPath } from '@/lib/store/product-permalink';
import { safeHref } from '@/lib/safe-url';

export function StoreGrowthMarketing({checkoutOpen,onBannerClick}:{checkoutOpen:boolean;onBannerClick:()=>void}) {
 const [config,setConfig]=useState<CatalogMarketing>(DEFAULT_CATALOG_MARKETING);
 const [purchases,setPurchases]=useState<Array<{name:string;slug:string}>>([]);
 const [now,setNow]=useState(0);const [message,setMessage]=useState(0);const [dismissed,setDismissed]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  void fetch('/api/store/marketing',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(data=>{if(data){setConfig(data.config);setPurchases(data.purchases);}}).catch(()=>{});
  setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);
  return ()=>{controller.abort();clearInterval(timer);};
 },[]);
 useEffect(()=>{const timer=setInterval(()=>{setMessage(i=>i+1);},config.socialInterval*1000);return()=>clearInterval(timer);},[config.socialInterval]);
 const remaining=config.endsAt?Math.max(0,Math.ceil((Date.parse(config.endsAt)-now)/1000)):0;
 const socialVisible=config.socialActive&&!dismissed&&!checkoutOpen&&purchases.length>0&&now>0&&Math.floor(now/1000)%config.socialInterval<config.socialDuration;
 const purchase=purchases[message%Math.max(1,purchases.length)];
 return <>
  {now>0&&marketingVisible(config,now)&&<aside aria-label="Campanha do catálogo" className={`z-30 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-3 text-center text-sm ${config.sticky?'sticky top-0':''}`} style={{backgroundColor:config.background,color:config.foreground}}>
   <span className="max-w-2xl break-words">{config.text}</span>
   {config.couponCode&&<strong className="rounded border border-current px-2 py-1">{config.couponCode}</strong>}
   {config.countdown&&config.endsAt&&<span className="font-mono text-xs" aria-label="Tempo restante">{Math.floor(remaining/86400)}d {String(Math.floor(remaining/3600)%24).padStart(2,'0')}:{String(Math.floor(remaining/60)%60).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</span>}
   {config.cta&&config.destination&&<a onClick={onBannerClick} href={safeHref(config.destination)} className="inline-flex min-h-11 max-w-full items-center rounded-lg border border-current px-3 text-xs font-bold">{config.cta}</a>}
  </aside>}
  {socialVisible&&purchase&&<aside aria-label="Compra real na Store" className={`relative z-20 mx-3 my-2 flex max-w-xs items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800 shadow-lg md:fixed md:top-32 ${config.socialPosition==='top-right'?'md:right-4':'md:left-4'}`}>
   <div className="min-w-0 flex-1"><p className="text-slate-500">Alguém comprou</p><Link href={getPublicProductPath(purchase.slug)||'/store'} className="mt-1 block truncate font-bold">{purchase.name}</Link></div>
   <button onClick={()=>setDismissed(true)} type="button" aria-label="Dispensar aviso de compra" className="flex min-h-11 min-w-11 items-center justify-center"><X className="h-4 w-4"/></button>
  </aside>}
 </>;
}
