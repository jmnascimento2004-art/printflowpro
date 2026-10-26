'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {qualityRequest} from '@/lib/quality/client';
import type {QualitySource} from '@/lib/quality/model';
export type QualityResult={id:string;updated_at?:string;action_id?:string;service_id?:string};
export type QualityCommand=(action:string,payload:Record<string,unknown>)=>Promise<QualityResult>;
export type QualityMutation=<T>(task:()=>Promise<T>)=>Promise<T>;

export function useQuality(query:string) {
 const [source,setSource]=useState<QualitySource|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const alive=useRef(true),serial=useRef(0),writing=useRef(false),pending=useRef(new Map<string,string>()),queryRef=useRef(query);
 queryRef.current=query;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const refresh=useCallback(async()=>{
  const key=++serial.current,q=queryRef.current,data=await qualityRequest<QualitySource>(q);
  if(alive.current&&key===serial.current&&q===queryRef.current)setSource(data);
  return data;
 },[]);
 useEffect(()=>{
  const controller=new AbortController(),key=++serial.current;
  setLoading(true);setError('');
  qualityRequest<QualitySource>(query,{signal:controller.signal}).then(data=>{if(alive.current&&!controller.signal.aborted&&key===serial.current)setSource(data);}).catch(e=>{if(!controller.signal.aborted&&key===serial.current){setSource(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted&&key===serial.current)setLoading(false);});
  return()=>controller.abort();
 },[query]);
 const mutate:QualityMutation=useCallback(async<T,>(task:()=>Promise<T>)=>{
  if(writing.current)throw new Error('Aguarde a operação em andamento.');
  writing.current=true;setBusy(true);setError('');
  try {
   const result=await task();
   if(!alive.current)throw new Error('A sessão mudou. Confira a operação na empresa de origem.');
   setNotice('Operação registrada.');
   try{await refresh();}catch{setNotice('Operação salva. Atualize para recarregar os dados.');}
   return result;
  } finally {writing.current=false;if(alive.current)setBusy(false);}
 },[refresh]);
 const command:QualityCommand=useCallback((action,payload)=>mutate(async()=>{
  const key=JSON.stringify([action,payload]),operationId=pending.current.get(key)||crypto.randomUUID();
  pending.current.set(key,operationId);
  const result=await qualityRequest<QualityResult>('',{method:'POST',body:JSON.stringify({operationId,action,payload})});
  pending.current.delete(key);
  return result;
 }),[mutate]);
 return {source,loading,busy,error,notice,setError,command,mutate,refresh};
}
