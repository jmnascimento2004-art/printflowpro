import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {boundedBody} from '@/lib/reviews-server';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {compositionFailure} from '@/lib/composition/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 await authenticatePdfRequest(request);const p=new URL(request.url).searchParams;
 let item=p.get('item');const client=getAuthenticatedPdfClient(request);
 if(p.get('id')){const lookup=await client.from('outsourcing_orders').select('order_item_id').eq('id',p.get('id')!).maybeSingle();if(lookup.error)throw lookup.error;if(!lookup.data)throw {code:'P0002',message:'Ordem de terceirização indisponível.'};item=lookup.data.order_item_id;}
 const {data,error}=await client.rpc('composite_source',{p_from:p.get('from'),p_to:p.get('to'),p_item:item,p_reports:p.get('reports')==='1'});if(error)throw error;
 return NextResponse.json(data,{headers:purchasingHeaders});
}catch(e){return compositionFailure(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers:purchasingHeaders});
 await authenticatePdfRequest(request);const raw=await boundedBody(request,200000);let body;
 try{body=JSON.parse(Buffer.from(raw).toString('utf8'));}catch{return NextResponse.json({error:'Comando inválido.'},{status:400,headers:purchasingHeaders});}
 if(!body||typeof body.operationId!=='string'||typeof body.action!=='string'||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))return NextResponse.json({error:'Comando inválido.'},{status:400,headers:purchasingHeaders});
 const {data,error}=await getAuthenticatedPdfClient(request).rpc('composite_command',{p_operation_id:body.operationId,p_action:body.action,p_payload:body.payload});if(error)throw error;
 return NextResponse.json(data,{headers:purchasingHeaders});
}catch(e){return compositionFailure(e);}}
