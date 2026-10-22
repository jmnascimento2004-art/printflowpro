'use client';

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { createActionDialogController } from '@/lib/action-dialog.mjs';

export type ActionDialogOptions = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  variant?: 'default' | 'warning' | 'danger';
  summary?: Array<[string, string]>;
  errorMessage?: string;
  input?: { label: string; initialValue?: string; required?: boolean; type?: 'text' | 'url'; multiline?: boolean };
};
type RequestAction = (options: ActionDialogOptions, action: (value: string) => unknown | Promise<unknown>) => Promise<boolean>;
type DialogState = ActionDialogOptions & { busy: boolean; error: string };
const ActionDialogContext = createContext<RequestAction | null>(null);

export function useActionDialog() {
  const request = useContext(ActionDialogContext);
  if (!request) throw new Error('ActionDialogProvider ausente');
  return request;
}

function ActionDialog({ state, onCancel, onConfirm }: { state: DialogState; onCancel: () => void; onConfirm: (value: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState(state.input?.initialValue || '');
  const id = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-initial-focus]')?.focus();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  const danger = state.variant === 'danger';
  return createPortal(<dialog ref={ref} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); if (!state.busy) onCancel(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]'));
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-0 text-foreground shadow-2xl backdrop:bg-slate-950/65 backdrop:backdrop-blur-sm">
    <form onSubmit={event => { event.preventDefault(); if (!state.busy) onConfirm(value); }}>
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className={`rounded-xl p-2 ${danger ? 'bg-rose-500/10 text-rose-600' : state.variant === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}><AlertTriangle className="h-5 w-5" aria-hidden="true" /></span>
        <h2 id={`${id}-title`} className="min-w-0 flex-1 text-sm font-bold">{state.title}</h2>
        <button type="button" disabled={state.busy} onClick={onCancel} aria-label="Fechar confirmação" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl hover:bg-secondary disabled:opacity-50"><X className="h-4 w-4" /></button>
      </header>
      <div className="space-y-4 px-5 py-5">
        <p id={`${id}-description`} className="text-sm leading-6 text-muted-foreground">{state.description}</p>
        {state.summary && <dl className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4 text-sm">{state.summary.map(([label, text]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-semibold">{text}</dd></div>)}</dl>}
        {state.input && <label className="block space-y-2 text-sm font-semibold">{state.input.label}{state.input.multiline ? <textarea data-initial-focus disabled={state.busy} required={state.input.required} value={value} onChange={event => setValue(event.target.value)} className="min-h-28 w-full rounded-xl border border-border bg-background p-3" /> : <input data-initial-focus disabled={state.busy} required={state.input.required} type={state.input.type || 'text'} value={value} onChange={event => setValue(event.target.value)} className="h-11 w-full rounded-xl border border-border bg-background px-3" />}</label>}
        {state.error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-600">{state.error}</p>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-4">
        <button data-initial-focus={state.input ? undefined : true} type="button" disabled={state.busy} onClick={onCancel} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold hover:bg-secondary disabled:opacity-50">{state.cancelLabel || 'Cancelar'}</button>
        <button type="submit" disabled={state.busy} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white disabled:opacity-50 ${danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-primary hover:bg-primary/90'}`}>{state.busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{state.busy ? 'Aguarde…' : state.confirmLabel}</button>
      </footer>
    </form>
  </dialog>, document.body);
}

export function ActionDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const [controller] = useState(() => createActionDialogController(setState));
  useEffect(() => () => controller.dispose(), [controller]);
  return <ActionDialogContext.Provider value={controller.request}>{children}{state && <ActionDialog state={state} onCancel={controller.cancel} onConfirm={controller.confirm} />}</ActionDialogContext.Provider>;
}
