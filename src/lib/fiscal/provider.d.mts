export type FiscalEvent={event_id:string;external_id:string;sequence:number;state:string};
export type AdapterDocument={id:string;external_id:string;provider_sequence:number;snapshot:Record<string,unknown>};
export const REAL_EMISSION_ENABLED:false;
export function assertFiscalSandbox(input?:Record<string,unknown>):void;
export function signFiscalEvent(body:string,timestamp:string,secret:string):string;
export function parseFiscalEvent(body:string,timestamp:string,signature:string,secret:string,now?:number):FiscalEvent;
export const mockFiscalAdapter:{id:string;environment:string;supports:{xml:false;pdf:false;correction:false;substitution:false};validatePayload(snapshot:Record<string,unknown>):void;issueDocument(document:AdapterDocument):Promise<FiscalEvent>;getDocumentStatus(document:AdapterDocument,outcome?:string):Promise<FiscalEvent>;cancelDocument(document:AdapterDocument,outcome?:string):Promise<FiscalEvent>;downloadXml():Promise<never>;downloadPdf():Promise<never>;parseWebhook:typeof parseFiscalEvent};
