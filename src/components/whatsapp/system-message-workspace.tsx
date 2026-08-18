import type { RefObject } from 'react';
import { Clipboard, Loader2, RotateCcw, Save, Search, Send, Variable } from 'lucide-react';
import type { WhatsAppSystemMessage } from '@/lib/whatsapp/types';

export interface WhatsAppContextOption {
  id: string;
  label: string;
  searchable: string;
}

export type WhatsAppContextResolutionStatus = 'idle' | 'loading' | 'resolved' | 'error';

interface SystemMessageListProps {
  messages: readonly WhatsAppSystemMessage[];
  selectedEventKey: string;
  search: string;
  category: string;
  categories: readonly string[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onSelect: (eventKey: string) => void;
}

interface SystemMessageContextSelectorProps {
  sampleOnly: boolean;
  label: string;
  help: string;
  options: readonly WhatsAppContextOption[];
  selectedId: string;
  search: string;
  status: WhatsAppContextResolutionStatus;
  statusMessage?: string;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
}

export function SystemMessageContextSelector({
  sampleOnly,
  label,
  help,
  options,
  selectedId,
  search,
  status,
  statusMessage,
  onSearchChange,
  onSelect
}: SystemMessageContextSelectorProps) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="whatsapp-context-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="whatsapp-context-title" className="text-xs font-black text-foreground">Contexto da mensagem</h2>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{help}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : status === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>
          {status === 'resolved' && selectedId ? 'Dados reais' : status === 'loading' ? 'Resolvendo' : status === 'error' ? 'Falha no contexto' : 'Sem contexto'}
        </span>
      </div>
      {sampleOnly ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-4 text-amber-800">
          Esta mensagem depende do produto configurado na Loja. Os valores da empresa são resolvidos no servidor; os demais campos indicam que nenhum contexto foi selecionado. O teste deve ser iniciado pelo fluxo real da Loja.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <label className="text-[11px] font-bold text-foreground">
            Buscar {label.toLocaleLowerCase('pt-BR')}
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder={`Filtrar ${label.toLocaleLowerCase('pt-BR')}`} className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" />
            </div>
          </label>
          <label className="text-[11px] font-bold text-foreground">
            {label}
            <select value={selectedId} onChange={(event) => onSelect(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary">
              <option value="">Selecione explicitamente</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>
      )}
      {!sampleOnly && options.length === 0 && <p className="mt-2 text-[10px] text-amber-700">Nenhum registro do contexto já carregado corresponde à busca.</p>}
      {status === 'loading' && <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Validando o contexto no servidor...</p>}
      {statusMessage && status !== 'loading' && <p role={status === 'error' ? 'alert' : 'status'} className={`mt-2 text-[11px] ${status === 'error' ? 'font-medium text-rose-600' : 'text-muted-foreground'}`}>{statusMessage}</p>}
    </section>
  );
}

