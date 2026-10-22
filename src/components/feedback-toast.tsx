'use client';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type FeedbackKind = 'success' | 'error' | 'warning' | 'info';
const appearance = {
  success: { title: 'Sucesso', color: '16,185,129', Icon: CheckCircle2 },
  error: { title: 'Erro', color: '239,68,68', Icon: XCircle },
  warning: { title: 'Atenção', color: '245,158,11', Icon: AlertTriangle },
  info: { title: 'Informação', color: '96,165,250', Icon: Info }
};

// Keep the existing toast presentation in the Tailwind-scanned component tree.
export function FeedbackToast({ message, type, onClose }: { message: string; type: FeedbackKind; onClose: () => void }) {
  const { title, color, Icon } = appearance[type];
  return <>
    <style>{`@keyframes toast-slide-in { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } .animate-toast-in { animation: toast-slide-in .35s ease-out both; }`}</style>
    <div role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'}
      className="fixed bottom-20 right-4 z-[99999] flex w-[420px] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-xl border bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-md animate-toast-in sm:bottom-5 sm:right-5"
      style={{ borderColor: `rgba(${color},.3)` }}>
      <span aria-hidden="true" className="shrink-0 rounded-lg p-2" style={{ backgroundColor: `rgba(${color},.1)`, color: `rgb(${color})` }}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{title}</p><p className="mt-1 break-words text-xs leading-5 text-slate-300">{message}</p></div>
      <button type="button" aria-label="Fechar aviso" onClick={onClose} className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><X className="h-4 w-4" /></button>
    </div>
  </>;
}
