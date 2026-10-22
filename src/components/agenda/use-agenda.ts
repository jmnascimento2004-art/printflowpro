'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
export function useAgenda<T>(query: string, enabled=true, pollMs=0) {
  const { session, activeProfile }=useAuth();
  const [revision,setRevision]=useState(0);
  const [result,setResult]=useState<{key:string;data?:T;error?:string}>({key:''});
  const key=`${activeProfile.company_id}:${session?.user.id}:${activeProfile.role}:${activeProfile.active}:${query}:${revision}:${enabled}`;
  useEffect(()=>{if(!enabled||!pollMs)return;const timer=setInterval(()=>setRevision(v=>v+1),pollMs);return()=>clearInterval(timer);},[enabled,pollMs]);
  useEffect(()=>{
    const controller=new AbortController();
    if(!enabled||!session?.access_token||!activeProfile.active) return;
    fetch(`/api/agenda?${query}`,{headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store',signal:controller.signal})
      .then(async r=>{const data=await r.json();if(!r.ok) throw new Error(data.error);if(!controller.signal.aborted)setResult({key,data});})
      .catch(e=>{if(!controller.signal.aborted)setResult({key,error:e.message});});
    return ()=>controller.abort();
  },[key,query,enabled,session?.access_token,activeProfile.active]);
  return {data:result.key===key?result.data:undefined,error:result.key===key?result.error:undefined,refresh:()=>setRevision(v=>v+1)};
}
export type AgendaOptions={profiles:{id:string;name:string}[];customers:{id:string;name:string}[];permissions:Record<string,boolean>};
