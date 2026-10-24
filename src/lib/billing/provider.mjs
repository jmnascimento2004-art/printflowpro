import {createHmac,timingSafeEqual} from 'node:crypto';

export const REAL_BILLING_ENABLED=false;
export const BILLING_ACTIONS=['start_trial','activate','change_plan','renew','payment_failed','grace','cancel','reactivate','expire'];
export function assertBillingQa(input={}){
 if(input.provider!==undefined&&input.provider!=='mock'||input.environment!==undefined&&input.environment!=='qa'||input.real_billing_enabled!==undefined&&input.real_billing_enabled!==false)
  throw new Error('SAAS_REAL_BILLING_REQUIRES_EXPLICIT_AUTHORIZATION');
}
export function signBillingEvent(body,timestamp,secret){return createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}
export function parseBillingEvent(body,timestamp,signature,secret,now=Date.now()){
 if(typeof body!=='string'||Buffer.byteLength(body)>2048||!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||!/^[a-f0-9]{64}$/.test(signature||'')||typeof secret!=='string'||secret.length<32)throw new Error('Invalid billing event');
 if(!timingSafeEqual(Buffer.from(signBillingEvent(body,timestamp,secret),'hex'),Buffer.from(signature,'hex')))throw new Error('Invalid billing event');
 const v=JSON.parse(body),keys=['event_id','command_id','sequence','state'];
 if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>v[k]===undefined)||!Number.isSafeInteger(v.sequence)||v.sequence<1||v.sequence>1000000||v.state!=='confirmed_qa'||typeof v.command_id!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v.command_id)||v.event_id!==`mock-billing:${v.command_id}`)throw new Error('Invalid billing event');
 return v;
}
// Provider interface: no network, card, payment or operational ledger integration.
export const mockBillingAdapter={
 id:'mock',environment:'qa',
 async createCustomer(input){assertBillingQa(input);return {id:'mock-qa',qa:true};},
 async createSubscription(command){return this.getSubscription(command);},
 async changePlan(command){return this.getSubscription(command);},
 async cancelSubscription(command){return this.getSubscription(command);},
 async getSubscription(command){if(!command?.command_id||!Number.isSafeInteger(command.revision))throw new Error('Invalid billing command');return {command_id:command.command_id,event_id:`mock-billing:${command.command_id}`,sequence:command.revision,state:'confirmed_qa'};},
 parseWebhook:parseBillingEvent,
};
