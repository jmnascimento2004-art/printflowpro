import {NextResponse} from 'next/server';
import {authenticatePdfRequest,getAuthenticatedPdfClient} from '@/lib/pdf/pdf-server-auth';
import {boundedBody} from '@/lib/reviews-server';
import {purchasingHeaders} from '@/lib/purchasing/server';
import {fieldFailure} from '@/lib/field-services/server';
import {resolveFieldServiceWhatsAppMessage} from '@/lib/whatsapp/system-message-resolver.server';
import type {FieldSource} from '@/lib/field-services/model';
export const dynamic='force-dynamic';
export async function POST(request:Request){try{if(request.headers.get('origin')!==new URL(request.url).origin)throw {code:'42501'};const access=await authenticatePdfRequest(request),raw=await boundedBody(request,4096);let body;try{body=JSON.parse(Buffer.from(raw).toString());}catch{throw {code:'22023'};}if(typeof body?.id!=='string'||!['scheduled','traveling','completed'].includes(body.kind))throw {code:'22023'};const {data,error}=await getAuthenticatedPdfClient(request).rpc('field_service_source',{p_id:body.id});if(error)throw error;const source=data as FieldSource;if(!source.permissions.manage||!source.services.some(s=>s.id===body.id&&s.status===body.kind))throw {code:'42501',message:'Sem permissão para preparar esta mensagem.'};return NextResponse.json(await resolveFieldServiceWhatsAppMessage(access.companyId,body.id,body.kind),{headers:purchasingHeaders});}catch(e){return fieldFailure(e);}}
