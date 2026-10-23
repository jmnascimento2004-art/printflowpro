'use client';
import type { FormEvent } from 'react';
import { catalogDateTimeInput,catalogDateTimeIso } from '@/lib/catalog-growth';
/** Native datetime controls emit input while editing; do not rely only on change/blur. */
export function CatalogDateTimeField({label,value,onChange,className}:{label:string;value:string;onChange:(value:string)=>void;className:string}) {
 const update=(event:FormEvent<HTMLInputElement>)=>{
  const input=event.currentTarget;
  if(input.validity.badInput)return;
  try{onChange(catalogDateTimeIso(input.value));}catch{/* Keep native incomplete segments editable. */}
 };
 return <label className="block min-w-0 space-y-1.5 text-xs font-semibold">{label}<input className={className} type="datetime-local" value={catalogDateTimeInput(value)} onInput={update} onChange={update}/></label>;
}
