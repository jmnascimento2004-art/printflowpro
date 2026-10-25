import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {compositionFailure} from '@/lib/composition/server';
import {renderOutsourcingPdf} from '@/lib/composition/outsourcing-pdf';
import {outsourcingNumber,type CompositeSource} from '@/lib/composition/model';
import {commercialDate} from '@/lib/commercial-intelligence';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request),params=new URL(request.url).searchParams,id=params.get('id');if(!id)throw {code:'22023',message:'Informe a OT.'};
 const row=await client.from('outsourcing_orders').select('order_item_id').eq('id',id).maybeSingle();if(row.error)throw row.error;if(!row.data)throw {code:'P0002',message:'Ordem de terceirização indisponível.'};
 const today=commercialDate(new Date()),{data,error}=await client.rpc('composite_source',{p_from:today,p_to:today,p_item:row.data.order_item_id});if(error)throw error;
 const source=data as CompositeSource,order=source.orders.find(t=>t.id===id);if(!order)throw {code:'P0002'};
 const logos=await client.from('companies').select('logo_url,logo_light,logo_dark').eq('id',access.companyId).maybeSingle();if(logos.error)throw logos.error;
 const buffer=await renderOutsourcingPdf(source,id,logos.data||{}),filename=`${outsourcingNumber(order.number)}.pdf`;
 return new Response(new Uint8Array(buffer),{headers:{...purchasingHeaders,'Content-Type':'application/pdf','Content-Disposition':`${params.get('download')==='1'?'attachment':'inline'}; filename="${filename}"`}});
}catch(e){return compositionFailure(e);}}
