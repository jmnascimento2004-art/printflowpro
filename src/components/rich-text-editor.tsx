'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Eraser,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Italic,
  Link,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  Unlink
} from 'lucide-react';
import {
  captureEditorRange,
  normalizeRichTextUrl,
  rangeHasSelectedText,
  restoreEditorRange
} from '@/lib/rich-text-editor-core.mjs';
import { normalizeRichTextHtml, sanitizeRichTextHtml, stripRichTextHtml } from '@/lib/utils';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  minHeightClass?: string;
};

type ToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeThrough: boolean;
  formatBlock: string;
  insertUnorderedList: boolean;
  insertOrderedList: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  justifyFull: boolean;
  createLink: boolean;
  foreColor: string;
  backColor: string;
};

const emptyToolbarState: ToolbarState = {
  bold: false,
  italic: false,
  underline: false,
  strikeThrough: false,
  formatBlock: 'p',
  insertUnorderedList: false,
  insertOrderedList: false,
  justifyLeft: true,
  justifyCenter: false,
  justifyRight: false,
  justifyFull: false,
  createLink: false,
  foreColor: '#111827',
  backColor: '#fef3c7'
};

const toolbarGroups = [
  [
    { label: 'Desfazer', icon: Undo2, command: 'undo' },
    { label: 'Refazer', icon: Redo2, command: 'redo' }
  ],
  [
    { label: 'Negrito', icon: Bold, command: 'bold', toggle: true },
    { label: 'Itálico', icon: Italic, command: 'italic', toggle: true },
    { label: 'Sublinhado', icon: Underline, command: 'underline', toggle: true },
    { label: 'Tachado', icon: Strikethrough, command: 'strikeThrough', toggle: true }
  ],
  [
    { label: 'Texto normal', icon: Type, command: 'formatBlock', value: 'p', toggle: true },
    { label: 'Título 1', icon: Heading1, command: 'formatBlock', value: 'h1', toggle: true },
    { label: 'Título 2', icon: Heading2, command: 'formatBlock', value: 'h2', toggle: true },
    { label: 'Citação', icon: Quote, command: 'formatBlock', value: 'blockquote', toggle: true }
  ],
  [
    { label: 'Lista com marcadores', icon: List, command: 'insertUnorderedList', toggle: true },
    { label: 'Lista numerada', icon: ListOrdered, command: 'insertOrderedList', toggle: true }
  ],
  [
    { label: 'Alinhar à esquerda', icon: AlignLeft, command: 'justifyLeft', toggle: true },
    { label: 'Centralizar', icon: AlignCenter, command: 'justifyCenter', toggle: true },
    { label: 'Alinhar à direita', icon: AlignRight, command: 'justifyRight', toggle: true },
    { label: 'Justificar', icon: AlignJustify, command: 'justifyFull', toggle: true }
  ]
] as const;

function safeQueryCommandState(command: string) {
  try {
    return document.queryCommandState(command);
  } catch {
    return false;
  }
}

function safeQueryCommandValue(command: string) {
  try {
    return String(document.queryCommandValue(command) || '');
  } catch {
    return '';
  }
}

function colorPickerValue(value: string, fallback: string) {
  const hex = value.trim().match(/^#([\da-f]{6})$/i);
  if (hex) return `#${hex[1].toLowerCase()}`;
  const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!rgb) return fallback;
  return `#${rgb.slice(1, 4).map((channel) => Math.min(255, Number(channel)).toString(16).padStart(2, '0')).join('')}`;
}

