import 'server-only';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
export const ANALYTICS_COOKIE='pf_catalog_analytics';
export const COMMERCE_COOKIE='pf_catalog_commerce';
function signature(value:string) {
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw new Error('Configuração indisponível.');
  return createHmac('sha256',key).update(`catalog-session:${value}`).digest('hex');
}
export function readCatalogSession(request:NextRequest,company:string,name=ANALYTICS_COOKIE):string|null {
  const raw=request.cookies.get(name)?.value||'';
  const [id,expiry,tag]=raw.split('.');
  if(!/^[0-9a-f-]{36}$/i.test(id||'') || !/^\d+$/.test(expiry||'') || Number(expiry)<Date.now() || !/^[0-9a-f]{64}$/.test(tag||''))return null;
  const expected=signature(`${company}.${id}.${expiry}.${name}`);
  return timingSafeEqual(Buffer.from(tag),Buffer.from(expected))?id:null;
}
export function setCatalogSession(response:NextResponse,company:string,name:string,id:string= randomUUID()) {
  const maxAge=name===ANALYTICS_COOKIE?1800:86400;
  const expiry=String(Date.now()+maxAge*1000);
  response.cookies.set(name,`${id}.${expiry}.${signature(`${company}.${id}.${expiry}.${name}`)}`,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/store',maxAge});
  return id;
}
