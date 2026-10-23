import {createHmac,timingSafeEqual} from 'node:crypto';

export const REAL_EMISSION_ENABLED=false;
export function assertFiscalSandbox(input={}) {
 if(input.environment&&input.environment!=='homologacao'||input.provider&&input.provider!=='mock'||input.real_emission_enabled===true)
  throw new Error('FISCAL_REAL_EMISSION_REQUIRES_EXPLICIT_AUTHORIZATION');
}
export function signFiscalEvent(body,timestamp,secret){return createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex');}
export function parseFiscalEvent(body,timestamp,signature,secret,now=Date.now()){
 if(typeof body!=='string'||Buffer.byteLength(body)>4096||!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||!/^[a-f0-9]{64}$/.test(signature||'')||typeof secret!=='string'||secret.length<32)throw new Error('Invalid fiscal event');
 if(!timingSafeEqual(Buffer.from(signFiscalEvent(body,timestamp,secret),'hex'),Buffer.from(signature,'hex')))throw new Error('Invalid fiscal event');
 const v=JSON.parse(body),keys=['event_id','external_id','sequence','state'];
 if(!v||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>v[k]===undefined)||!['processing','authorized_qa','rejected','cancelled_qa','cancel_rejected'].includes(v.state)||!Number.isSafeInteger(v.sequence)||v.sequence<1||v.sequence>1000000||![v.event_id,v.external_id].every(s=>typeof s==='string'&&/^[a-zA-Z0-9:_-]{1,128}$/.test(s)))throw new Error('Invalid fiscal event');
 return v;
}
// Deliberately no network client, certificate handling or official artifact generation.
export const mockFiscalAdapter={
 id:'mock',environment:'homologacao',supports:{xml:false,pdf:false,correction:false,substitution:false},
 validatePayload(snapshot){assertFiscalSandbox(snapshot);if(snapshot.mock!==true||snapshot.document_type!=='nfse')throw new Error('Invalid fiscal snapshot');},
 async issueDocument(document){this.validatePayload(document.snapshot);return {external_id:document.external_id,state:'processing',sequence:1,event_id:`${document.id}:processing`};},
 async getDocumentStatus(document,outcome='authorized_qa'){if(!['authorized_qa','rejected'].includes(outcome))throw new Error('Invalid mock outcome');return {external_id:document.external_id,state:outcome,sequence:2,event_id:`${document.id}:result`};},
 async cancelDocument(document,outcome='cancelled_qa'){if(!['cancelled_qa','cancel_rejected'].includes(outcome))throw new Error('Invalid mock outcome');return {external_id:document.external_id,state:outcome,sequence:document.provider_sequence+1,event_id:`${document.id}:cancel:${document.provider_sequence+1}`};},
 async downloadXml(){throw new Error('Mock não possui XML fiscal autorizado.');},
 async downloadPdf(){throw new Error('Mock não possui DANFSe oficial.');},
 parseWebhook:parseFiscalEvent,
};
