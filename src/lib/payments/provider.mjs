import {createHmac,timingSafeEqual} from 'node:crypto';

/** QA protocol only. A live provider must implement this contract with its own verified API. */
export function signQaWebhook(body,timestamp,secret){return createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}
export function parseQaWebhook(body,timestamp,signature,secret,now=Date.now()){
 if(typeof body!=='string'||Buffer.byteLength(body)>8192||!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||!/^[a-f0-9]{64}$/.test(signature||'')||typeof secret!=='string'||secret.length<32)throw new Error('Invalid webhook');
 const expected=signQaWebhook(body,timestamp,secret);if(!timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex')))throw new Error('Invalid webhook');
 const p=JSON.parse(body),keys=['event_id','external_id','payment_id','state','amount','currency'];
 if(!p||Array.isArray(p)||Object.keys(p).some(k=>!keys.includes(k))||keys.some(k=>p[k]===undefined)||!['processing','paid','failed'].includes(p.state)||p.currency!=='BRL'||![p.event_id,p.external_id,p.payment_id].every(v=>typeof v==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(v))||!/^\d{1,12}(\.\d{1,2})?$/.test(String(p.amount))||Number(p.amount)<=0)throw new Error('Invalid webhook');
 return p;
}
export const qaAdapter={
 id:'qa',mode:'sandbox',
 createPaymentLink:async input=>({externalId:input.externalId,mode:'sandbox'}),
 getPaymentStatus:async persisted=>persisted,
 cancelPaymentLink:async()=>({cancelled:true,mode:'sandbox'}),
 parseWebhook:parseQaWebhook,
};
export function paymentAdapter(provider){if(provider!=='qa')throw new Error('Provider unavailable');return qaAdapter;}
