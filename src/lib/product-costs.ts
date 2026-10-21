/** Product cost per selling unit (unit, m² or linear metre), never a sale total. */
export interface ProductCostComponent {
  id: string;
  description: string;
  type: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  supplier_id?: string;
  notes?: string;
  active: boolean;
}

export interface ProductCostComposition {
  version: 1;
  mode: 'composition' | 'manual';
  components: ProductCostComponent[];
  template_id?: string;
}

const money = (value: number) => Math.round(value * 100) / 100;

export function validateCostComposition(composition: ProductCostComposition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const item of composition.components) {
    if (!item.id || ids.has(item.id)) errors.push('Identificador de custo repetido.');
    ids.add(item.id);
    if (!item.description.trim() || !item.type.trim() || !item.unit.trim()) errors.push('Informe descrição, tipo e unidade do custo.');
    if (![item.quantity, item.unit_cost].every(value => Number.isFinite(value) && value >= 0)) errors.push('Quantidade e custo devem ser números não negativos.');
  }
  return [...new Set(errors)];
}

/** Explicit manual override; composition mode never adds the stored base cost again. */
export function resolveProductCost(manualCost: number, composition?: ProductCostComposition): number {
  if (!composition || composition.mode === 'manual') return manualCost;
  if (validateCostComposition(composition).length) return NaN;
  return money(composition.components.filter(item => item.active).reduce((total, item) => total + item.quantity * item.unit_cost, 0));
}

/** Shared suggestion only. The final selling price still belongs to resolveProductPrice. */
export function suggestProductPrice(cost: number, margin: number, taxes: number, commission: number, mode: 'margin' | 'markup' = 'margin', multiplier = 1): number | null {
  if (![cost, margin, taxes, commission, multiplier].every(Number.isFinite) || cost < 0 || taxes < 0 || commission < 0 || margin < 0 || multiplier < 0) return null;
  const denominator = 1 - (taxes + commission + (mode === 'margin' ? margin : 0)) / 100;
  if (denominator <= 0) return null;
  return money(cost * (mode === 'markup' ? multiplier : 1) / denominator);
}

export const PRODUCT_PRICING_PRESETS = [
  { id: 'banner', name: 'Banner em lona', pricingType: 'm2', saleMode: 'm2', unit: 'm²', costs: ['Lona e tinta', 'Acabamento', 'Máquina'] },
  { id: 'vinyl', name: 'Adesivo em vinil', pricingType: 'm2', saleMode: 'm2', unit: 'm²', costs: ['Vinil e tinta', 'Recorte', 'Máquina'] },
  { id: 'cards', name: 'Cartão de visita', pricingType: 'unidade', saleMode: 'volume', unit: 'un', costs: ['Papel e impressão', 'Acabamento', 'Terceirização'] },
  { id: 'dtf', name: 'DTF por metro', pricingType: 'linear', saleMode: 'linear', unit: 'm', costs: ['Filme e tinta', 'Mão de obra', 'Máquina'] },
  { id: 'sublimation', name: 'Sublimação', pricingType: 'unidade', saleMode: 'unidade', unit: 'un', costs: ['Peça e insumos', 'Mão de obra', 'Embalagem'] }
] as const;

export function createPresetComposition(templateId: string, newId: () => string): ProductCostComposition {
  const preset = PRODUCT_PRICING_PRESETS.find(item => item.id === templateId);
  if (!preset) throw new Error('Modelo desconhecido.');
  return { version: 1, mode: 'composition', template_id: preset.id, components: preset.costs.map(description => ({ id: newId(), description, type: 'variável', quantity: 1, unit: preset.unit, unit_cost: 0, active: true })) };
}
