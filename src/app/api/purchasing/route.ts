import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {boundedBody} from '@/lib/reviews-server';
import {purchasingFailure,purchasingHeaders} from '@/lib/purchasing/server';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{
 await authenticatePdfRequest(request);const p=new URL(request.url).searchParams;
 const {data,error}=await getAuthenticatedPdfClient(request).rpc('purchase_source',{p_from:p.get('from'),p_to:p.get('to'),p_order:p.get('id')||null});if(error)throw error;
 return NextResponse.json(data,{headers:purchasingHeaders});
}catch(e){return purchasingFailure(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers:purchasingHeaders});
 await authenticatePdfRequest(request);const raw=await boundedBody(request,200000);let body;
 try{body=JSON.parse(Buffer.from(raw).toString('utf8'));}catch{return NextResponse.json({error:'Comando inválido.'},{status:400,headers:purchasingHeaders});}
 if(!body||typeof body!=='object'||typeof body.operationId!=='string'||typeof body.action!=='string'||!body.payload||typeof body.payload!=='object')return NextResponse.json({error:'Comando inválido.'},{status:400,headers:purchasingHeaders});
 const {data,error}=await getAuthenticatedPdfClient(request).rpc('purchase_command',{p_operation_id:body.operationId,p_action:body.action,p_payload:body.payload});if(error)throw error;
 return NextResponse.json(data,{headers:purchasingHeaders});
}catch(e){return purchasingFailure(e);}}
