'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useStorePrivacy } from '@/context/store-privacy-context';
import { sanitizeCatalogSearch, type CatalogEvent, type CatalogEventType } from '@/lib/catalog-growth';

export function useCatalogTracking(pathname:string,pageView=true) {
 const {cookiePreferences,hasCookieChoice}=useStorePrivacy();
 const enabled=hasCookieChoice&&cookiePreferences.analytics;
 const enabledRef=useRef(enabled);enabledRef.current=enabled;
 const chain=useRef<Promise<unknown>>(Promise.resolve());
 const lastPage=useRef<string|null>(null);
 const track=useCallback((type:CatalogEventType,fields:Omit<Partial<CatalogEvent>,'id'|'type'>={})=>{
  if(!enabledRef.current)return;
  const event={id:crypto.randomUUID(),type,...fields};
  if(type==='search_performed') {const term=sanitizeCatalogSearch(fields.term);if(!term)return;event.term=term;}
  chain.current=chain.current.catch(()=>{}).then(()=>{
   if(!enabledRef.current)return;
   return fetch('/api/store/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true,events:[event]}),keepalive:true}).catch(()=>{});
  });
 },[]);
 useEffect(()=>{
  if(!pageView)return;
  if(enabled){if(lastPage.current!==pathname){lastPage.current=pathname;track('page_viewed');}}
  else {lastPage.current=null;chain.current=chain.current.catch(()=>{}).then(()=>fetch('/api/store/events',{method:'DELETE'}).catch(()=>{}));}
 },[enabled,pathname,track,pageView]);
 return {track,analyticsConsent:enabled};
}
