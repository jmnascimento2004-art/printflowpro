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
  MessageCircle,
  X
} from 'lucide-react';
import type { Product, ProductConfiguratorSettings, ProductSaleMode } from '@/lib/dummy-data';
import {
  formatCurrency,
  formatUnitCurrency,
  findVariantPricingMatrixRow,
  getInitialVolumePricingTier,
  getNormalizedVolumePricing,
  getNormalizedVariantPricingMatrix,
  getPriceBreakdown,
  getProductConfigurator,
  getVariantPricingOptions,
  type NormalizedVolumePriceTier,
  type PricingSelectedOption
} from '@/lib/pricing';
import { sanitizeProductDescription, stripRichTextHtml } from '@/lib/utils';

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
  sale_mode?: ProductSaleMode;
  sale_mode_label?: string;
  configuration_summary: string;
}

interface ProductConfiguratorModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onAddToCart: (payload: ProductConfiguratorCartPayload) => void;
  onRequestWhatsApp?: (payload: ProductConfiguratorCartPayload) => void;
  categoryName?: string;
}

const saleModeLabels: Record<ProductSaleMode, string> = {
  unidade: 'Unidade simples',
  volume: 'Preco por quantidade',
  m2: 'Metro quadrado',
  linear: 'Metro linear',
  width_height: 'Largura x Altura',
  pacote: 'Pacote / Kit',
  kit: 'Pacote / Kit',
  size_grid: 'Grade de tamanhos',
  custom: 'Produto personalizado'
};

