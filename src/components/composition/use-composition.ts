'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useDatabase} from '@/context/database-context';
import {compositeRequest} from '@/lib/composition/client';
import {createPurchaseLoadState} from '@/lib/purchasing/load-state.mjs';
import type {Product} from '@/lib/dummy-data';
import type {CompositeSource} from '@/lib/composition/model';
export type CompositeCommand=(action:string,payload:Record<string,unknown>)=>Promise<{id?:string;company_id:string;product?:Product;consumption_id?:string;reused?:boolean}>;
export function useComposition(query=''){
 const {applyPurchasingResult}=useDatabase();
 const [source,setSource]=useState<CompositeSource|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [loads]=useState(createPurchaseLoadState),alive=useRef(true),queryRef=useRef(query),writing=useRef(false),pending=useRef(new Map<string,string>());queryRef.current=query;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;loads.invalidate();};},[loads]);
 const refresh=useCallback(async()=>{if(!alive.current)throw new Error('A sessão mudou. Confira o registro antes de continuar.');const currentQuery=queryRef.current,ticket=loads.begin();const result=await compositeRequest<CompositeSource>(currentQuery);
  if(alive.current&&loads.isCurrent(ticket)&&queryRef.current===currentQuery){setSource(result);setLoading(false);}return result;
 },[loads]);
 useEffect(()=>{const controller=new AbortController(),ticket=loads.begin();setLoading(true);setError('');const current=()=>alive.current&&!controller.signal.aborted&&loads.isCurrent(ticket)&&queryRef.current===query;
  compositeRequest<CompositeSource>(query,{signal:controller.signal}).then(r=>{if(current())setSource(r);}).catch(e=>{if(current()){setSource(null);setError((e as Error).message);}}).finally(()=>{if(current())setLoading(false);});return()=>{controller.abort();loads.invalidate();};
 },[query,loads]);
 const command:CompositeCommand=async(action,payload)=>{if(writing.current)throw new Error('Aguarde a operação em andamento.');writing.current=true;setBusy(true);setError('');setNotice('');const key=JSON.stringify([action,payload]),operationId=pending.current.get(key)||crypto.randomUUID();pending.current.set(key,operationId);
  try{const result=await compositeRequest<Awaited<ReturnType<CompositeCommand>>>('',{method:'POST',body:JSON.stringify({operationId,action,payload})});if(!alive.current)throw new Error('A sessão mudou. Confira o registro antes de continuar.');pending.current.delete(key);
   if(result.product)applyPurchasingResult({company_id:result.company_id,products:[result.product]});setNotice(result.reused?'Solicitação existente reutilizada. Revise quantidade e andamento em Compras.':'Operação concluída.');
   try{const fresh=await refresh();if(alive.current)applyPurchasingResult({company_id:fresh.company_id,products:fresh.products,movements:fresh.movements});}catch{if(alive.current)setNotice('Operação salva. Atualize para recarregar os dados.');}return result;
  }finally{writing.current=false;if(alive.current)setBusy(false);}
 };
 return {source,loading,busy,error,notice,setError,refresh,command};
}
