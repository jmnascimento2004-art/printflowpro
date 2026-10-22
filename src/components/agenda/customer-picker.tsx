'use client';
import { useEffect, useId, useRef, useState } from 'react';

type Customer = { id: string; name: string };
export function CustomerPicker({ value, onChange, query, onQuery, options, loading, inputClass }: {
  value: string; onChange: (id: string) => void; query: string; onQuery: (query: string) => void;
  options: Customer[]; loading: boolean; inputClass: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [chosen, setChosen] = useState<Customer>();
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open && !loading) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, loading]);
  const selected = options.find(option => option.id === value) || (chosen?.id === value ? chosen : undefined);
  function choose(option: Customer) {
    setChosen(option); onChange(option.id); setOpen(false); setActive(-1);
  }
  return <div className="relative min-w-0 space-y-1" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setActive(-1); }
  }}>
    <label htmlFor={id} className="text-xs font-semibold text-muted-foreground">Cliente (opcional)</label>
    <input type="hidden" name="customer" value={value} />
    <div className="relative">
      <input id={id} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`}
        aria-activedescendant={open && !loading && options[active] ? `${id}-${active}` : undefined}
        autoComplete="off" placeholder="Buscar cliente por nome…" className={`${inputClass} ${value ? 'pf-combobox-clearable' : ''}`}
        value={open ? query : value ? selected?.name || 'Cliente vinculado' : ''}
        onFocus={() => { if (selected) setChosen(selected); setOpen(true); }}
        onChange={e => { onQuery(e.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); setOpen(true);
            setActive(index => Math.max(0, Math.min(options.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1))));
          } else if (e.key === 'Enter' && open) {
            e.preventDefault(); if (!loading && options[active]) choose(options[active]);
          } else if (e.key === 'Escape' && open) {
            e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1);
          }
        }} />
      {value && <button type="button" aria-label="Remover cliente" className="pf-combobox-clear rounded-md text-muted-foreground hover:bg-secondary"
        onClick={() => { onChange(''); onQuery(''); setChosen(undefined); setOpen(false); }}>×</button>}
    </div>
    {open && <div ref={list} id={`${id}-list`} role="listbox" aria-label="Clientes" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
      {loading ? <p className="p-2 text-xs text-muted-foreground">Buscando clientes…</p> : options.length === 0 ? <p className="p-2 text-xs text-muted-foreground">Nenhum cliente encontrado.</p> : options.map((option, index) =>
        <button key={option.id} id={`${id}-${index}`} data-index={index} type="button" role="option" aria-selected={value === option.id} tabIndex={-1}
          className={`block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-secondary ${index === active ? 'bg-secondary' : ''}`}
          onMouseDown={e => e.preventDefault()} onClick={() => choose(option)}>{option.name}</button>)}
    </div>}
    {open && value && <p className="text-xs text-muted-foreground">Vinculado: {selected?.name || 'Cliente vinculado'}</p>}
  </div>;
}
