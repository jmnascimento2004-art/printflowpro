import {NextRequest,NextResponse} from 'next/server';
import {resolveStoreBoundary,requireStoreOrigin} from '@/lib/store/store-boundary.server';
import {boundedBody,reviewActor,reviewHeaders,reviewRate} from '@/lib/reviews-server';
import {parseReview} from '@/lib/product-media.mjs';
export const dynamic='force-dynamic';
async function handle(request:NextRequest,context:{params:Promise<{token:string}>},submit:boolean){try{
 if(submit)requireStoreOrigin(request);await reviewRate(request,submit?'review-submit':'review-token',submit?10:60);
 const {token}=await context.params;const {client,companyId}=await resolveStoreBoundary(request);const actor=await reviewActor(request,submit);
 const review=submit?parseReview(JSON.parse((await boundedBody(request,8192)).toString('utf8'))):null;
 const {data,error}=await client.rpc('product_review_token',{p_company:companyId,p_token:token,p_actor:actor,p_review:review});
 if(error)return NextResponse.json({error:error.code==='42501'?'Entre com a conta vinculada à compra.':error.code==='22023'?error.message:'Não foi possível enviar.'},{status:error.code==='42501'?403:400,headers:reviewHeaders});
 if(!data)return NextResponse.json({error:'Convite indisponível, expirado ou revogado.'},{status:404,headers:reviewHeaders});
 return NextResponse.json(data,{headers:reviewHeaders});
}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Não foi possível concluir.'},{status:400,headers:reviewHeaders});}}
export function GET(request:NextRequest,context:{params:Promise<{token:string}>}){return handle(request,context,false);}
export function POST(request:NextRequest,context:{params:Promise<{token:string}>}){return handle(request,context,true);}
