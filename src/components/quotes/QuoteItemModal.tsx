'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Product, QuoteItem } from '@/lib/dummy-data';
import { formatCurrencyInput, parseCurrencyInputToNumber } from '@/lib/utils';

type QuoteItemMode = 'product' | 'manual';
type QuotePricingMode = 'unit' | 'square_meter' | 'linear_meter' | 'quantity_lote' | 'service' | 'manual';

export type QuoteItemDraft = Omit<QuoteItem, 'id' | 'total_price'> & {
  id?: string;
  total_price?: number;
};

interface QuoteItemModalProps {
  open: boolean;
  products: Product[];
  item?: QuoteItemDraft | null;
  onClose: () => void;
  onSave: (item: QuoteItemDraft) => void;
}

const pricingModeLabels: Record<QuotePricingMode, string> = {
  unit: 'Unidade',
  square_meter: 'Metro quadrado',
  linear_meter: 'Metro linear',
  quantity_lote: 'Quantidade / lote',
  service: 'Servico',
  manual: 'Outro / valor manual'
};

const emptyDraft = {
  mode: 'manual' as QuoteItemMode,
  productId: '',
  name: '',
  description: '',
  pricingMode: 'unit' as QuotePricingMode,
  quantity: 1,
  width: 1,
  height: 1,
  length: 1,
  unitPrice: 0,
  discount: 0,
  totalPrice: 0,
  manualTotal: false,
  deadlineDays: '',
  notes: '',
  originalUnitPrice: 0
};

const toSafeNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const roundMoney = (value: number) => Math.round(Math.max(0, value) * 100) / 100;

const inferPricingMode = (item?: QuoteItemDraft | null): QuotePricingMode => {
  const snapshot = item?.details?.configuration_snapshot as { pricing_mode?: QuotePricingMode } | undefined;
  if (snapshot?.pricing_mode) return snapshot.pricing_mode;
  if (item?.details?.pricing_type === 'm2') return 'square_meter';
  if (item?.details?.pricing_type === 'linear') return 'linear_meter';
  return 'unit';
};

const calculateTotal = (draft: typeof emptyDraft) => {
  if (draft.manualTotal) return roundMoney(draft.totalPrice);

  const quantity = Math.max(0, toSafeNumber(draft.quantity));
  const unitPrice = Math.max(0, toSafeNumber(draft.unitPrice));
  const discount = Math.max(0, toSafeNumber(draft.discount));

  if (draft.pricingMode === 'square_meter') {
    return roundMoney(toSafeNumber(draft.width) * toSafeNumber(draft.height) * quantity * unitPrice - discount);
  }

  if (draft.pricingMode === 'linear_meter') {
    return roundMoney(toSafeNumber(draft.length) * quantity * unitPrice - discount);
  }

  if (draft.pricingMode === 'manual') {
    return roundMoney(toSafeNumber(draft.totalPrice) - discount);
  }

  return roundMoney(quantity * unitPrice - discount);
};

