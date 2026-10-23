import { NextRequest,NextResponse } from 'next/server';
import { resolveStoreBoundary } from '@/lib/store/store-boundary.server';
import { parseCatalogMarketing } from '@/lib/catalog-growth';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:NextRequest) {
 try {
  const {client,companyId}=await resolveStoreBoundary(request);
  const {data,error}=await client.rpc('catalog_public_marketing',{p_company:companyId});if(error)throw error;
  const config=parseCatalogMarketing(data.config);
  return NextResponse.json({config,purchases:config.socialActive?data.purchases:[]},{headers});
 }catch{return NextResponse.json({error:'Indisponível.'},{status:503,headers});}
}
