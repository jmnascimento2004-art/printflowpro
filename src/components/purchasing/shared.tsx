'use client';
import {useId,type ReactNode} from 'react';
import {X} from 'lucide-react';
import {useDialogFocus} from '@/components/use-dialog-focus';
export const purchaseField='w-full min-w-0 rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60';
export function Field({label,children}:{label:string;children:ReactNode}){return <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">{label}{children}</label>;}
export function PurchaseModal({title,children,busy,onClose,wide=false}:{title:string;children:ReactNode;busy:boolean;onClose:()=>void;wide?:boolean}){
 const id=`purchase-${useId().replace(/:/g,'')}`;useDialogFocus(`#${id}`,true,busy,onClose);
 return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section id={id} role="dialog" aria-modal="true" aria-label={title} className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl ${wide?'max-w-5xl':'max-w-2xl'}`}><header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-4"><h2 className="text-lg font-bold">{title}</h2><button type="button" aria-label="Fechar" className="pf-button-secondary !min-h-10 !p-2" disabled={busy} onClick={onClose}><X size={20}/></button></header><div className="overflow-y-auto p-5">{children}</div></section></div>;
}
export function Empty({children='Nenhum registro encontrado.'}:{children?:ReactNode}){return <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;}
export function FormFooter({busy,onClose}:{busy:boolean;onClose:()=>void}){return <footer className="mt-5 flex flex-wrap justify-end gap-2 border-t border-border pt-4"><button className="pf-button-secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="pf-button-primary" disabled={busy} type="submit">{busy?'Salvando…':'Salvar'}</button></footer>;}
export type PurchaseCommand=(action:string,payload:Record<string,unknown>)=>Promise<{id?:string;supplier?:{id:string};receipt_id?:string}>;
