import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {resolvePurchaseWhatsAppMessage} from '@/lib/whatsapp/system-message-resolver.server';
import {purchasingFailure,purchasingHeaders} from '@/lib/purchasing/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 const access=await authenticatePdfRequest(request),id=new URL(request.url).searchParams.get('id');
 const allowed=await getAuthenticatedPdfClient(request).rpc('purchase_file_access',{p_kind:'order',p_id:id,p_write:false});if(allowed.error)throw allowed.error;
 try{return NextResponse.json(await resolvePurchaseWhatsAppMessage(access.companyId,id!),{headers:purchasingHeaders});}catch{return NextResponse.json({error:'Emita o pedido e confira o telefone ou WhatsApp do fornecedor.'},{status:400,headers:purchasingHeaders});}
}catch(e){return purchasingFailure(e);}}
