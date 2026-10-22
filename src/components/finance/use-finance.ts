'use client';
import { useCallback,useEffect,useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { FinanceModel } from '@/lib/finance/finance-model';
export async function financeRequest(query:string,command?:{operationId:string;action:string;payload:Record<string,unknown>},signal?:AbortSignal) {
 const {data}=await supabase.auth.getSession();
 if(!data.session)throw new Error('Entre novamente para continuar.');
 const response=await fetch(`/api/finance${query?`?${query}`:''}`,{method:command?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(command?{'Content-Type':'application/json'}:{})},body:command?JSON.stringify(command):undefined,cache:'no-store',signal});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível concluir a operação.');return result;
}
export function useFinance(query:string) {
 const [data,setData]=useState<FinanceModel|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[version,setVersion]=useState(0);
 const refresh=useCallback(()=>setVersion(v=>v+1),[]);
 useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');
  financeRequest(query,undefined,abort.signal).then(result=>{if(!abort.signal.aborted)setData(result);}).catch(e=>{if(!abort.signal.aborted){setError(e.message);setData(null);}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return()=>abort.abort();
 },[query,version]);return {data,error,loading,refresh};
}
