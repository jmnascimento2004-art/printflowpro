'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {fieldRequest} from '@/lib/field-services/client';
import type {FieldSource} from '@/lib/field-services/model';
export type FieldCommand=(action:string,payload:Record<string,unknown>)=>Promise<{id:string;reused?:boolean;updated_at?:string;file?:{id:string;path:string}}>;
export function useFieldServices(query:string){const [source,setSource]=useState<FieldSource|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),alive=useRef(true),serial=useRef(0),writing=useRef(false),pending=useRef(new Map<string,string>()),queryRef=useRef(query);queryRef.current=query;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const refresh=useCallback(async()=>{const key=++serial.current,q=queryRef.current;const data=await fieldRequest<FieldSource>(q);if(alive.current&&key===serial.current&&q===queryRef.current)setSource(data);return data;},[]);
 useEffect(()=>{const controller=new AbortController(),key=++serial.current;setLoading(true);setError('');fieldRequest<FieldSource>(query,{signal:controller.signal}).then(data=>{if(alive.current&&!controller.signal.aborted&&key===serial.current)setSource(data);}).catch(e=>{if(!controller.signal.aborted&&key===serial.current){setSource(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted&&key===serial.current)setLoading(false);});return()=>{controller.abort();};},[query]);
 const command:FieldCommand=async(action,payload)=>{if(writing.current)throw new Error('Aguarde a operação em andamento.');writing.current=true;setBusy(true);setError('');const key=JSON.stringify([action,payload]),operationId=pending.current.get(key)||crypto.randomUUID();pending.current.set(key,operationId);try{const result=await fieldRequest<Awaited<ReturnType<FieldCommand>>>('',{method:'POST',body:JSON.stringify({operationId,action,payload})});if(!alive.current)throw new Error('A sessão mudou. Confira a operação.');pending.current.delete(key);setNotice(result.reused?'Serviço já existente aberto.':'Operação registrada.');try{await refresh();}catch{setNotice('Operação salva. Atualize para recarregar.');}return result;}finally{writing.current=false;if(alive.current)setBusy(false);}};
 return {source,loading,busy,error,notice,setError,command,refresh};
}
