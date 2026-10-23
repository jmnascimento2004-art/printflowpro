import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {boundedBody,reviewHeaders,reviewOrigin,reviewRate} from '@/lib/reviews-server';
export const dynamic='force-dynamic';
function failure(error:unknown){const code=(error as {code?:string})?.code;return NextResponse.json({error:code==='42501'?'Acesso não autorizado.':code==='40001'?'Houve outra alteração. Recarregue antes de continuar.':code==='22023'?(error as {message:string}).message:'Não foi possível concluir.'},{status:code==='42501'?403:code==='40001'?409:400,headers:reviewHeaders});}
export async function GET(request:Request){try{await authenticatePdfRequest(request);const {data,error}=await getAuthenticatedPdfClient(request).rpc('product_reviews_source');if(error)throw error;return NextResponse.json(data,{headers:reviewHeaders});}catch(e){return failure(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Origem inválida.');
 const access=await authenticatePdfRequest(request);await reviewRate(request,`admin-review:${access.companyId}:${access.userId}`,30);
 const body=JSON.parse((await boundedBody(request,8192)).toString('utf8'));if(!body||Object.keys(body).some(k=>!['action','payload'].includes(k))||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw new Error('Payload inválido.');
 const allowed=['invite','revoke'].includes(body.action)?['order_id','product_id']:['id','revision','reason'];if(Object.keys(body.payload).some(k=>!allowed.includes(k)))throw new Error('Payload inválido.');
 const {data,error}=await getAuthenticatedPdfClient(request).rpc('product_reviews_command',{p_action:body.action,p_payload:body.payload});if(error)throw error;
 return NextResponse.json(data?.token?{url:`${reviewOrigin(data.host)}/store/review/${data.token}`}:{ok:true},{headers:reviewHeaders});
}catch(e){return failure(e);}}
