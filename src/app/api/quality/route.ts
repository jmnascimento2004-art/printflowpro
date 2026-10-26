import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {boundedBody} from '@/lib/reviews-server';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {qualityFailure} from '@/lib/quality/server';
export const dynamic='force-dynamic';

export async function GET(request:Request) {
 try {
  await authenticatePdfRequest(request);
  const p=new URL(request.url).searchParams;
  const {data,error}=await getAuthenticatedPdfClient(request).rpc('quality_source',{p_from:p.get('from')||undefined,p_to:p.get('to')||undefined,p_id:p.get('id'),p_reports:p.get('reports')==='1'});
  if(error)throw error;
  return NextResponse.json(data,{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
export async function POST(request:Request) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw {code:'42501',message:'Sem permissão para esta origem.'};
  await authenticatePdfRequest(request);
  const bytes=await boundedBody(request,180000);
  let body;try{body=JSON.parse(Buffer.from(bytes).toString());}catch{throw {code:'22023',message:'Qualidade: Comando inválido.'};}
  if(!body||typeof body.operationId!=='string'||typeof body.action!=='string'||!body.payload||Array.isArray(body.payload)||typeof body.payload!=='object')throw {code:'22023',message:'Qualidade: Comando inválido.'};
  const {data,error}=await getAuthenticatedPdfClient(request).rpc('quality_command',{p_operation_id:body.operationId,p_action:body.action,p_payload:body.payload});
  if(error)throw error;
  return NextResponse.json(data,{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
