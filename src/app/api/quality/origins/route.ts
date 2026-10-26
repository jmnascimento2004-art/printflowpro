import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {qualityFailure} from '@/lib/quality/server';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {
  await authenticatePdfRequest(request);
  const p=new URL(request.url).searchParams;
  const {data,error}=await getAuthenticatedPdfClient(request).rpc('quality_origins',{p_kind:p.get('kind'),p_search:p.get('q')||'',p_offset:Number(p.get('offset')||0),p_id:p.get('id'),p_item:p.get('item')});
  if(error)throw error;
  return NextResponse.json(data,{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
