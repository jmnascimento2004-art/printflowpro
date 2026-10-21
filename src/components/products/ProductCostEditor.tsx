'use client';

import { createPresetComposition, PRODUCT_PRICING_PRESETS, resolveProductCost, suggestProductPrice, type ProductCostComposition } from '@/lib/product-costs';
import { formatCurrency } from '@/lib/pricing';

export function ProductCostEditor({ value, onChange, suppliers, manualCost, mode, multiplier, onModeChange, onMultiplierChange, margin, taxes, commission, finalPrice, onApplyPrice, onPreset }: {
  suppliers: Array<{ id: string; name: string }>;
  value: ProductCostComposition; onChange: (value: ProductCostComposition) => void;
  mode: 'margin' | 'markup'; multiplier: number; onModeChange: (mode: 'margin' | 'markup') => void; onMultiplierChange: (value: number) => void;
  manualCost: number; margin: number; taxes: number; commission: number; finalPrice: number;
  onApplyPrice: (price: number) => void; onPreset: (id: string) => void;
}) {
  const cost = resolveProductCost(manualCost, value);
  const suggestion = suggestProductPrice(cost, margin, taxes, commission, mode, multiplier);
  const change = (id: string, patch: Partial<ProductCostComposition['components'][number]>) => onChange({ ...value, components: value.components.map(item => item.id === id ? { ...item, ...patch } : item) });
  const input = 'w-full rounded border border-border bg-background p-2 text-xs';
  return <details className="rounded-xl border border-border p-3 space-y-3" open={value.mode === 'composition'}>
    <summary className="cursor-pointer text-sm font-bold">Composição de custos e configuração guiada</summary>
    <p className="text-xs text-muted-foreground">1. Escolha um modelo. 2. Informe custos por unidade de venda. 3. Confira medidas e unidade. 4. Ajuste a margem abaixo. 5. Revise o preço antes de salvar.</p>
    <label className="block text-xs">Modelo inicial (aplica estrutura editável, sem preço fixo)
      <select className={input} value="" onChange={event => { if (!event.target.value) return; onChange(createPresetComposition(event.target.value, () => crypto.randomUUID())); onPreset(event.target.value); }}>
        <option value="">Escolher modelo…</option>{PRODUCT_PRICING_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
      </select>
    </label>
    <label className="block text-xs">Método da sugestão<select className={input} value={mode} onChange={event => onModeChange(event.target.value as 'margin' | 'markup')}><option value="margin">Margem líquida sobre receita</option><option value="markup">Multiplicador sobre custo (markup)</option></select></label>
    {mode === 'markup' && <label className="block text-xs">Multiplicador<input className={input} type="number" min="0" step="any" value={multiplier} onChange={event => onMultiplierChange(Number(event.target.value))}/></label>}
    <label className="block text-xs">Fonte do custo
      <select className={input} value={value.mode} onChange={event => onChange({ ...value, mode: event.target.value as ProductCostComposition['mode'] })}>
        <option value="manual">Custo base manual (substitui a composição)</option><option value="composition">Soma dos componentes ativos</option>
      </select>
    </label>
    {value.components.map((item, index) => <fieldset key={item.id} className="grid grid-cols-2 md:grid-cols-4 gap-2 border border-border rounded p-3">
      <legend className="text-xs">Custo {index + 1}</legend>
      <label className="text-xs col-span-2">Descrição<input className={input} value={item.description} onChange={event => change(item.id, { description: event.target.value })}/></label>
      <label className="text-xs">Tipo<input className={input} list="product-cost-types" value={item.type} onChange={event => change(item.id, { type: event.target.value })}/></label>
      <label className="text-xs">Unidade<input className={input} value={item.unit} onChange={event => change(item.id, { unit: event.target.value })}/></label>
      <label className="text-xs">Quantidade por base<input className={input} type="number" min="0" step="any" value={item.quantity} onChange={event => change(item.id, { quantity: Number(event.target.value) })}/></label>
      <label className="text-xs">Custo unitário (R$)<input className={input} type="number" min="0" step="any" value={item.unit_cost} onChange={event => change(item.id, { unit_cost: Number(event.target.value) })}/></label>
      <label className="text-xs col-span-2">Fornecedor (opcional)<select className={input} value={item.supplier_id || ''} onChange={event => change(item.id, { supplier_id: event.target.value || undefined })}><option value="">Sem fornecedor</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label className="text-xs col-span-2">Observação interna<input className={input} value={item.notes || ''} onChange={event => change(item.id, { notes: event.target.value })}/></label>
      <label className="text-xs"><input type="checkbox" checked={item.active} onChange={event => change(item.id, { active: event.target.checked })}/> Ativo</label>
      <span className="text-xs">Total: {formatCurrency(item.quantity * item.unit_cost)}</span>
      <button type="button" className="text-xs underline" disabled={index === 0} onClick={() => { const components = [...value.components]; [components[index - 1], components[index]] = [components[index], components[index - 1]]; onChange({ ...value, components }); }}>Mover acima</button>
      <button type="button" className="text-xs text-red-600" onClick={() => onChange({ ...value, components: value.components.filter(row => row.id !== item.id) })}>Remover custo</button>
    </fieldset>)}
    <datalist id="product-cost-types">{['Matéria-prima', 'Mão de obra', 'Máquina', 'Terceiros', 'Embalagem', 'Rateio fixo', 'Outros'].map(type => <option key={type}>{type}</option>)}</datalist>
    <button type="button" className="text-xs font-bold text-primary" onClick={() => onChange({ ...value, components: [...value.components, { id: crypto.randomUUID(), description: '', type: 'Matéria-prima', quantity: 1, unit: 'un', unit_cost: 0, active: true }] })}>Adicionar custo</button>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded bg-secondary p-3 text-xs">
      <span>Custo estimado<br/><strong>{formatCurrency(cost)}</strong></span><span>{mode === 'margin' ? 'Meta de margem líquida' : 'Multiplicador'}<br/><strong>{mode === 'margin' ? `${margin}%` : `${multiplier}×`}</strong></span>
      <span>Preço sugerido<br/><strong>{suggestion === null ? 'Rever percentuais' : formatCurrency(suggestion)}</strong></span><span>Preço final<br/><strong>{formatCurrency(finalPrice)}</strong></span>
    </div>
    <p className="text-xs text-muted-foreground">Margem é percentual da receita após custo, impostos e comissão; não é multiplicador sobre custo. Estoque e SKU permanecem por produto.</p>
    {cost === 0 && <p role="status" className="text-xs text-amber-700">Custo zerado: informe os custos para estimar a margem.</p>}
    {finalPrice < cost && <p role="status" className="text-xs text-red-600">Preço abaixo do custo: margem negativa.</p>}
    {suggestion === null && <p role="status" className="text-xs text-red-600">Margem, impostos e comissão precisam somar menos de 100% para calcular uma sugestão.</p>}
    <button type="button" disabled={suggestion === null} className="text-xs font-bold text-primary disabled:opacity-50" onClick={() => suggestion !== null && onApplyPrice(suggestion)}>Aplicar preço sugerido</button>
  </details>;
}
