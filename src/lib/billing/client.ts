import {supabase} from '@/lib/supabaseClient';
export type BillingAccess={managed:boolean;status:string;read_only:boolean;canManage?:boolean;qa_enabled:boolean;features:Record<string,boolean>;limits:Record<string,number|null>;revision?:number};
export async function billingApi(access=false,command?:{action:string;payload:Record<string,unknown>;operationId:string},signal?:AbortSignal){
 const {data}=await supabase.auth.getSession();if(!data.session)throw new Error('Entre novamente para continuar.');
 const r=await fetch(`/api/saas-billing${access?'?access=1':''}`,{method:command?'POST':'GET',headers:{Authorization:`Bearer ${data.session.access_token}`,...(command?{'Content-Type':'application/json'}:{})},body:command?JSON.stringify(command):undefined,cache:'no-store',signal});
 const value=await r.json();if(!r.ok)throw new Error(value.error||'Não foi possível consultar a assinatura.');return value;
}
export const billingFeatures:Record<string,string>={catalog:'Catálogo',finance:'Financeiro',reports:'Relatórios e DRE',commissions:'Comissões',payment_links:'Links de pagamento',fiscal:'Fiscal QA',advanced_media:'Mídia avançada'};
export const billingStatuses:Record<string,string>={unmanaged:'Sem assinatura gerenciada',trial:'Trial QA',active:'Ativa QA',past_due:'Pagamento pendente QA',grace:'Carência QA',cancelled:'Cancelada QA',expired:'Expirada QA'};
