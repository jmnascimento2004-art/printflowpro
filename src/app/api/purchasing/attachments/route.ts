import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {boundedBody,reviewRate} from '@/lib/reviews-server';
import {purchasingFailure,purchasingHeaders} from '@/lib/purchasing/server';
export const runtime='nodejs';
export async function GET(request:Request){try{
 await authenticatePdfRequest(request);const client=getAuthenticatedPdfClient(request),id=new URL(request.url).searchParams.get('id');
 const {data,error}=await client.rpc('purchase_file_access',{p_kind:'attachment',p_id:id,p_write:false});if(error)throw error;
 const signed=await client.storage.from('purchase-documents').createSignedUrl(data.path,60,{download:data.name});if(signed.error)throw signed.error;
 return NextResponse.json({url:signed.data.signedUrl},{headers:purchasingHeaders});
}catch(e){return purchasingFailure(e);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Origem inválida.'},{status:403,headers:purchasingHeaders});
 const access=await authenticatePdfRequest(request);await reviewRate(request,`purchase-upload:${access.companyId}:${access.userId}`,20);
 const raw=await boundedBody(request,5242880+20000),form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:raw}).formData();
 const file=form.get('file'),kind=String(form.get('kind')||''),id=String(form.get('id')||''),operationId=String(form.get('operationId')||'');
 if(!(file instanceof File)||!['supplier','order'].includes(kind)||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)||[...form.keys()].some(k=>!['file','kind','id','operationId'].includes(k))||file.size<1||file.size>5242880)return NextResponse.json({error:'Use PDF, XML, JPG ou PNG de até 5 MB.'},{status:400,headers:purchasingHeaders});
 const client=getAuthenticatedPdfClient(request),gate=await client.rpc('purchase_file_access',{p_kind:kind,p_id:id,p_write:true});if(gate.error)throw gate.error;if(gate.data.company_id!==access.companyId)throw {code:'42501'};
 const bytes=Buffer.from(await file.arrayBuffer()),text=bytes.toString('utf8');
 const mime=bytes.subarray(0,5).toString()==='%PDF-'?'application/pdf':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':/^\s*(?:<\?xml\s[^>]*\?>\s*)?<[-\w:]+(?:\s|>)/u.test(text)&&!/<!DOCTYPE|<!ENTITY/i.test(text)?'application/xml':'';
 const expected:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',xml:'application/xml'},extension=file.name.split('.').at(-1)?.toLowerCase()||'';
 if(!mime||expected[extension]!==mime)return NextResponse.json({error:'Conteúdo e extensão do arquivo devem corresponder a PDF, XML, JPG ou PNG. XML com DTD/entidades não é aceito.'},{status:400,headers:purchasingHeaders});
 const name=file.name.replace(/[\x00-\x1f\\/]/g,'_').slice(0,180),path=`${access.companyId}/${kind}/${id}/${operationId}.${extension}`;
 const bucket=getSupabaseAdminClient().storage.from('purchase-documents'),stored=await bucket.upload(path,bytes,{contentType:mime,upsert:false});
 if(stored.error){
  if(!['409','Duplicate'].includes(String(stored.error.statusCode))&&!/already exists/i.test(stored.error.message))throw stored.error;
  const existing=await bucket.download(path);if(existing.error)throw existing.error;
  if(createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw {code:'22023',message:'Arquivo: chave de operação já utilizada por outro conteúdo.'};
 }
 const args={p_operation_id:operationId,p_action:'attachment_add',p_payload:{[kind==='supplier'?'supplier_id':'order_id']:id,path,name,mime,bytes:bytes.length}};
 let saved=await client.rpc('purchase_command',args);
 // Same operation recovers a committed response lost in transport. Never delete an
 // object after an ambiguous registration outcome; an authorized retry recovers it.
 if(saved.error&&!saved.error.code)saved=await client.rpc('purchase_command',args);
 if(saved.error)throw saved.error;
 return NextResponse.json(saved.data,{headers:purchasingHeaders});
}catch(e){return purchasingFailure(e);}}