export function QuoteItemModal({ open, products, item, onClose, onSave }: QuoteItemModalProps) {
  const [draft, setDraft] = useState(emptyDraft);

  const selectedProduct = products.find((product) => product.id === draft.productId);
  const calculatedTotal = useMemo(() => calculateTotal(draft), [draft]);

  useEffect(() => {
    if (!open) return;

    if (!item) {
      setDraft(emptyDraft);
      return;
    }

    const snapshot = item.details?.configuration_snapshot as {
      source?: string;
      pricing_mode?: QuotePricingMode;
      discount?: number;
      description?: string;
      original_unit_price?: number;
      manual_total_override?: boolean;
      deadline_days?: string | number;
    } | undefined;

    setDraft({
      mode: item.product_id ? 'product' : 'manual',
      productId: item.product_id || '',
      name: item.product_name || '',
      description: snapshot?.description || item.details?.configuration_summary || '',
      pricingMode: inferPricingMode(item),
      quantity: toSafeNumber(item.quantity) || 1,
      width: toSafeNumber(item.details?.width) || 1,
      height: toSafeNumber(item.details?.height) || 1,
      length: toSafeNumber(item.details?.length) || 1,
      unitPrice: toSafeNumber(item.unit_price),
      discount: toSafeNumber(snapshot?.discount),
      totalPrice: toSafeNumber(item.total_price) || toSafeNumber(item.quantity) * toSafeNumber(item.unit_price),
      manualTotal: Boolean(snapshot?.manual_total_override),
      deadlineDays: snapshot?.deadline_days ? String(snapshot.deadline_days) : '',
      notes: item.details?.notes || '',
      originalUnitPrice: toSafeNumber(snapshot?.original_unit_price) || toSafeNumber(item.unit_price)
    });
  }, [item, open]);

  useEffect(() => {
    if (draft.manualTotal) return;
    setDraft((current) => ({ ...current, totalPrice: calculateTotal(current) }));
  }, [
    draft.mode,
    draft.pricingMode,
    draft.quantity,
    draft.width,
    draft.height,
    draft.length,
    draft.unitPrice,
    draft.discount,
    draft.manualTotal
  ]);

  if (!open) return null;

  const updateDraft = (patch: Partial<typeof emptyDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const handleSelectProduct = (productId: string) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) {
      updateDraft({ productId: '', name: '', unitPrice: 0, originalUnitPrice: 0 });
      return;
    }

    const pricingMode: QuotePricingMode = product.pricing_type === 'm2'
      ? 'square_meter'
      : product.pricing_type === 'linear'
        ? 'linear_meter'
        : 'unit';

    updateDraft({
      productId,
      name: product.name,
      description: product.description || '',
      pricingMode,
      unitPrice: product.sales_price || 0,
      originalUnitPrice: product.sales_price || 0,
      manualTotal: false
    });
  };

  const handleSave = () => {
    const cleanName = draft.name.trim();
    if (!cleanName) {
      alert('Informe o nome/descricao do item.');
      return;
    }

    const total = calculatedTotal;
    const quantity = Math.max(0, toSafeNumber(draft.quantity)) || 1;
    const unitPrice = draft.pricingMode === 'manual'
      ? roundMoney(total / quantity)
      : Math.max(0, toSafeNumber(draft.unitPrice));

    const calculation = draft.pricingMode === 'square_meter'
      ? `${draft.width} x ${draft.height} x ${unitPrice} x ${quantity}`
      : draft.pricingMode === 'linear_meter'
        ? `${draft.length} x ${unitPrice} x ${quantity}`
        : `${quantity} x ${unitPrice}`;

    const originalUnitPrice = draft.mode === 'product'
      ? toSafeNumber(draft.originalUnitPrice || selectedProduct?.sales_price)
      : 0;

    onSave({
      id: item?.id,
      product_id: draft.mode === 'product' ? draft.productId : '',
      product_name: cleanName,
      quantity,
      unit_price: unitPrice,
      total_price: total,
      details: {
        width: draft.pricingMode === 'square_meter' ? toSafeNumber(draft.width) : undefined,
        height: draft.pricingMode === 'square_meter' ? toSafeNumber(draft.height) : undefined,
        length: draft.pricingMode === 'linear_meter' ? toSafeNumber(draft.length) : undefined,
        pricing_type: draft.pricingMode === 'square_meter' ? 'm2' : draft.pricingMode === 'linear_meter' ? 'linear' : 'unidade',
        configuration_summary: draft.description.trim() || pricingModeLabels[draft.pricingMode],
        configuration_snapshot: {
          source: draft.mode === 'product' ? 'product' : 'manual_quote_item',
          product_id: draft.mode === 'product' ? draft.productId : undefined,
          pricing_mode: draft.pricingMode,
          width: draft.pricingMode === 'square_meter' ? toSafeNumber(draft.width) : undefined,
          height: draft.pricingMode === 'square_meter' ? toSafeNumber(draft.height) : undefined,
          length: draft.pricingMode === 'linear_meter' ? toSafeNumber(draft.length) : undefined,
          quantity,
          unit_price: unitPrice,
          square_meter_price: draft.pricingMode === 'square_meter' ? unitPrice : undefined,
          linear_meter_price: draft.pricingMode === 'linear_meter' ? unitPrice : undefined,
          original_unit_price: originalUnitPrice || undefined,
          quoted_unit_price: unitPrice,
          manual_price_override: draft.mode === 'product' ? originalUnitPrice !== unitPrice : false,
          discount: toSafeNumber(draft.discount),
          total_price: total,
          manual_total_override: draft.manualTotal,
          deadline_days: draft.deadlineDays || undefined,
          description: draft.description.trim() || undefined,
          calculation
        } as NonNullable<QuoteItem['details']>['configuration_snapshot']
          & Record<string, unknown>,
        notes: draft.notes.trim()
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-black uppercase text-foreground">Adicionar item ao orçamento</h3>
            <p className="mt-1 text-xs text-muted-foreground">Use produto cadastrado com preço editável ou crie um item manual sem alterar o cadastro.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-border bg-secondary/20 p-1 text-xs font-bold">
          <button
            type="button"
            onClick={() => updateDraft({ mode: 'product' })}
            className={`rounded-lg px-3 py-2 ${draft.mode === 'product' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-card'}`}
          >
            Produto cadastrado
          </button>
          <button
            type="button"
            onClick={() => updateDraft({ mode: 'manual', productId: '' })}
            className={`rounded-lg px-3 py-2 ${draft.mode === 'manual' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-foreground hover:bg-card'}`}
          >
            Item manual / personalizado
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
          {draft.mode === 'product' && (
            <label className="space-y-1 md:col-span-2">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">Produto cadastrado</span>
              <select value={draft.productId} onChange={(event) => handleSelectProduct(event.target.value)} className="pf-input text-xs">
                <option value="">Selecione um produto</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Nome / descricao do item *</span>
            <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} className="pf-input text-xs" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Descricao / observacoes comerciais</span>
            <textarea value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} rows={2} className="pf-input min-h-16 resize-none text-xs" />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Tipo de calculo *</span>
            <select value={draft.pricingMode} onChange={(event) => updateDraft({ pricingMode: event.target.value as QuotePricingMode, manualTotal: event.target.value === 'manual' })} className="pf-input text-xs">
              {Object.entries(pricingModeLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Quantidade</span>
            <input type="number" min="0" step="0.01" value={draft.quantity} onChange={(event) => updateDraft({ quantity: Number(event.target.value), manualTotal: draft.pricingMode === 'manual' ? draft.manualTotal : false })} className="pf-input text-xs" />
          </label>

          {draft.pricingMode === 'square_meter' && (
            <>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Largura (m)</span>
                <input type="number" min="0" step="0.01" value={draft.width} onChange={(event) => updateDraft({ width: Number(event.target.value), manualTotal: false })} className="pf-input text-xs" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Altura (m)</span>
                <input type="number" min="0" step="0.01" value={draft.height} onChange={(event) => updateDraft({ height: Number(event.target.value), manualTotal: false })} className="pf-input text-xs" />
              </label>
            </>
          )}

          {draft.pricingMode === 'linear_meter' && (
            <>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Largura informativa (m)</span>
                <input type="number" min="0" step="0.01" value={draft.width} onChange={(event) => updateDraft({ width: Number(event.target.value) })} className="pf-input text-xs" />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-muted-foreground">Comprimento / altura (m)</span>
                <input type="number" min="0" step="0.01" value={draft.length} onChange={(event) => updateDraft({ length: Number(event.target.value), manualTotal: false })} className="pf-input text-xs" />
              </label>
            </>
          )}

          {draft.pricingMode !== 'manual' && (
            <label className="space-y-1">
              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                {draft.pricingMode === 'square_meter' ? 'Valor do m2' : draft.pricingMode === 'linear_meter' ? 'Valor metro linear' : 'Valor unitario'}
              </span>
              <input value={formatCurrencyInput(draft.unitPrice)} onChange={(event) => updateDraft({ unitPrice: parseCurrencyInputToNumber(event.target.value), manualTotal: false })} className="pf-input text-xs" />
            </label>
          )}

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Desconto do item</span>
            <input value={formatCurrencyInput(draft.discount)} onChange={(event) => updateDraft({ discount: parseCurrencyInputToNumber(event.target.value), manualTotal: false })} className="pf-input text-xs" />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Total calculado/editavel</span>
            <input
              value={formatCurrencyInput(draft.totalPrice)}
              onChange={(event) => updateDraft({ totalPrice: parseCurrencyInputToNumber(event.target.value), manualTotal: true })}
              className="pf-input text-xs font-bold text-primary"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Prazo opcional (dias)</span>
            <input value={draft.deadlineDays} onChange={(event) => updateDraft({ deadlineDays: event.target.value })} className="pf-input text-xs" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-[10px] font-bold uppercase text-muted-foreground">Observacoes internas/opcionais</span>
            <textarea value={draft.notes} onChange={(event) => updateDraft({ notes: event.target.value })} rows={2} className="pf-input min-h-16 resize-none text-xs" />
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-primary/20 bg-primary/10 p-3">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[10px] font-black uppercase text-muted-foreground">
              {draft.manualTotal ? 'Total ajustado manualmente' : 'Total em tempo real'}
            </span>
            <span className="text-lg font-black text-primary">{formatCurrencyInput(calculatedTotal)}</span>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="rounded-xl bg-secondary px-4 py-2 text-xs font-bold text-foreground hover:bg-secondary/80">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} className="pf-button-primary px-4 text-xs">
            Salvar item
          </button>
        </div>
      </div>
    </div>
  );
}
