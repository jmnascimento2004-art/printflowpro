import 'server-only';
import {getSupabaseAdminClient} from '@/lib/supabase/server-admin';
import {signFiscalEvent,parseFiscalEvent,type FiscalEvent} from './provider.mjs';
export const fiscalHeaders={'Cache-Control':'private, no-store, max-age=0','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function fiscalBody(request:Request,limit:number){
 if(Number(request.headers.get('content-length'))>limit)throw new Error('Invalid body');
 const reader=request.body?.getReader();if(!reader)throw new Error('Invalid body');const chunks:Uint8Array[]=[];let total=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit){await reader.cancel();throw new Error('Invalid body');}chunks.push(value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
async function secret(){const {data,error}=await getSupabaseAdminClient().rpc('fiscal_mock_secret');if(error||typeof data!=='string'||data.length<32)throw new Error('Fiscal provider unavailable');return data;}
export async function consumeFiscalEvent(body:string,timestamp:string,signature:string){const event=parseFiscalEvent(body,timestamp,signature,await secret());const {data,error}=await getSupabaseAdminClient().rpc('fiscal_provider_event',{p_event:event});if(error)throw error;return data;}
export async function deliverMockEvent(event:FiscalEvent){const body=JSON.stringify(event),timestamp=String(Math.floor(Date.now()/1000));return consumeFiscalEvent(body,timestamp,signFiscalEvent(body,timestamp,await secret()));}
