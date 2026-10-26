'use client';
import {supabase} from '@/lib/supabaseClient';
export class QualityRequestError extends Error {
 constructor(message:string,readonly status:number){super(message);this.name='QualityRequestError';}
}

export async function qualityRequest<T>(path='',init:RequestInit={}):Promise<T> {
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw new Error('Entre novamente para continuar.');
 const response=await fetch(`/api/quality${path}`,{...init,headers:{Authorization:`Bearer ${session.access_token}`,...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init.headers},cache:'no-store'});
 const value=await response.json().catch(()=>({error:'Não foi possível confirmar a resposta. Atualize e tente novamente.'}));
 if(!response.ok)throw new QualityRequestError(value.error||'Não foi possível concluir a operação.',response.status);
 return value as T;
}
