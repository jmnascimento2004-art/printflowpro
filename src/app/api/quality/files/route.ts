import {createHash} from 'node:crypto';
import {NextResponse} from 'next/server';
import {normalizeFieldImage} from '@/lib/field-services/image';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {boundedBody,reviewRate} from '@/lib/reviews-server';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {qualityFailure} from '@/lib/quality/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(request:Request) {
 try {
  await authenticatePdfRequest(request);
  const client=getAuthenticatedPdfClient(request);
  const {data,error}=await client.rpc('quality_file_access',{p_id:new URL(request.url).searchParams.get('id')});
  if(error)throw error;
  const signed=await client.storage.from('quality-evidence').createSignedUrl(data.path,60);
  if(signed.error)throw signed.error;
  return NextResponse.json({url:signed.data.signedUrl},{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
export async function POST(request:Request) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw {code:'42501',message:'Sem permissão para esta origem.'};
  const access=await authenticatePdfRequest(request);
  await reviewRate(request,`quality-upload:${access.companyId}:${access.userId}`,30);
  const raw=await boundedBody(request,5262880);
  const form=await new Request(request.url,{method:'POST',headers:{'Content-Type':request.headers.get('content-type')||''},body:raw}).formData();
  const file=form.get('file'),operationId=String(form.get('operationId')||'');
  if(!(file instanceof File)||file.size<1||file.size>5242880||!/^[0-9a-f-]{36}$/i.test(operationId))throw {code:'22023',message:'Qualidade: Use JPG, PNG ou WebP de até 5 MB.'};
  let normalized;
  try {normalized=await normalizeFieldImage(Buffer.from(await file.arrayBuffer()),false);}
  catch(error) {const e=error as {code?:string;message?:string};if(e.code==='22023')throw {...e,message:e.message?.replace(/^Serviço:/,'Qualidade:')};throw error;}
  const {bytes,mime}=normalized,sha=createHash('sha256').update(bytes).digest('hex');
  const client=getAuthenticatedPdfClient(request);
  const reserved=await client.rpc('quality_command',{p_operation_id:operationId,p_action:'file_reserve',p_payload:{id:String(form.get('id')||''),updated_at:String(form.get('updated_at')||''),sha256:sha,bytes:bytes.length,mime,caption:String(form.get('caption')||'').slice(0,300)}});
  if(reserved.error)throw reserved.error;
  if(reserved.data.company_id!==access.companyId)throw {code:'42501',message:'Sem permissão para a empresa.'};
  const row=reserved.data.file;
  const current=await client.from('quality_evidence').select('state,sha256').eq('id',row.id).single();
  if(current.error)throw current.error;
  if(current.data.state==='removed'||current.data.sha256!==sha)throw {code:'22023',message:'Qualidade: Esta reserva de upload foi removida.'};
  if(current.data.state==='ready')return NextResponse.json({id:reserved.data.id},{headers:purchasingHeaders});
  const admin=getSupabaseAdminClient(),bucket=admin.storage.from('quality-evidence');
  const stored=await bucket.upload(row.path,bytes,{contentType:mime,cacheControl:'0',upsert:false});
  if(stored.error) {
   if(!/already exists|duplicate/i.test(stored.error.message)&&String(stored.error.statusCode)!=='409')throw stored.error;
   const existing=await bucket.download(row.path);
   if(existing.error||createHash('sha256').update(Buffer.from(await existing.data!.arrayBuffer())).digest('hex')!==sha)throw {code:'22023',message:'Qualidade: Upload anterior usa outro conteúdo.'};
  }
  const committed=await admin.rpc('quality_commit_upload',{p_id:row.id,p_actor:access.userId,p_sha:sha,p_bytes:bytes.length});
  if(committed.error) {
   const state=await admin.from('quality_evidence').select('state').eq('id',row.id).eq('company_id',access.companyId).eq('actor',access.userId).eq('sha256',sha).maybeSingle();
   if(state.data?.state==='removed')await bucket.remove([row.path]);
   throw committed.error;
  }
  return NextResponse.json(committed.data,{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
export async function DELETE(request:Request) {
 try {
  if(request.headers.get('origin')!==new URL(request.url).origin)throw {code:'42501',message:'Sem permissão para esta origem.'};
  await authenticatePdfRequest(request);
  const raw=await boundedBody(request,20000);
  let body;try{body=JSON.parse(Buffer.from(raw).toString());}catch{throw {code:'22023',message:'Qualidade: Remoção inválida.'};}
  if(typeof body?.operationId!=='string'||!body.payload||typeof body.payload!=='object'||Array.isArray(body.payload))throw {code:'22023',message:'Qualidade: Remoção inválida.'};
  const {data,error}=await getAuthenticatedPdfClient(request).rpc('quality_command',{p_operation_id:body.operationId,p_action:'file_remove',p_payload:body.payload});
  if(error)throw error;
  const removed=await getSupabaseAdminClient().storage.from('quality-evidence').remove([data.path]);
  if(removed.error)throw removed.error;
  return NextResponse.json({id:data.id},{headers:purchasingHeaders});
 } catch(error) {return qualityFailure(error);}
}
