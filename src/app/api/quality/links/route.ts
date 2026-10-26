import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {qualityFailure} from '@/lib/quality/server';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  await authenticatePdfRequest(request);
  const p=new URL(request.url).searchParams;
  let ids;try{ids=JSON.parse(p.get('ids')||'[]');}catch{throw {code:'22023',message:'Qualidade: Referências inválidas.'};}
  if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'||id.length>200))throw {code:'22023',message:'Qualidade: Referências inválidas.'};
  const {data,error}=await getAuthenticatedPdfClient(request).rpc('quality_links',{p_kind:p.get('kind'),p_ids:ids});
  if(error)throw error;
  return NextResponse.json(data,{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