const supportedSaleModes = new Set<ProductSaleMode>(['unidade', 'volume', 'm2', 'linear', 'pacote', 'kit', 'size_grid']);
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
  onRequestWhatsApp,
  categoryName
}: ProductConfiguratorModalProps) {
  const savedConfigurator = getProductConfigurator(product);
  const initialVolumeTier = useMemo(() => getInitialVolumePricingTier(product), [product]);
  const volumeTiers = useMemo(() => getNormalizedVolumePricing(product), [product]);
  const configurator = useMemo<ProductConfiguratorSettings>(() => {
    return savedConfigurator || {
      sale_mode: initialVolumeTier ? 'volume' : (product?.pricing_type || 'unidade') as ProductSaleMode,
      min_quantity: initialVolumeTier?.min_qty || 1,
      option_groups: [],
      size_options: []
    };
  }, [product, savedConfigurator, initialVolumeTier]);
  const savedSaleMode = (configurator?.sale_mode || product?.pricing_type || 'unidade') as ProductSaleMode;
  const saleMode = savedSaleMode === 'unidade' && initialVolumeTier ? 'volume' : savedSaleMode;
  const optionGroups = useMemo(() => configurator?.option_groups || [], [configurator]);
  const sizeOptions = useMemo(() => configurator?.size_options || [], [configurator]);
  const shouldShowSizeGrid = saleMode === 'size_grid' || hasRealSizeConfiguration(sizeOptions);
  const variantPricingRows = useMemo(() => getNormalizedVariantPricingMatrix(product), [product]);
  const hasVariantPricingMatrix = saleMode === 'volume' && variantPricingRows.length > 0;

  const [quantity, setQuantity] = useState(1);
  const [widthCm, setWidthCm] = useState(100);
  const [heightCm, setHeightCm] = useState(100);
  const [lengthCm, setLengthCm] = useState(100);
  const [selectedOptionsByGroup, setSelectedOptionsByGroup] = useState<Record<string, string[]>>({});
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedVariant, setSelectedVariant] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState('');
  const [selectedMatrixSize, setSelectedMatrixSize] = useState('');
  const [selectedMatrixColors, setSelectedMatrixColors] = useState('');
  const [selectedFinishing, setSelectedFinishing] = useState('');

  useEffect(() => {
    if (!isOpen || !product) return;

    const initialQuantity = Math.max(
      1,
      (saleMode === 'volume' ? initialVolumeTier?.min_qty : configurator?.min_quantity) ||
      configurator?.min_quantity ||
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
    const firstMatrixRow = variantPricingRows[0];
    setSelectedMaterial(firstMatrixRow?.material || '');
    setSelectedMatrixSize(firstMatrixRow?.size || '');
    setSelectedMatrixColors(firstMatrixRow?.colors || '');
    setSelectedFinishing(firstMatrixRow?.finishing || '');
  }, [isOpen, product, configurator, optionGroups, sizeOptions, shouldShowSizeGrid, initialVolumeTier, saleMode, variantPricingRows]);

  const matrixSelection = useMemo(() => ({
    material: selectedMaterial,
    size: selectedMatrixSize,
    colors: selectedMatrixColors,
    finishing: selectedFinishing
  }), [selectedMaterial, selectedMatrixSize, selectedMatrixColors, selectedFinishing]);

  const selectedMatrixRow = useMemo(() => {
    return hasVariantPricingMatrix
      ? findVariantPricingMatrixRow(variantPricingRows, matrixSelection)
      : null;
  }, [hasVariantPricingMatrix, variantPricingRows, matrixSelection]);

  const effectiveVolumeTiers: NormalizedVolumePriceTier[] = useMemo(() => {
    return hasVariantPricingMatrix
      ? selectedMatrixRow?.tiers || []
      : volumeTiers;
  }, [hasVariantPricingMatrix, selectedMatrixRow, volumeTiers]);
  const hasVolumePricing = saleMode === 'volume' && effectiveVolumeTiers.length > 0;

  useEffect(() => {
    if (!isOpen || !hasVolumePricing) return;

    const isValidTierQuantity = effectiveVolumeTiers.some((tier) => tier.min_qty === quantity);
    if (!isValidTierQuantity) {
      setQuantity(effectiveVolumeTiers[0].min_qty);
    }
  }, [isOpen, hasVolumePricing, quantity, effectiveVolumeTiers]);

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
    const matrixSelectionOptions = hasVariantPricingMatrix
      ? [
          selectedMaterial ? { name: selectedMaterial, option_name: selectedMaterial, price_delta: 0, additional_days: 0, group_name: 'Material' } : null,
          selectedMatrixSize ? { name: selectedMatrixSize, option_name: selectedMatrixSize, price_delta: 0, additional_days: 0, group_name: 'Tamanho' } : null,
          selectedMatrixColors ? { name: selectedMatrixColors, option_name: selectedMatrixColors, price_delta: 0, additional_days: 0, group_name: 'Cores' } : null,
          selectedFinishing ? { name: selectedFinishing, option_name: selectedFinishing, price_delta: 0, additional_days: 0, group_name: 'Acabamento' } : null
        ].filter(Boolean) as Array<{ name: string; option_name: string; price_delta: number; additional_days: number; group_name: string }>
      : [];

    return [
      ...groupOptions,
      ...matrixSelectionOptions,
      ...sizeSelection,
      ...variantSelection,
      ...colorSelection
    ];
  }, [optionGroups, selectedOptionsByGroup, selectedSize, selectedVariant, selectedColor, sizeOptions, shouldShowSizeGrid, hasVariantPricingMatrix, selectedMaterial, selectedMatrixSize, selectedMatrixColors, selectedFinishing]);

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
  const selectedVolumeTier = hasVolumePricing
    ? effectiveVolumeTiers.find((tier) => tier.min_qty === quantity) || effectiveVolumeTiers[0]
    : null;
  const configuredQuantity = selectedVolumeTier?.min_qty || quantity;
  const productDescription = useMemo(
    () => sanitizeProductDescription(product?.description || ''),
    [product?.description]
  );
  const hasProductDescription = stripRichTextHtml(productDescription).length > 0;

  const breakdown = useMemo(() => {
    return getPriceBreakdown(product, {
      quantity: configuredQuantity,
      width,
      height,
      length,
      selectedVariant,
      selectedColor,
      customOptions: {
        selectedOptions: selectedPricingOptions
      }
    });
  }, [product, configuredQuantity, width, height, length, selectedVariant, selectedColor, selectedPricingOptions]);

  if (!isOpen || !product) return null;

  const additionalDays = selectedOptions.reduce((sum, option) => {
    return sum + toPositiveNumber(option.additional_days, 0);
  }, 0);

  const saleModeLabel = saleModeLabels[saleMode] || 'Produto configurável';
  const isUnsupportedMode = !supportedSaleModes.has(saleMode);
  const subtotalForCart = selectedVolumeTier ? selectedVolumeTier.total : breakdown.subtotal;
  const unitPriceForCart = selectedVolumeTier
    ? selectedVolumeTier.price
    : breakdown.quantity > 0 ? breakdown.subtotal / breakdown.quantity : 0;
  const formattedSubtotal = formatCurrency(subtotalForCart);
  const isConfigurationUnavailable = hasVariantPricingMatrix && !selectedMatrixRow;
  const dimensions = {
    width: product.pricing_type === 'm2' ? width : undefined,
    height: product.pricing_type === 'm2' ? height : undefined,
    length: product.pricing_type === 'linear' ? length : undefined
  };
  const configurationSummary = [
    `Tipo: ${saleModeLabel}`,
    `Quantidade: ${configuredQuantity}`,
    product.pricing_type === 'm2' ? `Medidas: ${widthCm}cm x ${heightCm}cm` : '',
    product.pricing_type === 'linear' ? `Metragem: ${lengthCm}cm` : '',
    summarizeOptions(selectedOptions)
  ].filter(Boolean).join(' | ');
  const matrixMaterialOptions = getVariantPricingOptions(variantPricingRows, 'material');
  const matrixSizeOptions = getVariantPricingOptions(variantPricingRows, 'size', { material: selectedMaterial });
  const matrixColorOptions = getVariantPricingOptions(variantPricingRows, 'colors', { material: selectedMaterial, size: selectedMatrixSize });
  const matrixFinishingOptions = getVariantPricingOptions(variantPricingRows, 'finishing', matrixSelection);
  const matrixOptionGroups = [
    { label: 'Material', value: selectedMaterial, options: matrixMaterialOptions, onSelect: setSelectedMaterial },
    { label: 'Tamanho', value: selectedMatrixSize, options: matrixSizeOptions, onSelect: setSelectedMatrixSize },
    { label: 'Cores', value: selectedMatrixColors, options: matrixColorOptions, onSelect: setSelectedMatrixColors },
    { label: 'Acabamento', value: selectedFinishing, options: matrixFinishingOptions, onSelect: setSelectedFinishing }
  ].filter((group) => group.options.length > 0);

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

  const buildPayload = (): ProductConfiguratorCartPayload => ({
      product,
      product_id: product.id,
      product_name: product.name,
      quantity: breakdown.quantity,
      unit_price: unitPriceForCart,
      total_price: subtotalForCart,
      selected_options: selectedOptions,
      dimensions,
      pricing_type: product.pricing_type,
      production_days: additionalDays,
      sale_mode: saleMode,
      sale_mode_label: saleModeLabel,
      configuration_summary: configurationSummary
  });

  const handleAdd = () => {
    if (isConfigurationUnavailable) return;
    onAddToCart(buildPayload());
  };

  const handleWhatsAppRequest = () => {
    if (isConfigurationUnavailable) return;
    onRequestWhatsApp?.(buildPayload());
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
                  <p className="mt-1 text-xs text-slate-500">
                    {hasVolumePricing
                      ? 'Escolha uma tiragem cadastrada para este produto.'
                      : 'Informe quantidade e medidas necessárias para este produto.'}
                  </p>
                </div>
                <Layers3 className="h-5 w-5 text-emerald-600" />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {hasVolumePricing ? (
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Quantidade</span>
                    <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm font-black text-emerald-700">
                      {configuredQuantity} un
                    </div>
                  </div>
                ) : (
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
                )}

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

            {hasProductDescription && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Descrição do produto</h3>
                <div
                  className="rich-text-description mt-2 text-xs font-medium leading-relaxed text-slate-600"
                  dangerouslySetInnerHTML={{ __html: productDescription }}
                />
              </section>
            )}

            {hasVariantPricingMatrix && (
              <section className="rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Configure seu produto</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Escolha a combinação cadastrada pela gráfica para ver as tiragens e preços disponíveis.
                  </p>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {matrixOptionGroups.map((group) => (
                    <div key={group.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{group.label}</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {group.options.map((option) => {
                          const selected = group.value === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => group.onSelect(option)}
                              className={`rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                                selected
                                  ? 'border-emerald-600 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-600/10'
                                  : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {!selectedMatrixRow && (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    Essa combinação não possui preço cadastrado. Escolha outra opção.
                  </div>
                )}
              </section>
            )}

            {hasVolumePricing && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-900">Faixas de quantidade</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Este produto é vendido por tiragem. Escolha uma das quantidades disponíveis cadastradas pela gráfica.
                    </p>
                  </div>
                  <Tag className="h-5 w-5 text-emerald-600" />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {effectiveVolumeTiers.map((tier) => {
                    const selected = configuredQuantity === tier.min_qty;
                    return (
                      <button
                        key={tier.min_qty}
                        type="button"
                        onClick={() => setQuantity(tier.min_qty)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          selected
                            ? 'border-emerald-600 bg-white text-slate-900 ring-2 ring-emerald-600/10'
                            : 'border-emerald-200 bg-white/80 text-slate-700 hover:border-emerald-500'
                        }`}
                      >
                        <span className="block text-[10px] font-black uppercase tracking-wide text-slate-500">
                          A partir de {tier.min_qty} un
                        </span>
                        <span className="mt-1 block text-sm font-black text-emerald-700">
                          {formatUnitCurrency(tier.price)} /un
                        </span>
                        <span className="mt-0.5 block text-[11px] font-bold text-slate-500">
                          {formatCurrency(tier.total)} total
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

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
                    <span className="font-bold text-slate-700">{configuredQuantity}</span>
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
                    <span className="text-2xl font-black text-emerald-600">{formattedSubtotal}</span>
                  </div>
                  <p className="mt-1 text-right text-[11px] font-semibold text-slate-500">
                    Unitário estimado: {saleMode === 'volume' ? formatUnitCurrency(unitPriceForCart) : formatCurrency(unitPriceForCart)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={isConfigurationUnavailable}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-emerald-600/15 transition-all hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none flex items-center justify-center gap-2"
              >
                <ShoppingCart className="h-4 w-4" />
                Adicionar ao carrinho
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={isConfigurationUnavailable}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              >
                Finalizar produto
              </button>
              <button
                type="button"
                onClick={handleWhatsAppRequest}
                disabled={isConfigurationUnavailable}
                className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 transition-all hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 flex items-center justify-center gap-2"
              >
                <MessageCircle className="h-4 w-4" />
                Solicitar pelo WhatsApp
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
