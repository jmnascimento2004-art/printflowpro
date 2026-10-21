'use client';
import { useState } from 'react';
import type { Product } from '@/lib/dummy-data';
import { formatCurrency, formatUnitCurrency, resolveProductPrice, getNormalizedVariantPricingMatrix } from '@/lib/pricing';

export function ProductPricingPreview({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const [width, setWidth] = useState(1);
  const [height, setHeight] = useState(1);
  const [rowId, setRowId] = useState('');
  const rows = getNormalizedVariantPricingMatrix(product);
  const row = rows.find(item => item.id === rowId);
  const result = resolveProductPrice(product, { quantity, width, height, length: width, customOptions: { variantSelection: row } });
  return <details className="rounded-xl border border-border p-3 space-y-3"><summary className="text-sm font-bold cursor-pointer">Conferir preço por quantidade e medidas</summary>
    <p className="text-xs text-muted-foreground">Faixas usam o maior limite mínimo atendido; abaixo do primeiro limite vale o preço base. Matrizes usam combinações e tiragens exatas. Promoção é uma marcação; descontos são aplicados no documento. Opções com preço substituem o total, conforme a regra existente.</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
      <label>Quantidade de teste<input className="w-full border rounded p-2" type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))}/></label>
      {product.pricing_type !== 'unidade' && <label>Comprimento/largura (m)<input className="w-full border rounded p-2" type="number" min="0" step="any" value={width} onChange={event => setWidth(Number(event.target.value))}/></label>}
      {(product.pricing_type === 'm2' || Number(product.pricing_details?.configurator_options?.max_width) > 0) && <label>Altura (m)<input className="w-full border rounded p-2" type="number" min="0" step="any" value={height} onChange={event => setHeight(Number(event.target.value))}/></label>}
      {rows.length > 0 && <label className="sm:col-span-3">Combinação<select className="w-full border rounded p-2" value={rowId} onChange={event => setRowId(event.target.value)}><option value="">Selecione…</option>{rows.map(item => <option key={item.id} value={item.id}>{[item.material, item.size, item.colors, item.finishing].filter(Boolean).join(' / ')}</option>)}</select></label>}
    </div>
    <p className="text-xs">Unitário: <strong>{formatUnitCurrency(result.unitPrice)}</strong> · Subtotal: <strong>{formatCurrency(result.breakdown.baseSubtotal)}</strong> · Total: <strong>{formatCurrency(result.totalPrice)}</strong></p>
    {result.warningMessage && <p className="text-xs text-amber-700">{result.warningMessage}</p>}
  </details>;
}
