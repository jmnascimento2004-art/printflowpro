import {NextRequest,NextResponse} from 'next/server';
import {resolveStoreBoundary} from '@/lib/store/store-boundary.server';
import {reviewHeaders,reviewRate} from '@/lib/reviews-server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 await reviewRate(request,'public-reviews',60);const {client,companyId}=await resolveStoreBoundary(request);const url=new URL(request.url),product=url.searchParams.get('product'),page=Number(url.searchParams.get('page')||0);
 if(!product||product.length>128||!Number.isInteger(page)||page<0||page>1000)throw new Error('Inválido.');
 const {data,error}=await client.rpc('product_reviews_public',{p_company:companyId,p_product:product,p_page:page});if(error||!data)return NextResponse.json({error:'Produto indisponível.'},{status:404,headers:reviewHeaders});
 return NextResponse.json(data,{headers:reviewHeaders});
}catch{return NextResponse.json({error:'Avaliações indisponíveis.'},{status:400,headers:reviewHeaders});}}
