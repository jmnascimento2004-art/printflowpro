import { NextResponse } from 'next/server';
import { authenticatePdfRequest,getAuthenticatedPdfClient } from '@/lib/pdf/pdf-server-auth';
import { parseCatalogMarketing } from '@/lib/catalog-growth';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
function failure(error:unknown) {const code=(error as {code?:string})?.code;return NextResponse.json({error:code==='42501'?'Acesso não autorizado.':code==='40001'?'Houve outra alteração. Recarregue antes de salvar.':'Não foi possível concluir. Confira os campos e tente novamente.'},{status:code==='42501'?403:code==='40001'?409:400,headers});}
export async function GET(request:Request) {
 try {
  await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request);const url=new URL(request.url);
  const {data,error}=await client.rpc('catalog_source',{p_from:url.searchParams.get('from'),p_to:url.searchParams.get('to'),p_mode:url.searchParams.get('mode')||'dashboard',p_page:Number(url.searchParams.get('page')||0)});
  if(error)throw error;return NextResponse.json(data,{headers});
 }catch(error){return failure(error);}
}
export async function POST(request:Request) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers});
  await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request);
  const text=await request.text();if(text.length>100000)throw new Error('Payload inválido.');const body=JSON.parse(text);
  if(body.action==='marketing_save')body.payload.config=parseCatalogMarketing(body.payload.config);
  const {data,error}=await client.rpc('catalog_command',{p_action:body.action,p_payload:body.payload});if(error)throw error;
  return NextResponse.json(data,{headers});
 }catch(error){return failure(error);}
}
