'use client';

import React, { useEffect, useRef } from 'react';
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
  Palette,
  Quote,
  Redo2,
  Strikethrough,
  Type,
  Underline,
  Undo2,
  Unlink
} from 'lucide-react';
import { normalizeRichTextHtml, sanitizeRichTextHtml, stripRichTextHtml } from '@/lib/utils';

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeightClass?: string;
};

const toolbarGroups = [
  [
    { label: 'Desfazer', icon: Undo2, command: 'undo' },
    { label: 'Refazer', icon: Redo2, command: 'redo' }
  ],
  [
    { label: 'Negrito', icon: Bold, command: 'bold' },
    { label: 'Italico', icon: Italic, command: 'italic' },
    { label: 'Sublinhado', icon: Underline, command: 'underline' },
    { label: 'Riscado', icon: Strikethrough, command: 'strikeThrough' }
  ],
  [
    { label: 'Texto', icon: Type, command: 'formatBlock', value: 'p' },
    { label: 'Titulo 1', icon: Heading1, command: 'formatBlock', value: 'h1' },
    { label: 'Titulo 2', icon: Heading2, command: 'formatBlock', value: 'h2' },
    { label: 'Citacao', icon: Quote, command: 'formatBlock', value: 'blockquote' }
  ],
  [
    { label: 'Lista', icon: List, command: 'insertUnorderedList' },
    { label: 'Lista numerada', icon: ListOrdered, command: 'insertOrderedList' }
  ],
  [
    { label: 'Alinhar esquerda', icon: AlignLeft, command: 'justifyLeft' },
    { label: 'Centralizar', icon: AlignCenter, command: 'justifyCenter' },
    { label: 'Alinhar direita', icon: AlignRight, command: 'justifyRight' },
    { label: 'Justificar', icon: AlignJustify, command: 'justifyFull' }
  ]
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Digite aqui...',
  minHeightClass = 'min-h-[136px]'
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const normalizedValue = normalizeRichTextHtml(value);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== normalizedValue) {
      editorRef.current.innerHTML = normalizedValue || '';
    }
  }, [normalizedValue]);

  const syncValue = () => {
    onChange(editorRef.current?.innerHTML || '');
  };

  const runCommand = (command: string, commandValue?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, commandValue);
    syncValue();
  };

  const createLink = () => {
    const url = window.prompt('Informe a URL do link');
    if (!url) return;
    const safeUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    runCommand('createLink', safeUrl);
  };

  const insertImage = () => {
    const url = window.prompt('Informe a URL da imagem');
    if (!url) return;
    runCommand('insertImage', url);
  };

  const clearFormatting = () => {
    runCommand('removeFormat');
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertHTML', false, sanitizeRichTextHtml(html || text));
    syncValue();
  };

  return (
    <div className="overflow-hidden rounded-xl border border-primary/25 bg-background shadow-sm focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/10">
      <div className="flex flex-wrap items-center gap-1 border-b border-primary/15 bg-primary/5 px-2 py-2">
        {toolbarGroups.map((group, index) => (
          <div key={index} className="flex items-center gap-1 pr-1">
            {group.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={`${item.command}-${item.label}`}
                  type="button"
                  onClick={() => runCommand(item.command, 'value' in item ? item.value : undefined)}
                  title={item.label}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        ))}

        <button type="button" onClick={createLink} title="Inserir link" className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <Link className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => runCommand('unlink')} title="Remover link" className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <Unlink className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={insertImage} title="Inserir imagem por URL" className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <ImageIcon className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={() => runCommand('foreColor', '#111827')} title="Texto escuro" className="flex h-7 min-w-9 items-center justify-center gap-1 rounded-md border border-primary/20 bg-background px-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <Palette className="h-3 w-3" />
          A
        </button>
        <button type="button" onClick={() => runCommand('backColor', '#fef3c7')} title="Marca texto" className="flex h-7 min-w-10 items-center justify-center rounded-md border border-primary/20 bg-background px-1.5 text-[10px] font-bold text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          Bg
        </button>
        <button type="button" onClick={clearFormatting} title="Limpar formatacao" className="flex h-7 w-7 items-center justify-center rounded-md border border-primary/20 bg-background text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
          <Eraser className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative bg-background">
        {!stripRichTextHtml(normalizedValue) && (
          <span className="pointer-events-none absolute left-3 top-3 text-xs font-medium text-muted-foreground/55">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncValue}
          onBlur={() => onChange(sanitizeRichTextHtml(editorRef.current?.innerHTML || ''))}
          onPaste={handlePaste}
          className={`${minHeightClass} rich-text-description w-full px-3 py-3 text-xs leading-relaxed text-foreground outline-none`}
        />
      </div>
    </div>
  );
}
