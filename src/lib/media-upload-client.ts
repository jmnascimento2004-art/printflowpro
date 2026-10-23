import type {SupabaseClient} from '@supabase/supabase-js';
export async function uploadManagedImage(client:SupabaseClient,file:File,scope:'products'|'catalog'|'avatars',reference='draft',progress?:(value:number)=>void):Promise<{url:string;path:string}>{
 const {data}=await client.auth.getSession();if(!data.session)throw new Error('Entre novamente para enviar imagens.');
 const form=new FormData();form.append('file',file);form.append('productId',reference);form.append('scope',scope);
 return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST','/api/products/media');xhr.setRequestHeader('Authorization',`Bearer ${data.session!.access_token}`);xhr.upload.onprogress=e=>{if(e.lengthComputable)progress?.(Math.min(95,Math.round(e.loaded/e.total*95)));};xhr.onerror=()=>reject(new Error('Falha de conexão. Tente novamente.'));xhr.onload=()=>{try{const result=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new Error(result.error||'Falha no upload.');progress?.(100);resolve(result);}catch(e){reject(e);}};xhr.send(form);});
}
