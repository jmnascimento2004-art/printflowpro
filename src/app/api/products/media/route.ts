import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {boundedBody,reviewHeaders,reviewRate} from '@/lib/reviews-server';
import {MAX_IMAGE_BYTES} from '@/lib/product-media.mjs';
export const runtime='nodejs';
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new Error('Origem inválida.');
 const access=await authenticatePdfRequest(request);await reviewRate(request,`media:${access.companyId}:${access.userId}`,20);
 const raw=await boundedBody(request,MAX_IMAGE_BYTES+100000);const form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:raw}).formData();
 if([...form.keys()].some(k=>!['file','productId','scope'].includes(k)))throw new Error('Upload inválido.');
 const file=form.get('file'),productId=String(form.get('productId')||'draft'),scope=String(form.get('scope')||'products');
 const {data:company,error:denied}=await getAuthenticatedPdfClient(request).rpc('product_media_access',{p_scope:scope});if(denied||company!==access.companyId)return NextResponse.json({error:'Acesso não autorizado.'},{status:403,headers:reviewHeaders});
 if(!(file instanceof File)||file.size===0||file.size>MAX_IMAGE_BYTES||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG ou WEBP de até 2 MB.');
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(productId))throw new Error('Produto inválido.');
 const admin=getSupabaseAdminClient();if(scope==='products'&&productId!=='draft'){const {data}=await admin.from('products').select('id').eq('id',productId).eq('company_id',company).maybeSingle();if(!data)throw new Error('Produto indisponível.');}
 const input=Buffer.from(await file.arrayBuffer());const image=sharp(input,{limitInputPixels:40000000,animated:false,failOn:'warning'}),metadata=await image.metadata();
 if(!['jpeg','png','webp'].includes(metadata.format||'')||metadata.pages&&metadata.pages>1||file.type!==`image/${metadata.format}`)throw new Error('Conteúdo de imagem inválido.');
 const output=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:82}).toBuffer();if(output.length>MAX_IMAGE_BYTES)throw new Error('Imagem otimizada acima do limite.');
 const hash=createHash('sha256').update(output).digest('hex'),path=`${company}/${scope}/${productId}/${hash}.webp`;
 const url=admin.storage.from('product-images').getPublicUrl(path).data.publicUrl;
 const registry=await admin.rpc('product_media_register',{p_company:company,p_actor:access.userId,p_path:path,p_url:url,p_sha:hash,p_bytes:output.length});if(registry.error)throw new Error('Não foi possível registrar a mídia.');
 const uploaded=await admin.storage.from('product-images').upload(path,output,{contentType:'image/webp',cacheControl:'31536000',upsert:false});if(uploaded.error&&!['409','Duplicate'].includes(String(uploaded.error.statusCode))&&!/already exists/i.test(uploaded.error.message))throw new Error('Falha no envio. Tente novamente.');
 return NextResponse.json({url,path,bytes:output.length},{headers:reviewHeaders});
}catch(e){return NextResponse.json({error:e instanceof Error&&/^(Use |Conteúdo|Imagem|Produto|Falha|Não foi possível|Payload)/.test(e.message)?e.message:'Não foi possível enviar a imagem.'},{status:400,headers:reviewHeaders});}}
