export type BillingEvent={command_id:string;event_id:string;sequence:number;state:string};
export type BillingCommand={command_id:string;revision:number};
export const REAL_BILLING_ENABLED:false;
export const BILLING_ACTIONS:string[];
export function assertBillingQa(input?:Record<string,unknown>):void;
export function signBillingEvent(body:string,timestamp:string,secret:string):string;
export function parseBillingEvent(body:string,timestamp:string,signature:string,secret:string,now?:number):BillingEvent;
export const mockBillingAdapter:{id:string;environment:string;createCustomer(input:Record<string,unknown>):Promise<{id:string;qa:boolean}>;createSubscription(command:BillingCommand):Promise<BillingEvent>;changePlan(command:BillingCommand):Promise<BillingEvent>;cancelSubscription(command:BillingCommand):Promise<BillingEvent>;getSubscription(command:BillingCommand):Promise<BillingEvent>;parseWebhook:typeof parseBillingEvent};
