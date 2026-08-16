import type { RefObject } from 'react';
import { Plus, Save, Search, Trash2, Variable } from 'lucide-react';
import {
  WHATSAPP_CUSTOM_MESSAGE_NAME_MAX_LENGTH,
  type WhatsAppCustomMessage,
  type WhatsAppCustomMessageContext
} from '@/lib/whatsapp';

interface CustomMessageListProps {
  messages: readonly WhatsAppCustomMessage[];
  selectedId: string | null;
  search: string;
  canMutate: boolean;
  onSearchChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function CustomMessageList({
  messages,
  selectedId,
  search,
  canMutate,
  onSearchChange,
  onSelect,
  onCreate
}: CustomMessageListProps) {
  return (
    <aside className="min-w-0 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-black text-foreground">Mensagens Personalizadas</h2>
        <button
          type="button"
          onClick={onCreate}
          disabled={!canMutate}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-primary px-3 text-[10px] font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />Nova
        </button>
      </div>
      <div className="relative mt-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar mensagem"
          aria-label="Buscar mensagem personalizada"
          className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary"
        />
      </div>
      <div className="mt-3 space-y-2">
        {messages.map((message) => (
          <button
            key={message.id}
            type="button"
            onClick={() => onSelect(message.id)}
            className={`min-h-11 w-full rounded-xl border p-3 text-left transition ${selectedId === message.id ? 'border-violet-500 bg-violet-500/5' : 'border-border hover:bg-secondary/60'}`}
          >
            <div className="flex min-w-0 items-start justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-bold text-foreground">{message.name}</span>
              <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[9px] font-bold text-violet-700">Personalizada</span>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{message.contextType === 'customer' ? 'Com cliente' : 'Genérica'}</p>
          </button>
        ))}
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-3 py-6 text-center">
            <p className="text-xs font-bold text-foreground">Nenhuma mensagem encontrada</p>
            <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
              {search ? 'Tente outro termo de busca.' : 'Crie um texto reutilizável para os seus atendimentos.'}
            </p>
            {!search && (
              <button
                type="button"
                onClick={onCreate}
                disabled={!canMutate}
                className="mt-3 inline-flex min-h-11 items-center gap-1 rounded-xl border border-primary/30 px-3 text-[10px] font-bold text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />Criar mensagem personalizada
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

interface CustomMessageEditorProps {
  visible: boolean;
  isNew: boolean;
  name: string;
  content: string;
  contextType: WhatsAppCustomMessageContext;
  allowedVariables: readonly string[];
  errors: readonly string[];
  maxLength: number;
  saving: boolean;
  dirty: boolean;
  canMutate: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onNameChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onContextChange: (value: WhatsAppCustomMessageContext) => void;
  onInsertVariable: (variable: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function CustomMessageEditor({
  visible,
  isNew,
  name,
  content,
  contextType,
  allowedVariables,
  errors,
  maxLength,
  saving,
  dirty,
  canMutate,
  textareaRef,
  onNameChange,
  onContentChange,
  onContextChange,
  onInsertVariable,
  onSave,
  onDelete
}: CustomMessageEditorProps) {
  if (!visible) {
    return (
      <section className="flex min-h-[360px] min-w-0 items-center justify-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
        <div>
          <h2 className="text-sm font-black text-foreground">Selecione ou crie uma mensagem</h2>
          <p className="mt-2 max-w-sm text-xs leading-5 text-muted-foreground">As mensagens personalizadas ficam separadas dos quatro eventos oficiais do sistema.</p>
        </div>
      </section>
    );
  }

  const valid = errors.length === 0;
  return (
    <section className="min-w-0 rounded-2xl border border-violet-200 bg-card p-4 dark:border-violet-900/70">
      {!canMutate && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-4 text-amber-800">
          Modo somente leitura. Seu perfil pode consultar, mas não alterar mensagens personalizadas.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="rounded-full bg-violet-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-violet-700">Mensagem personalizada</span>
          <h2 className="mt-2 text-sm font-black text-foreground">{isNew ? 'Nova mensagem' : 'Editar mensagem'}</h2>
        </div>
        <label className="text-xs font-bold text-foreground">
          Contexto
          <select
            value={contextType}
            onChange={(event) => onContextChange(event.target.value as WhatsAppCustomMessageContext)}
            disabled={!canMutate}
            className="ml-2 h-11 rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            <option value="generic">Genérica</option>
            <option value="customer">Com cliente</option>
          </select>
        </label>
      </div>
      <label className="mt-4 block text-xs font-bold text-foreground">
        Nome
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={!canMutate}
          maxLength={WHATSAPP_CUSTOM_MESSAGE_NAME_MAX_LENGTH + 20}
          placeholder="Ex.: Boas-vindas"
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(event) => onContentChange(event.target.value)}
        disabled={!canMutate}
        maxLength={maxLength + 100}
        aria-label="Conteúdo da mensagem personalizada"
        placeholder="Digite a mensagem..."
        className={`mt-4 min-h-[260px] w-full resize-y rounded-xl border bg-background p-3 font-mono text-xs leading-5 outline-none disabled:cursor-not-allowed disabled:opacity-60 ${valid ? 'border-border focus:border-primary' : 'border-rose-400'}`}
      />
      <div className="mt-2 flex min-w-0 justify-between gap-3 text-[10px]">
        <span className={`min-w-0 break-words ${valid ? 'text-muted-foreground' : 'text-rose-600'}`}>{errors[0] || 'Mensagem válida.'}</span>
        <span className={`shrink-0 ${content.length > maxLength ? 'font-bold text-rose-600' : 'text-muted-foreground'}`}>{content.length}/{maxLength}</span>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold text-foreground"><Variable className="h-4 w-4" />Variáveis disponíveis</div>
        <div className="flex flex-wrap gap-2">
          {allowedVariables.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => onInsertVariable(variable)}
              disabled={!canMutate}
              className="min-h-11 rounded-lg border border-violet-200 bg-violet-50 px-2.5 font-mono text-[10px] text-violet-700 transition hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {!isNew && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving || !canMutate}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-200 px-3 text-xs font-bold text-rose-700 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />Excluir
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canMutate || !valid || !dirty}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground disabled:opacity-40"
        >
          <Save className="h-4 w-4" />{saving ? 'Salvando...' : isNew ? 'Criar mensagem' : 'Salvar alterações'}
        </button>
      </div>
    </section>
  );
}