export function SystemMessageList({
  messages,
  selectedEventKey,
  search,
  category,
  categories,
  onSearchChange,
  onCategoryChange,
  onSelect
}: SystemMessageListProps) {
  return (
    <aside className="rounded-2xl border border-border bg-card p-3">
      <h2 className="mb-3 text-xs font-black text-foreground">Mensagens do Sistema</h2>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar mensagem" className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary" />
      </div>
      <select value={category} onChange={(event) => onCategoryChange(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary">
        {categories.map((item) => <option key={item}>{item}</option>)}
      </select>
      <div className="mt-3 space-y-2">
        {messages.map((message) => (
          <button key={message.definition.eventKey} type="button" onClick={() => onSelect(message.definition.eventKey)} className={`w-full rounded-xl border p-3 text-left transition ${selectedEventKey === message.definition.eventKey ? 'border-primary bg-primary/5' : 'border-border hover:bg-secondary/60'}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-bold text-foreground">{message.definition.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${message.customized ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{message.customized ? 'Ajuste da empresa' : 'Padrão do sistema'}</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{message.definition.category}</p>
          </button>
        ))}
      </div>
    </aside>
  );
}

interface MessageEditorProps {
  message: WhatsAppSystemMessage;
  content: string;
  active: boolean;
  validation: { valid: boolean; errors: string[] };
  maxLength: number;
  saving: boolean;
  dirty: boolean;
  resolvedVariables?: Readonly<Record<string, string>>;
  resolutionStatus?: WhatsAppContextResolutionStatus;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onContentChange: (value: string) => void;
  onActiveChange: (active: boolean) => void;
  onInsertVariable: (variable: string) => void;
  onRestore: () => void;
  onSave: () => void;
}

export function MessageEditor({
  message,
  content,
  active,
  validation,
  maxLength,
  saving,
  dirty,
  resolvedVariables,
  resolutionStatus = 'idle',
  textareaRef,
  onContentChange,
  onActiveChange,
  onInsertVariable,
  onRestore,
  onSave
}: MessageEditorProps) {
  const { definition } = message;
  return (
    <section className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-foreground">{definition.name}</h2>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{definition.description}</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold">
          <input type="checkbox" checked={active} onChange={(event) => onActiveChange(event.target.checked)} className="h-4 w-4" />Ativo
        </label>
      </div>
      <textarea ref={textareaRef} value={content} onChange={(event) => onContentChange(event.target.value)} maxLength={maxLength + 100} className={`mt-4 min-h-[300px] w-full resize-y rounded-xl border bg-background p-3 font-mono text-xs leading-5 outline-none ${validation.valid ? 'border-border focus:border-primary' : 'border-rose-400'}`} aria-label="Conteúdo da mensagem" />
      <div className="mt-2 flex justify-between text-[10px]">
        <span className={validation.valid ? 'text-muted-foreground' : 'text-rose-600'}>{validation.errors[0] || 'Mensagem válida.'}</span>
        <span className={content.length > maxLength ? 'font-bold text-rose-600' : 'text-muted-foreground'}>{content.length}/{maxLength}</span>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-foreground"><Variable className="h-4 w-4" />Variáveis disponíveis</div>
        <div className="grid gap-2 sm:grid-cols-2" data-testid="whatsapp-system-variable-values">
          {definition.allowedVariables.map((variable) => (
            <button key={variable} type="button" onClick={() => onInsertVariable(variable)} className="min-h-11 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-left transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <span className="block font-mono text-[10px] font-bold text-primary">{`{{${variable}}}`}</span>
              <span className="mt-1 block break-words text-[10px] leading-4 text-muted-foreground">
                {resolutionStatus === 'loading'
                  ? 'Resolvendo no servidor...'
                  : resolutionStatus === 'error'
                    ? 'Valor indisponível'
                    : resolvedVariables?.[variable] || 'Sem contexto selecionado'}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onRestore} disabled={saving || !message.override} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-40"><RotateCcw className="h-4 w-4" />Restaurar padrão</button>
        <button type="button" onClick={onSave} disabled={saving || !validation.valid || !dirty} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"><Save className="h-4 w-4" />{saving ? 'Salvando...' : 'Salvar modelo'}</button>
      </div>
    </section>
  );
}

interface MessagePreviewProps {
  preview: string;
  onCopy: () => void;
  onTest: () => void;
  mode?: 'sample' | 'real' | 'loading' | 'error';
  contextSummary?: string;
  help?: string;
  testDisabled?: boolean;
  testDisabledReason?: string;
}

export function MessagePreview({
  preview,
  onCopy,
  onTest,
  mode = 'sample',
  contextSummary,
  help,
  testDisabled = false,
  testDisabledReason
}: MessagePreviewProps) {
  return (
    <aside className="min-w-0 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-black text-foreground">Pré-visualização</h2>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${mode === 'real' ? 'bg-emerald-100 text-emerald-700' : mode === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>{mode === 'real' ? 'Dados reais' : mode === 'loading' ? 'Carregando' : mode === 'error' ? 'Erro' : 'Sem contexto'}</span>
        </div>
        <button type="button" aria-label="Copiar pré-visualização" onClick={onCopy} disabled={mode === 'loading' || mode === 'error'} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-[10px] font-bold transition hover:bg-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Clipboard className="h-3.5 w-3.5" />Copiar</button>
      </div>
      {contextSummary && <p className="mt-2 text-[10px] font-medium leading-4 text-muted-foreground">{contextSummary}</p>}
      {help && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{help}</p>}
      <div className="mt-3 rounded-2xl bg-[#efeae2] p-3"><div className="ml-auto max-w-[95%] whitespace-pre-wrap break-words rounded-xl rounded-tr-sm bg-[#d9fdd3] p-3 text-[11px] leading-5 text-slate-800 shadow-sm">{preview}</div></div>
      <button type="button" onClick={onTest} disabled={testDisabled} className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" />Testar mensagem</button>
      {testDisabled && testDisabledReason && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{testDisabledReason}</p>}
    </aside>
  );
}
