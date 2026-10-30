import { Edit3, Trash2 } from 'lucide-react';

/** Shared compact item summary; full configuration remains available in the editor. */
export function ItemSummaryRow({ name, description, quantity, unit, total, onEdit, onRemove }: {
  name: string; description?: string; quantity: number; unit: string; total: string;
  onEdit: () => void; onRemove: () => void;
}) {
  return <article aria-label={name} className="overflow-x-auto rounded-lg border border-border bg-card">
    <div className="flex min-w-[820px] items-center gap-4 px-3 py-2 text-xs">
      <div className="flex min-w-0 flex-1 items-center gap-2" title={[name, description].filter(Boolean).join(' · ')}>
        <span className="shrink-0 max-w-[55%] truncate font-bold text-foreground">{name}</span>
        {description && <span className="truncate text-muted-foreground">{description}</span>}
      </div>
      <span className="w-14 shrink-0 whitespace-nowrap" aria-label={`Quantidade: ${quantity}`}>Qtd. <strong>{quantity}</strong></span>
      <span className="w-28 shrink-0 whitespace-nowrap text-right" aria-label={`Valor unitário: ${unit}`}>Unit. <strong>{unit}</strong></span>
      <span className="w-28 shrink-0 whitespace-nowrap text-right text-primary" aria-label={`Total do item: ${total}`}>Total <strong>{total}</strong></span>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onEdit} className="pf-button-secondary" aria-label={`Editar item ${name}`}><Edit3 className="h-4 w-4" /> Editar</button>
        <button type="button" onClick={onRemove} className="pf-button-danger" aria-label={`Remover item ${name}`}><Trash2 className="h-4 w-4" /> Remover</button>
      </div>
    </div>
  </article>;
}
