import {supabase} from '@/lib/supabaseClient';
export async function purchaseRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Entre novamente para continuar.');
 const response=await fetch(`/api/purchasing${path}`,{...init,cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,...(init.body instanceof FormData?{}:{'Content-Type':'application/json'}),...init.headers}});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'Não foi possível concluir a operação.');return result as T;
}
