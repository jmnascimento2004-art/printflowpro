'use client';
import {useEffect,useRef} from 'react';
/** Matches the focus/scroll contract of the existing financial dialogs. */
export function useDialogFocus(selector:string,open:boolean,busy:boolean,onClose:()=>void){
 const state=useRef({busy,onClose});state.current={busy,onClose};
 useEffect(()=>{if(!open)return;const dialog=document.querySelector<HTMLElement>(selector);if(!dialog)return;
 const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
 const controls=()=>Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(e=>e.getClientRects().length);
 controls()[0]?.focus();
 const keydown=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!state.current.busy){event.preventDefault();state.current.onClose();}if(event.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!first){event.preventDefault();return;}if(!dialog.contains(document.activeElement)){event.preventDefault();first.focus();}else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}};
 document.addEventListener('keydown',keydown);return()=>{document.removeEventListener('keydown',keydown);document.body.style.overflow=overflow;previous?.focus();};
 },[selector,open]);
}
