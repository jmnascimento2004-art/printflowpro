'use client';
import {useEffect,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {billingApi,billingFeatures,type BillingAccess} from '@/lib/billing/client';
function pathFeature(path:string){
 const entries=[['/financial/fiscal','fiscal'],['/financial/payment-links','payment_links'],['/financial/commissions','commissions'],['/financial','finance'],['/reports','reports'],['/catalog','catalog']];
 return entries.find(([prefix])=>path===prefix||path.startsWith(prefix+'/'))?.[1];
}
export function BillingBoundary({children,companyId}:{children:ReactNode;companyId:string}){
 const path=usePathname(),[data,setData]=useState<BillingAccess|null>(null),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{const update=()=>setVersion(v=>v+1);window.addEventListener('billing:changed',update);const timer=window.setInterval(update,60000);return()=>{window.removeEventListener('billing:changed',update);window.clearInterval(timer);};},[]);
 useEffect(()=>{const a=new AbortController();setError('');billingApi(true,undefined,a.signal).then(v=>{if(!a.signal.aborted)setData(v);}).catch(e=>{if(!a.signal.aborted)setError(e.message);});return()=>a.abort();},[companyId,version,path]);
 if(error&&!data)return <div role="alert" className="space-y-3 rounded-xl border p-5"><p>{error}</p><button className="pf-button-secondary" onClick={()=>setVersion(v=>v+1)}>Tentar novamente</button></div>;
 if(!data)return <p role="status" className="p-4 text-sm text-muted-foreground">Verificando acesso…</p>;
 const feature=pathFeature(path),blocked=feature&&!data.features[feature]&&!data.read_only;
 return <>{data.managed&&(data.read_only||['grace','past_due'].includes(data.status))&&<aside role="status" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p>{data.read_only?'Assinatura somente leitura. Seus dados, histórico e exportações estão preservados.':'Seu pagamento QA está pendente. A operação continua durante a carência.'}</p>{data.canManage&&<Link className="mt-2 inline-block font-semibold underline" href="/settings/subscription">Plano & Assinatura</Link>}</aside>}{blocked?<section className="space-y-3 rounded-xl border p-6"><h1 className="text-lg font-bold">Recurso indisponível no plano</h1><p className="text-sm">{billingFeatures[feature]} não está incluído nas condições atuais. Os dados existentes estão preservados.</p>{data.canManage&&<Link className="pf-button-secondary" href="/settings/subscription">Ver planos</Link>}</section>:children}</>;
}
