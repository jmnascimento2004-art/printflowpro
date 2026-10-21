'use client';
import type { ProductCustomField, ProductFieldValues, ProductFieldType } from '@/lib/product-custom-fields';

const input = 'w-full rounded border border-border bg-background p-2 text-xs';
export function ProductFieldInputs({ fields, values, onChange }: { fields: ProductCustomField[]; values: ProductFieldValues; onChange: (value: ProductFieldValues) => void }) {
  return <div className="space-y-3">{fields.map(field => <label key={field.id} className="block text-xs font-medium">{field.label}{field.required ? ' *' : ''}{field.type === 'measure' ? ' (m)' : ''}
    {field.type === 'textarea' ? <textarea className={input} maxLength={2000} value={String(values[field.id] ?? '')} onChange={event => onChange({ ...values, [field.id]: event.target.value })}/>
      : field.type === 'select' ? <select className={input} value={String(values[field.id] ?? '')} onChange={event => onChange({ ...values, [field.id]: event.target.value })}><option value="">Selecione…</option>{field.options?.map(option => <option key={option}>{option}</option>)}</select>
      : field.type === 'checkbox' ? <input type="checkbox" checked={values[field.id] === true} onChange={event => onChange({ ...values, [field.id]: event.target.checked })}/>
      : <input className={input} type={field.type === 'date' ? 'date' : field.type === 'number' || field.type === 'measure' ? 'number' : 'text'} step="any" maxLength={2000} value={String(values[field.id] ?? '')} onChange={event => onChange({ ...values, [field.id]: event.target.value })}/>}
  </label>)}</div>;
}

export function ProductFieldsEditor({ fields, onChange }: { fields: ProductCustomField[]; onChange: (fields: ProductCustomField[]) => void }) {
  const update = (id: string, patch: Partial<ProductCustomField>) => onChange(fields.map(field => field.id === id ? { ...field, ...patch } : field));
  return <details className="rounded-xl border border-border p-3 space-y-3"><summary className="cursor-pointer text-sm font-bold">Campos personalizados</summary>
    <p className="text-xs text-muted-foreground">Informações para personalização, sem alterar preço. Exibidas na Store e nos documentos de venda e produção. Não solicite senhas ou dados sensíveis. Arquivos usam o fluxo de arte existente.</p>
    {fields.map(field => <fieldset key={field.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 rounded border p-2">
      <label className="text-xs">Nome do campo<input className={input} maxLength={100} value={field.label} onChange={event => update(field.id, { label: event.target.value })}/></label>
      <label className="text-xs">Tipo<select className={input} value={field.type} onChange={event => update(field.id, { type: event.target.value as ProductFieldType })}>{Object.entries({ text: 'Texto', textarea: 'Observação longa', number: 'Número', select: 'Seleção', checkbox: 'Confirmação', date: 'Data', measure: 'Medida em metros' }).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <label className="text-xs"><input type="checkbox" checked={field.required} onChange={event => update(field.id, { required: event.target.checked })}/> Obrigatório</label>
      {field.type === 'select' && <label className="text-xs md:col-span-3">Opções (uma por linha)<textarea className={input} value={field.options?.join('\n') || ''} onChange={event => update(field.id, { options: event.target.value.split('\n') })}/></label>}
      <button type="button" className="text-xs text-red-600" onClick={() => onChange(fields.filter(row => row.id !== field.id))}>Remover campo</button>
    </fieldset>)}
    <button type="button" className="text-xs font-bold text-primary" disabled={fields.length >= 30} onClick={() => onChange([...fields, { id: crypto.randomUUID(), label: '', type: 'text', required: false }])}>Adicionar campo</button>
  </details>;
}
