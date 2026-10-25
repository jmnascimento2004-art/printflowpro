import {supabase} from '@/lib/supabaseClient';
export async function compositeRequest<T>(path:string,init:RequestInit={}):Promise<T>{
 const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Entre novamente para continuar.');
 const response=await fetch(`/api/composition${path}`,{...init,cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json',...init.headers}});
 const body=await response.json();if(!response.ok)throw new Error(body.error||'Não foi possível concluir a operação.');return body as T;
}
