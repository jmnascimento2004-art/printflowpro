import 'server-only';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {parseBillingEvent,signBillingEvent,type BillingEvent} from './provider.mjs';
export {fiscalBody as billingBody} from '@/lib/fiscal/server';
export const billingHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
async function secret(){const {data,error}=await getSupabaseAdminClient().rpc('saas_billing_secret');if(error||typeof data!=='string'||data.length<32)throw new Error('Billing unavailable');return data;}
export async function consumeBillingEvent(body:string,timestamp:string,signature:string){
 const event=parseBillingEvent(body,timestamp,signature,await secret());
 const {data,error}=await getSupabaseAdminClient().rpc('saas_billing_event',{p_event:event});if(error)throw error;return data as {result:string};
}
export async function deliverBillingEvent(event:BillingEvent){const body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));return consumeBillingEvent(body,timestamp,signBillingEvent(body,timestamp,await secret()));}
