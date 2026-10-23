export type QaEvent={event_id:string;external_id:string;payment_id:string;state:'processing'|'paid'|'failed';amount:string|number;currency:'BRL'};
export function signQaWebhook(body:string,timestamp:string,secret:string):string;
export function parseQaWebhook(body:string,timestamp:string,signature:string,secret:string,now?:number):QaEvent;
export interface PaymentAdapter {id:string;mode:string;createPaymentLink(input:{externalId:string}):Promise<{externalId:string;mode:string}>;getPaymentStatus<T>(persisted:T):Promise<T>;cancelPaymentLink():Promise<{cancelled:boolean;mode:string}>;parseWebhook:typeof parseQaWebhook;}
export const qaAdapter:PaymentAdapter;
export function paymentAdapter(provider:string):PaymentAdapter;
