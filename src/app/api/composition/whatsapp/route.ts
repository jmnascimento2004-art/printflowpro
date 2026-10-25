import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {compositionFailure} from '@/lib/composition/server';
import {resolveOutsourcingWhatsAppMessage} from '@/lib/whatsapp/system-message-resolver.server';
import type {CompositeSource} from '@/lib/composition/model';
import {commercialDate} from '@/lib/commercial-intelligence';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const access=await authenticatePdfRequest(request),client=getAuthenticatedPdfClient(request),id=new URL(request.url).searchParams.get('id');if(!id)throw {code:'22023'};
 const row=await client.from('outsourcing_orders').select('order_item_id').eq('id',id).maybeSingle();if(row.error)throw row.error;if(!row.data)throw {code:'P0002'};
 const today=commercialDate(new Date()),{data,error}=await client.rpc('composite_source',{p_from:today,p_to:today,p_item:row.data.order_item_id});if(error)throw error;
 const source=data as CompositeSource;if(!source.permissions.outsourcing||!source.permissions.purchases)throw {code:'42501',message:'Sem permissão de Compras para contatar o fornecedor.'};
 return NextResponse.json(await resolveOutsourcingWhatsAppMessage(access.companyId,id),{headers:purchasingHeaders});
}catch(e){return compositionFailure(e);}}
