'use client';

/* eslint-disable @next/next/no-img-element */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Layers3,
  PackageCheck,
  Ruler,
  ShoppingBag,
  ShoppingCart,
  Tag,
  X
} from 'lucide-react';
import type { Product, ProductConfiguratorSettings, ProductSaleMode } from '@/lib/dummy-data';
import {
  formatCurrency,
  getPriceBreakdown,
  getProductConfigurator,
  type PricingSelectedOption
} from '@/lib/pricing';

export interface ProductConfiguratorCartPayload {
  product: Product;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  selected_options: Array<PricingSelectedOption & {
    group_id?: string;
    group_name?: string;
  }>;
  dimensions?: {
    width?: number;
    height?: number;
    length?: number;
  };
  pricing_type: Product['pricing_type'];
  production_days: number;
  configuration_summary: string;
}

interface ProductConfiguratorModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (payload: ProductConfiguratorCartPayload) => void;
  categoryName?: string;
}

const saleModeLabels: Record<ProductSaleMode, string> = {
  unidade: 'Unidade simples',
  m2: 'Metro quadrado',
  linear: 'Metro linear',
  width_height: 'Largura x Altura',
  pacote: 'Pacote / Kit',
  kit: 'Pacote / Kit',
  size_grid: 'Grade de tamanhos',
  custom: 'Produto personalizado'
};

const supportedSaleModes = new Set<ProductSaleMode>(['unidade', 'm2', 'linear', 'pacote', 'kit', 'size_grid']);
const defaultPlaceholderSizeNames = new Set(['P', 'M', 'G', 'GG', 'XG']);

const toPositiveNumber = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const toDisplayCm = (value?: number): number => {
  const numeric = toPositiveNumber(value, 1);
  return numeric <= 20 ? Math.round(numeric * 100) : Math.round(numeric);
};

const summarizeOptions = (options: ProductConfiguratorCartPayload['selected_options']): string => {
  if (options.length === 0) return 'Sem opções adicionais';
  return options
    .map((option) => `${option.group_name ? `${option.group_name}: ` : ''}${option.name || option.option_name}`)
    .join(' | ');
};

const hasRealSizeConfiguration = (sizeOptions: Array<{ name?: string; price_delta?: number | string | null; additional_days?: number | string | null; is_default?: boolean }>): boolean => {
  if (sizeOptions.length === 0) return false;

  return sizeOptions.some((option) => {
    const name = option.name?.trim().toUpperCase() || '';
    return Boolean(
      !defaultPlaceholderSizeNames.has(name) ||
      toPositiveNumber(option.price_delta, 0) > 0 ||
      toPositiveNumber(option.additional_days, 0) > 0 ||
      option.is_default
    );
  });
};

