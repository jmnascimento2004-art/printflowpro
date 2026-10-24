import {NextRequest,NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {boundedBody,reviewRate} from '@/lib/reviews-server';
import {requireStoreOrigin} from '@/lib/store/store-boundary.server';
import {chatHeaders} from '@/lib/chat/public.server';
export async function GET(request:NextRequest){try{
 await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request),cid=new URL(request.url).searchParams.get('conversation');
 const before=new URL(request.url).searchParams.get('before');
 const {data,error}=before&&cid?await client.rpc('store_chat_history',{p_conversation:cid,p_before:Number(before)}):await client.rpc('store_chat_inbox',{p_conversation:cid||null});if(error)throw new Error('Atendimento não autorizado.');return NextResponse.json(data,{headers:chatHeaders});
 }catch{return NextResponse.json({error:'Atendimento não autorizado.'},{status:403,headers:chatHeaders});}}
export async function POST(request:NextRequest){try{
 requireStoreOrigin(request);const access=await authenticatePdfRequest(request);await reviewRate(request,`chat-admin:${access.companyId}:${access.userId}`,120);
 const body=JSON.parse((await boundedBody(request,14000)).toString()),client=getAuthenticatedPdfClient(request);
 const {data,error}=await client.rpc('store_chat_command',{p_action:body.action,p_conversation:body.conversation||null,p_payload:body.payload||{}});if(error)throw new Error(error.message);return NextResponse.json(data,{headers:chatHeaders});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Não foi possível concluir.'},{status:400,headers:chatHeaders});}}
