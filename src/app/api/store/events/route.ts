import { randomUUID } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { parseCatalogEvents } from '@/lib/catalog-growth';
import { requireStoreOrigin,resolveStoreBoundary } from '@/lib/store/store-boundary.server';
import { ANALYTICS_COOKIE,readCatalogSession,setCatalogSession } from '@/lib/store/catalog-session.server';
const headers={'Cache-Control':'private, no-store'};
export async function DELETE(request:NextRequest) {
 try {requireStoreOrigin(request);const response=NextResponse.json({ok:true},{headers});response.cookies.set(ANALYTICS_COOKIE,'',{maxAge:0,path:'/api/store'});return response;}catch{return NextResponse.json({error:'Origem inválida.'},{status:403,headers});}
}
export async function POST(request:NextRequest) {
 try {
  requireStoreOrigin(request);
  const text=await request.text();if(text.length>16000)throw new Error('Payload inválido.');
  const body=JSON.parse(text);if(body.consent!==true)throw new Error('Consentimento necessário.');
  const events=parseCatalogEvents(body.events);
  const {client,companyId}=await resolveStoreBoundary(request);
  const existing=readCatalogSession(request,companyId);const session=existing||randomUUID();
  if(!existing)events.unshift({id:randomUUID(),type:'session_started'});
  const {error}=await client.rpc('catalog_record_events',{p_company:companyId,p_session:session,p_events:events});
  if(error)throw error;
  const response=NextResponse.json({ok:true},{headers});setCatalogSession(response,companyId,ANALYTICS_COOKIE,session);return response;
 }catch{return NextResponse.json({error:'Evento não registrado.'},{status:400,headers});}
}
