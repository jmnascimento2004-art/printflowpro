import { createHash,randomUUID } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { requireStoreOrigin,resolveStoreBoundary } from '@/lib/store/store-boundary.server';
import { COMMERCE_COOKIE,readCatalogSession,setCatalogSession } from '@/lib/store/catalog-session.server';
import { priceStoreCart } from '@/lib/store/checkout-pricing.server';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:NextRequest) {
 try {
  requireStoreOrigin(request);
  const text=await request.text();if(text.length>100000)throw new Error('Carrinho inválido.');
  const body=JSON.parse(text);
  if(!/^[0-9a-f-]{36}$/i.test(body.operationId||''))throw new Error('Operação inválida.');
  const {client,companyId}=await resolveStoreBoundary(request);
  let actor:string|null=null;
  const authorization=request.headers.get('authorization');
  if(authorization){const token=authorization.match(/^Bearer ([^\s]+)$/i)?.[1];if(!token)throw new Error('Conta Store indisponível.');const identity=await client.auth.getUser(token);if(identity.error||!identity.data.user||identity.data.user.is_anonymous)throw new Error('Conta Store indisponível.');actor=identity.data.user.id;}
  const session=readCatalogSession(request,companyId,COMMERCE_COOKIE)||randomUUID();
  const customer=body.customer||{};
  if(typeof customer!=='object'||Array.isArray(customer)||Object.keys(customer).some(k=>!['name','phone','address','notes','delivery_type','delivery_address','pickup_point'].includes(k)))throw new Error('Cliente inválido.');
  for(const [key,limit] of Object.entries({name:120,phone:20,notes:1500,delivery_type:20,delivery_address:1000,pickup_point:120})){if(customer[key]!==undefined&&(typeof customer[key]!=='string'||customer[key].length>limit))throw new Error('Cliente inválido.');}
  if(body.preview!==true){
   if(!['retirada','motoboy'].includes(customer.delivery_type)||!/^\+?[\d ()-]{8,20}$/.test(customer.phone||''))throw new Error('Preencha nome e telefone.');
   const address=customer.address;
   if(!address||typeof address!=='object'||Array.isArray(address)||Object.keys(address).some(k=>!['street','number','neighborhood','city','state','zip_code'].includes(k))||Object.values(address).some(v=>typeof v!=='string'||v.length>200))throw new Error('Endereço inválido.');
   if(customer.delivery_type==='motoboy'&&['street','number','neighborhood','city','state','zip_code'].some(key=>!address[key]?.trim()))throw new Error('Preencha o endereço completo.');
  }
  const snapshot={items:body.items,customer,coupon:String(body.coupon||'').trim().toUpperCase(),actor};
  const hash=createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const prior=await client.rpc('catalog_checkout_result',{p_company:companyId,p_operation:body.operationId,p_hash:hash});if(prior.error)throw prior.error;
  if(prior.data){const response=NextResponse.json(prior.data,{headers});setCatalogSession(response,companyId,COMMERCE_COOKIE,session);return response;}
  const items=await priceStoreCart(client,companyId,body.items);
  if(customer.pickup_point){const point=await client.from('pickup_points').select('id,name').eq('company_id',companyId).eq('active',true).eq('name',String(customer.pickup_point)).maybeSingle();if(point.error||!point.data)throw new Error('Ponto de retirada indisponível.');customer.notes=`${String(customer.notes||'').slice(0,1500)}\nRetirada: ${point.data.name}`;}
  const {data,error}=await client.rpc('catalog_checkout',{p_company:companyId,p_session:session,p_operation:body.operationId,p_hash:hash,p_customer:customer,p_items:items,p_coupon:snapshot.coupon,p_tracking_session:body.analyticsConsent===true?readCatalogSession(request,companyId):null,p_preview:body.preview===true,p_actor:actor});
  if(error)throw error;
  const response=NextResponse.json(data,{headers});setCatalogSession(response,companyId,COMMERCE_COOKIE,session);return response;
 }catch(error){
  const message=(error as {message?:string})?.message||'';
  const safe=/^(Cupom |Limite |Preencha |Produto indisponível|Revise a configuração|Operação já usada)/.test(message)?message:'Não foi possível enviar. Revise o carrinho e tente novamente.';
  return NextResponse.json({error:safe},{status:400,headers});
 }
}
