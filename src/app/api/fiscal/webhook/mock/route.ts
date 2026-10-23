import {NextResponse} from 'next/server';
import {consumeFiscalEvent,fiscalHeaders,fiscalBody} from '@/lib/fiscal/server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){try{if(!request.headers.get('x-fiscal-timestamp')||!request.headers.get('x-fiscal-signature'))throw new Error('Invalid');const body=await fiscalBody(request,4096);const result=await consumeFiscalEvent(body,request.headers.get('x-fiscal-timestamp')||'',request.headers.get('x-fiscal-signature')||'');return NextResponse.json(result,{headers:fiscalHeaders});}catch{return NextResponse.json({error:'Evento fiscal inválido.'},{status:400,headers:fiscalHeaders});}}