export function ProductConfiguratorModal({
  product,
  isOpen,
  onClose,
  onAddToCart,
  categoryName
}: ProductConfiguratorModalProps) {
  const savedConfigurator = getProductConfigurator(product);
  const configurator = useMemo<ProductConfiguratorSettings>(() => {
    return savedConfigurator || {
      sale_mode: (product?.pricing_type || 'unidade') as ProductSaleMode,
      min_quantity: product?.volume_pricing?.[0]?.min_qty || 1,
      option_groups: [],
      size_options: []
    };
  }, [product, savedConfigurator]);
  const saleMode = (configurator?.sale_mode || product?.pricing_type || 'unidade') as ProductSaleMode;
  const optionGroups = useMemo(() => configurator?.option_groups || [], [configurator]);
  const sizeOptions = useMemo(() => configurator?.size_options || [], [configurator]);
  const shouldShowSizeGrid = saleMode === 'size_grid' || hasRealSizeConfiguration(sizeOptions);

  const [quantity, setQuantity] = useState(1);
  const [widthCm, setWidthCm] = useState(100);
  const [heightCm, setHeightCm] = useState(100);
  const [lengthCm, setLengthCm] = useState(100);
  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState<Record<string, string[]>>({});
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedColor, setSelectedColor] = useState('');

  useEffect(() => {
    if (!isOpen || !product) return;

    const initialQuantity = Math.max(
      1,
      configurator?.min_quantity ||
      product.volume_pricing?.[0]?.min_qty ||
      1
    );

    const initialGroups = optionGroups.reduce<Record<string, string[]>>((acc, group) => {
      const defaults = group.options.filter((option) => option.is_default).map((option) => option.name);
      if (defaults.length > 0) {
        acc[group.id] = group.selection_type === 'single' ? [defaults[0]] : defaults;
      } else if (group.required && group.selection_type === 'single' && group.options[0]) {
        acc[group.id] = [group.options[0].name];
      } else {
        acc[group.id] = [];
      }
      return acc;
    }, {});

    const defaultSize = shouldShowSizeGrid
      ? sizeOptions.find((option) => option.is_default)?.name || sizeOptions[0]?.name || ''
      : '';

    setQuantity(initialQuantity);
    setWidthCm(toDisplayCm(configurator?.min_width));
    setHeightCm(toDisplayCm(configurator?.min_height));
    setLengthCm(toDisplayCm(configurator?.min_length));
    setSelectedOptionsByGroup(initialGroups);
    setSelectedSize(defaultSize);
    setSelectedVariant(product.variant_options?.[0]?.name || '');
    setSelectedColor(product.color_options?.[0]?.name || '');
  }, [isOpen, product, configurator, optionGroups, sizeOptions, shouldShowSizeGrid]);

  const selectedOptions = useMemo(() => {
    const groupOptions = optionGroups.flatMap((group) => {
      const selectedNames = selectedOptionsByGroup[group.id] || [];
      return group.options
        .filter((option) => selectedNames.includes(option.name))
        .map((option) => ({
          ...option,
          group_id: group.id,
          group_name: group.name
        }));
    });

    const selectedSizeOption = shouldShowSizeGrid
      ? sizeOptions.find((option) => option.name === selectedSize)
      : undefined;
    const sizeSelection = selectedSizeOption
      ? [{
          ...selectedSizeOption,
          group_name: 'Tamanho'
        }]
      : [];
    const variantSelection = selectedVariant
      ? [{
          name: selectedVariant,
          option_name: selectedVariant,
          price_delta: 0,
          additional_days: 0,
          group_name: 'Variação'
        }]
      : [];
    const colorSelection = selectedColor
      ? [{
          name: selectedColor,
          option_name: selectedColor,
          price_delta: 0,
          additional_days: 0,
          group_name: 'Cor'
        }]
      : [];

    return [
      ...groupOptions,
      ...sizeSelection,
      ...variantSelection,
      ...colorSelection
    ];
  }, [optionGroups, selectedOptionsByGroup, selectedSize, selectedVariant, selectedColor, sizeOptions, shouldShowSizeGrid]);

  const selectedPricingOptions = useMemo(() => {
    return selectedOptions.map((option) => ({
      name: option.name,
      option_name: option.name,
      price_delta: option.price_delta,
      additional_days: option.additional_days
    }));
  }, [selectedOptions]);

  const width = widthCm / 100;
  const height = heightCm / 100;
  const length = lengthCm / 100;

  const breakdown = useMemo(() => {
    return getPriceBreakdown(product, {
      quantity,
      width,
      height,
      length,
      selectedVariant,
      selectedColor,
      customOptions: {
        selectedOptions: selectedPricingOptions
      }
    });
  }, [product, quantity, width, height, length, selectedVariant, selectedColor, selectedPricingOptions]);

  if (!isOpen || !product) return null;

  const additionalDays = selectedOptions.reduce((sum, option) => {
    return sum + toPositiveNumber(option.additional_days, 0);
  }, 0);

  const saleModeLabel = saleModeLabels[saleMode] || 'Produto configurável';
  const isUnsupportedMode = !supportedSaleModes.has(saleMode);
  const unitPriceForCart = breakdown.quantity > 0 ? breakdown.subtotal / breakdown.quantity : 0;
  const dimensions = {
    width: product.pricing_type === 'm2' ? width : undefined,
    height: product.pricing_type === 'm2' ? height : undefined,
    length: product.pricing_type === 'linear' ? length : undefined
  };
  const configurationSummary = [
    `Tipo: ${saleModeLabel}`,
    `Quantidade: ${quantity}`,
    product.pricing_type === 'm2' ? `Medidas: ${widthCm}cm x ${heightCm}cm` : '',
    product.pricing_type === 'linear' ? `Metragem: ${lengthCm}cm` : '',
    summarizeOptions(selectedOptions)
  ].filter(Boolean).join(' | ');

  const handleGroupOptionChange = (
    groupId: string,
    optionName: string,
    selectionType: 'single' | 'multiple'
  ) => {
    setSelectedOptionsByGroup((current) => {
      if (selectionType === 'single') {
        return { ...current, [groupId]: [optionName] };
      }

      const selected = current[groupId] || [];
      const nextSelected = selected.includes(optionName)
        ? selected.filter((name) => name !== optionName)
        : [...selected, optionName];
      return { ...current, [groupId]: nextSelected };
    });
  };

  const handleAdd = () => {
    onAddToCart({
      product,
      product_id: product.id,
      product_name: product.name,
      quantity: breakdown.quantity,
      unit_price: unitPriceForCart,
      total_price: breakdown.subtotal,
      selected_options: selectedOptions,
      dimensions,
      pricing_type: product.pricing_type,
      production_days: additionalDays,
      configuration_summary: configurationSummary
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 md:p-4">
      <div className="w-full max-w-7xl max-h-[calc(100dvh-1rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 md:px-5">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              Produto configurável
            </span>
            <h2 className="text-base md:text-xl font-black uppercase tracking-wide leading-tight">
              {product.name}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center"
            aria-label="Fechar configurador"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[calc(100dvh-5.5rem)] grid-cols-1 overflow-y-auto lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          <aside className="border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
            <div className="aspect-square w-full overflow-hidden bg-white">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center gap-2 text-slate-300">
                  <ShoppingBag className="h-16 w-16 stroke-[1.2]" />
                  <span className="text-xs font-black uppercase tracking-wider">Sem imagem</span>
                </div>
              )}
            </div>

            <div className="space-y-3 p-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                <PackageCheck className="h-3.5 w-3.5" />
                Produto configurável
              </div>

              <div className="grid gap-2 text-xs">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2 font-black text-slate-800">
                    <Clock className="h-4 w-4 text-emerald-600" />
                    Prazo de produção
                  </div>
                  <p className="mt-1 text-slate-500">
                    {product.delivery_time || product.pricing_details?.delivery_time || 'Consultar prazo'}
                    {additionalDays > 0 ? ` + ${additionalDays} dia(s)` : ''}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2 font-black text-slate-800">
                    <Ruler className="h-4 w-4 text-emerald-600" />
                    Tipo de venda
                  </div>
                  <p className="mt-1 text-slate-500">{saleModeLabel}</p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2 font-black text-slate-800">
                    <Tag className="h-4 w-4 text-emerald-600" />
                    Categoria
                  </div>
                  <p className="mt-1 text-slate-500">{categoryName || 'Catálogo'}</p>
                </div>
              </div>
            </div>
          </aside>

          <main className="space-y-5 p-4 md:p-5">
            {isUnsupportedMode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                Este tipo de venda já está preparado no cadastro, mas ainda usa o cálculo padrão no catálogo para manter compatibilidade.
              </div>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Configuração principal</h3>
                  <p className="mt-1 text-xs text-slate-500">Informe quantidade e medidas necessárias para este produto.</p>
                </div>
                <Layers3 className="h-5 w-5 text-emerald-600" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Quantidade</span>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                  />
                </label>

                {product.pricing_type === 'm2' && (
                  <>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Largura (cm)</span>
                      <input
                        type="number"
                        min="1"
                        value={widthCm}
                        onChange={(event) => setWidthCm(Math.max(1, Number(event.target.value) || 1))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Altura (cm)</span>
                      <input
                        type="number"
                        min="1"
                        value={heightCm}
                        onChange={(event) => setHeightCm(Math.max(1, Number(event.target.value) || 1))}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                      />
                    </label>
                  </>
                )}

                {product.pricing_type === 'linear' && (
                  <label className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Metro linear (cm)</span>
                    <input
                      type="number"
                      min="1"
                      value={lengthCm}
                      onChange={(event) => setLengthCm(Math.max(1, Number(event.target.value) || 1))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-sm font-black text-slate-900 outline-none focus:border-emerald-500 focus:bg-white"
                    />
                  </label>
                )}
              </div>
            </section>

            {shouldShowSizeGrid && sizeOptions.length > 0 && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Grade de tamanhos</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sizeOptions.map((option) => {
                    const selected = selectedSize === option.name;
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => setSelectedSize(option.name)}
                        className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                          selected
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-600/10'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                        }`}
                      >
                        {option.name}
                        {option.price_delta > 0 && (
                          <span className="ml-2 text-[10px] text-emerald-600">+ {formatCurrency(option.price_delta)}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {((product.variant_options && product.variant_options.length > 0) ||
              (product.color_options && product.color_options.length > 0)) && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Variações do produto</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {product.variant_options && product.variant_options.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Opção</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.variant_options.map((option) => {
                          const selected = selectedVariant === option.name;
                          return (
                            <button
                              key={option.name}
                              type="button"
                              onClick={() => setSelectedVariant(option.name)}
                              className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                                selected
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-600/10'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                              }`}
                            >
                              {option.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {product.color_options && product.color_options.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Cor</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {product.color_options.map((option) => {
                          const selected = selectedColor === option.name;
                          return (
                            <button
                              key={option.name}
                              type="button"
                              onClick={() => setSelectedColor(option.name)}
                              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                                selected
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-600/10'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                              }`}
                            >
                              <span className="h-3 w-3 rounded-full border border-slate-300" style={{ backgroundColor: option.hex || '#111827' }} />
                              {option.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {optionGroups.map((group) => (
              <section key={group.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">
                      {group.name || 'Grupo de opções'}
                    </h3>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      {group.selection_type === 'single' ? 'Escolha uma opção' : 'Escolha uma ou mais opções'}
                      {group.required ? ' - obrigatório' : ''}
                    </p>
                  </div>
                </div>

                <div className={group.selection_type === 'single' ? 'mt-3 flex flex-wrap gap-2' : 'mt-3 grid gap-2 sm:grid-cols-2'}>
                  {group.options.map((option) => {
                    const selected = (selectedOptionsByGroup[group.id] || []).includes(option.name);
                    const isMultiple = group.selection_type === 'multiple';
                    return (
                      <button
                        key={option.name}
                        type="button"
                        onClick={() => handleGroupOptionChange(group.id, option.name, group.selection_type)}
                        className={`text-left transition-all ${
                          isMultiple
                            ? `rounded-xl border p-3 ${selected ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-600/10' : 'border-slate-200 bg-white hover:border-emerald-300'}`
                            : `rounded-full border px-3 py-2 ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-600/10' : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'}`
                        }`}
                      >
                        <span className="flex items-center gap-2 text-xs font-black">
                          {isMultiple && (
                            <span className={`h-4 w-4 rounded border flex items-center justify-center ${selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>
                              {selected && <Check className="h-3 w-3" />}
                            </span>
                          )}
                          {option.name}
                        </span>
                        {(option.price_delta > 0 || option.additional_days > 0) && (
                          <span className="mt-1 block text-[10px] font-bold text-slate-500">
                            {option.price_delta > 0 ? `+ ${formatCurrency(option.price_delta)}` : ''}
                            {option.price_delta > 0 && option.additional_days > 0 ? ' | ' : ''}
                            {option.additional_days > 0 ? `+ ${option.additional_days} dia(s)` : ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}

            {configurator.kit_items && (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Itens inclusos</h3>
                <p className="mt-2 whitespace-pre-line text-xs font-medium leading-relaxed text-slate-600">{configurator.kit_items}</p>
              </section>
            )}
          </main>

          <aside className="border-t border-slate-200 bg-slate-50 p-4 lg:border-l lg:border-t-0">
            <div className="sticky top-0 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Resumo</h3>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Produto</span>
                    <span className="text-right font-black text-slate-900">{product.name}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Tipo</span>
                    <span className="text-right font-bold text-slate-700">{saleModeLabel}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Quantidade</span>
                    <span className="font-bold text-slate-700">{quantity}</span>
                  </div>
                  {product.pricing_type === 'm2' && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Dimensões</span>
                      <span className="font-bold text-slate-700">{widthCm} x {heightCm} cm</span>
                    </div>
                  )}
                  {product.pricing_type === 'linear' && (
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Metragem</span>
                      <span className="font-bold text-slate-700">{lengthCm} cm</span>
                    </div>
                  )}
                </div>

                {selectedOptions.length > 0 && (
                  <div className="mt-4 rounded-xl bg-slate-50 p-3">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Opções selecionadas</span>
                    <ul className="mt-2 space-y-1 text-[11px] font-semibold text-slate-600">
                      {selectedOptions.map((option, index) => (
                        <li key={`${option.group_name}-${option.name}-${index}`} className="flex justify-between gap-2">
                          <span>{option.group_name ? `${option.group_name}: ` : ''}{option.name}</span>
                          {option.price_delta > 0 && <span>{formatCurrency(option.price_delta)}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-xs font-bold text-slate-500">Subtotal</span>
                    <span className="text-2xl font-black text-emerald-600">{breakdown.formattedTotal}</span>
                  </div>
                  <p className="mt-1 text-right text-[11px] font-semibold text-slate-500">
                    Unitário estimado: {formatCurrency(unitPriceForCart)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/15 transition-all hover:bg-emerald-500 flex items-center justify-center gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Adicionar ao carrinho
              </button>
              <button
                type="button"
                onClick={handleAdd}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-100"
              >
                Finalizar produto
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
