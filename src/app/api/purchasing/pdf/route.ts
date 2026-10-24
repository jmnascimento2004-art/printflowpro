import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {purchasingFailure,purchasingHeaders} from '@/lib/purchasing/server';
import {renderPurchasePdf} from '@/lib/purchasing/purchase-pdf';
import {purchaseNumber,type PurchaseSource} from '@/lib/purchasing/model';
import {commercialDate} from '@/lib/commercial-intelligence';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 await authenticatePdfRequest(request);const p=new URL(request.url).searchParams,today=commercialDate(new Date()),id=p.get('id');
 if(!id)throw {code:'22023'};const {data,error}=await getAuthenticatedPdfClient(request).rpc('purchase_source',{p_from:today,p_to:today,p_order:id});if(error)throw error;
 const source=data as PurchaseSource,order=source.orders.find(o=>o.id===id);if(!order)throw {code:'P0002'};
 const buffer=await renderPurchasePdf(source,id),filename=`${purchaseNumber(order.number)}.pdf`;
 return new Response(new Uint8Array(buffer),{headers:{...purchasingHeaders,'Content-Type':'application/pdf','Content-Disposition':`${p.get('download')==='1'?'attachment':'inline'}; filename="${filename}"`}});
}catch(e){return purchasingFailure(e);}}