export function RichTextEditor({
  value,
  onChange,
  id,
  ariaLabel = 'Editor de texto rico',
  placeholder = 'Digite aqui...',
  minHeightClass = 'min-h-[136px]'
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const lastEmittedHtmlRef = useRef('');
  const [toolbarState, setToolbarState] = useState<ToolbarState>(emptyToolbarState);
  const [editorMessage, setEditorMessage] = useState('');
  const normalizedValue = useMemo(() => normalizeRichTextHtml(value), [value]);

  const rememberSelection = useCallback(() => {
    const range = captureEditorRange(editorRef.current, document.getSelection());
    if (range) savedRangeRef.current = range;
    return range;
  }, []);

  const refreshToolbarState = useCallback(() => {
    const editor = editorRef.current;
    const selection = document.getSelection();
    const range = captureEditorRange(editor, selection);
    if (!editor || !range) return;
    savedRangeRef.current = range;
    const anchorElement = selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    const formatBlock = safeQueryCommandValue('formatBlock').toLowerCase().replace(/[<>]/g, '') || 'p';

    setToolbarState({
      bold: safeQueryCommandState('bold'),
      italic: safeQueryCommandState('italic'),
      underline: safeQueryCommandState('underline'),
      strikeThrough: safeQueryCommandState('strikeThrough'),
      formatBlock,
      insertUnorderedList: safeQueryCommandState('insertUnorderedList'),
      insertOrderedList: safeQueryCommandState('insertOrderedList'),
      justifyLeft: safeQueryCommandState('justifyLeft'),
      justifyCenter: safeQueryCommandState('justifyCenter'),
      justifyRight: safeQueryCommandState('justifyRight'),
      justifyFull: safeQueryCommandState('justifyFull'),
      createLink: Boolean(anchorElement?.closest('a')),
      foreColor: safeQueryCommandValue('foreColor') || '#111827',
      backColor: safeQueryCommandValue('backColor') || '#fef3c7'
    });
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || lastEmittedHtmlRef.current === value) return;
    if (editor.innerHTML !== normalizedValue) editor.innerHTML = normalizedValue;
  }, [normalizedValue, value]);

  useEffect(() => {
    const handleSelectionChange = () => refreshToolbarState();
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [refreshToolbarState]);

  const emitEditorValue = useCallback((sanitize = false) => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextValue = sanitize ? sanitizeRichTextHtml(editor.innerHTML) : editor.innerHTML;
    if (sanitize && editor.innerHTML !== nextValue) editor.innerHTML = nextValue;
    lastEmittedHtmlRef.current = nextValue;
    onChange(nextValue);
  }, [onChange]);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return false;
    return restoreEditorRange(editor, document.getSelection(), savedRangeRef.current);
  }, []);

  const runCommand = useCallback((command: string, commandValue?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!restoreSelection()) editor.focus({ preventScroll: true });
    document.execCommand(command, false, commandValue);
    rememberSelection();
    emitEditorValue();
    refreshToolbarState();
    setEditorMessage('');
  }, [emitEditorValue, refreshToolbarState, rememberSelection, restoreSelection]);

  const preserveSelectionOnToolbar = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    rememberSelection();
  };

  const createLink = () => {
    const range = savedRangeRef.current;
    if (!rangeHasSelectedText(range)) {
      setEditorMessage('Selecione o texto que receberá o link.');
      return;
    }
    const requestedUrl = window.prompt('Informe a URL do link');
    if (!requestedUrl) return;
    const safeUrl = normalizeRichTextUrl(requestedUrl, { assumeHttps: true });
    if (!safeUrl) {
      setEditorMessage('Use um link http, https, mailto ou tel válido.');
      return;
    }
    runCommand('createLink', safeUrl);
    editorRef.current?.querySelectorAll('a').forEach((anchor) => {
      const href = normalizeRichTextUrl(anchor.getAttribute('href'));
      if (!href) {
        anchor.replaceWith(...Array.from(anchor.childNodes));
        return;
      }
      anchor.setAttribute('href', href);
      if (/^https?:/i.test(href)) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      } else {
        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      }
    });
    emitEditorValue();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, sanitizeRichTextHtml(html || text));
    rememberSelection();
    emitEditorValue();
    refreshToolbarState();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const shortcutCommands: Record<string, string> = { b: 'bold', i: 'italic', u: 'underline' };
    const command = shortcutCommands[event.key.toLowerCase()];
    if (!command) return;
    event.preventDefault();
    rememberSelection();
    runCommand(command);
  };

  const isToolbarItemActive = (command: string, commandValue?: string) => {
    if (command === 'formatBlock') return toolbarState.formatBlock === commandValue;
    return Boolean(toolbarState[command as keyof ToolbarState]);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-background shadow-sm focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/20">
      <div
        role="toolbar"
        aria-label="Formatação da descrição"
        className="flex flex-wrap items-center gap-1.5 border-b border-primary/15 bg-primary/5 px-2.5 py-2"
      >
        {toolbarGroups.map((group, index) => (
          <div key={index} className="flex items-center gap-1 border-r border-border/70 pr-1.5 last:border-r-0">
            {group.map((item) => {
              const Icon = item.icon;
              const commandValue = 'value' in item ? item.value : undefined;
              const active = 'toggle' in item && item.toggle && isToolbarItemActive(item.command, commandValue);
              return (
                <button
                  key={`${item.command}-${item.label}`}
                  type="button"
                  onMouseDown={preserveSelectionOnToolbar}
                  onClick={() => runCommand(item.command, commandValue)}
                  aria-label={item.label}
                  aria-pressed={'toggle' in item && item.toggle ? active : undefined}
                  title={item.label}
                  className={`flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-primary/20 bg-background hover:border-primary/50 hover:text-primary'}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        ))}

        <button type="button" onMouseDown={preserveSelectionOnToolbar} onClick={createLink} aria-label="Inserir link" aria-pressed={toolbarState.createLink} title="Inserir link" className={`flex h-8 w-8 items-center justify-center rounded-md border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${toolbarState.createLink ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/20 bg-background text-muted-foreground hover:border-primary/50 hover:text-primary'}`}>
          <Link className="h-3.5 w-3.5" />
        </button>
        <button type="button" onMouseDown={preserveSelectionOnToolbar} onClick={() => runCommand('unlink')} aria-label="Remover link" title="Remover link" className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Unlink className="h-3.5 w-3.5" />
        </button>
        <button type="button" disabled aria-label="Inserir imagem indisponível" title="Imagens na descrição ficam desativadas até existir upload seguro" className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-border bg-muted text-muted-foreground/50">
          <ImageIcon className="h-3.5 w-3.5" />
        </button>

        <label className="flex h-8 items-center gap-1 rounded-md border border-primary/20 bg-background px-1.5 text-[10px] font-semibold text-muted-foreground" title="Cor do texto">
          A
          <input
            type="color"
            aria-label="Cor do texto"
            value={colorPickerValue(toolbarState.foreColor, '#111827')}
            onMouseDown={rememberSelection}
            onChange={(event) => runCommand('foreColor', event.target.value)}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <label className="flex h-8 items-center gap-1 rounded-md border border-primary/20 bg-background px-1.5 text-[10px] font-semibold text-muted-foreground" title="Cor de fundo">
          Bg
          <input
            type="color"
            aria-label="Cor de fundo"
            value={colorPickerValue(toolbarState.backColor, '#fef3c7')}
            onMouseDown={rememberSelection}
            onChange={(event) => runCommand('backColor', event.target.value)}
            className="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <button type="button" onMouseDown={preserveSelectionOnToolbar} onClick={() => runCommand('removeFormat')} aria-label="Limpar formatação" title="Limpar formatação do trecho selecionado" className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition hover:border-primary/50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative bg-background">
        {!stripRichTextHtml(normalizedValue) && (
          <span className="pointer-events-none absolute left-4 top-3 text-xs font-normal text-muted-foreground/60">
            {placeholder}
          </span>
        )}
        <div
          id={id}
          ref={editorRef}
          role="textbox"
          aria-label={ariaLabel}
          aria-multiline="true"
          contentEditable
          suppressContentEditableWarning
          onFocus={refreshToolbarState}
          onInput={() => emitEditorValue()}
          onBlur={() => emitEditorValue(true)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          className={`${minHeightClass} rich-text-description max-h-[360px] w-full overflow-y-auto px-4 py-3 text-sm font-normal leading-6 text-foreground outline-none`}
        />
      </div>
      <p className="min-h-5 border-t border-border/60 px-3 py-1 text-[11px] text-muted-foreground" role="status" aria-live="polite">
        {editorMessage || 'Selecione um trecho e use a barra; Ctrl+B, Ctrl+I e Ctrl+U também funcionam.'}
      </p>
    </div>
  );
}
