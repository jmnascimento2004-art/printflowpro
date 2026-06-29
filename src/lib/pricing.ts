import type { Product, ProductConfiguratorSettings } from './dummy-data';

export type PricingType = Product['pricing_type'];

export interface PricingConfig {
  quantity?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  length?: number | string | null;
  selectedVariant?: string | null;
  selectedColor?: string | null;
  customOptions?: PricingCustomOptions | null;
}

export interface PricingSelectedOption {
  name?: string;
  option_name?: string;
  price_delta?: number | string | null;
  additional_days?: number | string | null;
}

export interface PricingCustomOptions {
  selectedOptions?: PricingSelectedOption[];
  optionSurcharge?: number | string | null;
  [key: string]: unknown;
}

export interface NormalizedPricingConfig {
  quantity: number;
  width: number;
  height: number;
  length: number;
  selectedVariant?: string;
  selectedColor?: string;
  customOptions?: PricingCustomOptions;
}

export interface PriceBreakdown {
  unitPrice: number;
  quantity: number;
  area: number;
  length: number;
  optionsTotal: number;
  subtotal: number;
  pricingType: PricingType;
  appliedVolumePrice: number | null;
  formattedTotal: string;
  formattedUnitPrice: string;
}

export interface NormalizedVolumePriceTier {
  min_qty: number;
  price: number;
  total: number;
}

export interface NormalizedVariantPricingMatrixRow {
  id: string;
  position: number;
  material: string;
  size: string;
  colors: string;
  finishing: string;
  tiers: NormalizedVolumePriceTier[];
}

export interface VariantPricingSelection {
  material?: string;
  size?: string;
  colors?: string;
  finishing?: string;
}

export interface CatalogPricePresentation {
  hasVolumeTiers: boolean;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  tier: NormalizedVolumePriceTier | null;
}

export interface ProductQuantityTierSummary {
  tiers: NormalizedVolumePriceTier[];
  source: 'volume_pricing' | 'variant_pricing_matrix' | null;
  sourceLabel: string;
  matrixRow: NormalizedVariantPricingMatrixRow | null;
}

type ProductLike = Partial<Product> & {
  sales_price?: number | string | null;
  base_cost?: number | string | null;
  pricing_type?: PricingType | string | null;
  volume_pricing?: unknown;
  variant_pricing_matrix?: unknown;
  configurator_options?: ProductConfiguratorSettings | null;
  pricing_details?: {
    configurator_options?: ProductConfiguratorSettings | null;
    variant_pricing_matrix?: unknown;
  } | string | null;
};

const normalizeTextValue = (value: unknown): string => String(value ?? '').trim();

export const normalizeCombinationKey = (value: unknown): string => {
  return normalizeTextValue(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*x\s*/g, 'x')
    .replace(/\s*cm\b/g, 'cm')
    .trim();
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = typeof value === 'number'
    ? value
    : (() => {
        const cleaned = String(value).trim().replace(/[^\d,.-]/g, '');
        return cleaned.includes(',')
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,/g, '');
      })();
  const numeric = typeof normalized === 'number' ? normalized : Number(normalized);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

const parseMaybeJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getPricingDetailsObject = (product: ProductLike | null | undefined): Record<string, unknown> => {
  const details = product?.pricing_details;
  if (!details) return {};
  if (typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }

  return details as unknown as Record<string, unknown>;
};

const getConfiguratorObject = (product: ProductLike | null | undefined): Record<string, unknown> => {
  const details = getPricingDetailsObject(product);
  const configurator = product?.configurator_options || details.configurator_options;
  return configurator && typeof configurator === 'object' ? configurator as Record<string, unknown> : {};
};

export function getNormalizedVolumePricing(product: ProductLike | null | undefined): NormalizedVolumePriceTier[] {
  const salesPrice = toFiniteNumber(product?.sales_price, NaN);
  const fallbackPrice = Number.isFinite(salesPrice)
    ? salesPrice
    : toFiniteNumber(product?.base_cost, 0);
  const tiers = parseMaybeJsonArray(product?.volume_pricing);

  return tiers
    .map((tier) => {
      const tierRecord = tier as { min_qty?: unknown; quantity?: unknown; qty?: unknown; price?: unknown; unit_price?: unknown };
      const minQty = Math.max(0, toFiniteNumber(tierRecord.min_qty ?? tierRecord.quantity ?? tierRecord.qty, 0));
      const price = toFiniteNumber(tierRecord.price ?? tierRecord.unit_price, fallbackPrice);
      return {
        min_qty: minQty,
        price,
        total: roundMoney(minQty * price)
      };
    })
    .filter((tier) => tier.min_qty > 0 && tier.price >= 0)
    .sort((a, b) => a.min_qty - b.min_qty);
}

export function getInitialVolumePricingTier(product: ProductLike | null | undefined): NormalizedVolumePriceTier | null {
  return getNormalizedVolumePricing(product)[0] || null;
}

export function sortTiersByQuantity(tiers: NormalizedVolumePriceTier[]): NormalizedVolumePriceTier[] {
  return [...tiers]
    .filter((tier) => Number.isFinite(tier.min_qty) && tier.min_qty > 0)
    .sort((a, b) => a.min_qty - b.min_qty);
}

export function getMinimumTier(tiers: NormalizedVolumePriceTier[]): NormalizedVolumePriceTier | null {
  return sortTiersByQuantity(tiers)[0] || null;
}

export function getNormalizedVariantPricingMatrix(product: ProductLike | null | undefined): NormalizedVariantPricingMatrixRow[] {
  const details = getPricingDetailsObject(product);
  const configurator = getConfiguratorObject(product);
  const matrix = parseMaybeJsonArray(
    configurator.variant_pricing_matrix ||
    details.variant_pricing_matrix ||
    product?.variant_pricing_matrix
  );

  return matrix
    .map((row, index) => {
      const rowRecord = row as {
        id?: unknown;
        material?: unknown;
        size?: unknown;
        colors?: unknown;
        finishing?: unknown;
        position?: unknown;
        sort_order?: unknown;
        tiers?: unknown;
        volume_pricing?: unknown;
      };
      const explicitPosition = toFiniteNumber(rowRecord.position ?? rowRecord.sort_order, NaN);
      const rawTiers = parseMaybeJsonArray(rowRecord.tiers || rowRecord.volume_pricing);
      const tiers = rawTiers
        .map((tier) => {
          const tierRecord = tier as { quantity?: unknown; min_qty?: unknown; qty?: unknown; total_price?: unknown; total?: unknown; unit_price?: unknown; price?: unknown };
          const quantity = Math.max(0, toFiniteNumber(tierRecord.quantity ?? tierRecord.min_qty ?? tierRecord.qty, 0));
          const explicitTotal = toFiniteNumber(tierRecord.total_price ?? tierRecord.total, NaN);
          const unitPrice = toFiniteNumber(tierRecord.unit_price ?? tierRecord.price, Number.isFinite(explicitTotal) && quantity > 0 ? explicitTotal / quantity : 0);

          return {
            min_qty: quantity,
            price: unitPrice,
            total: Number.isFinite(explicitTotal) ? roundMoney(explicitTotal) : roundMoney(quantity * unitPrice)
          };
        })
        .filter((tier) => tier.min_qty > 0 && tier.price >= 0)
        .sort((a, b) => a.min_qty - b.min_qty);

      return {
        id: normalizeTextValue(rowRecord.id) || `matrix-${index}`,
        position: Number.isFinite(explicitPosition) ? Math.max(0, explicitPosition) : index,
        material: normalizeTextValue(rowRecord.material),
        size: normalizeTextValue(rowRecord.size),
        colors: normalizeTextValue(rowRecord.colors),
        finishing: normalizeTextValue(rowRecord.finishing),
        tiers
      };
    })
    .filter((row) => row.tiers.length > 0)
    .sort((a, b) => a.position - b.position);
}

export function getProductQuantityTierSummary(product: ProductLike | null | undefined): ProductQuantityTierSummary {
  const matrixRow = getNormalizedVariantPricingMatrix(product)[0] || null;
  if (matrixRow?.tiers.length) {
    const sourceLabel = [matrixRow.material, matrixRow.size, matrixRow.colors, matrixRow.finishing]
      .filter(Boolean)
      .join(' | ');

    return {
      tiers: matrixRow.tiers,
      source: 'variant_pricing_matrix',
      sourceLabel: sourceLabel || 'Matriz de configuração',
      matrixRow
    };
  }

  const volumeTiers = getNormalizedVolumePricing(product);
  if (volumeTiers.length) {
    return {
      tiers: volumeTiers,
      source: 'volume_pricing',
      sourceLabel: 'Faixas de quantidade',
      matrixRow: null
    };
  }

  return {
    tiers: [],
    source: null,
    sourceLabel: '',
    matrixRow: null
  };
}

export function getVariantPricingOptions(
  rows: NormalizedVariantPricingMatrixRow[],
  field: keyof VariantPricingSelection,
  selection: VariantPricingSelection = {}
): string[] {
  const matches = rows.filter((row) => {
    return (field === 'material' || !selection.material || normalizeCombinationKey(row.material) === normalizeCombinationKey(selection.material)) &&
      (field === 'size' || !selection.size || normalizeCombinationKey(row.size) === normalizeCombinationKey(selection.size)) &&
      (field === 'colors' || !selection.colors || normalizeCombinationKey(row.colors) === normalizeCombinationKey(selection.colors)) &&
      (field === 'finishing' || !selection.finishing || normalizeCombinationKey(row.finishing) === normalizeCombinationKey(selection.finishing));
  });

  const options = new Map<string, string>();
  matches.forEach((row) => {
    const label = row[field];
    const key = normalizeCombinationKey(label);
    if (label && key && !options.has(key)) {
      options.set(key, label);
    }
  });

  return Array.from(options.values());
}

export function findVariantPricingMatrixRow(
  rows: NormalizedVariantPricingMatrixRow[],
  selection: VariantPricingSelection
): NormalizedVariantPricingMatrixRow | null {
  return rows.find((row) => (
    (!row.material || normalizeCombinationKey(row.material) === normalizeCombinationKey(selection.material)) &&
    (!row.size || normalizeCombinationKey(row.size) === normalizeCombinationKey(selection.size)) &&
    (!row.colors || normalizeCombinationKey(row.colors) === normalizeCombinationKey(selection.colors)) &&
    (!row.finishing || normalizeCombinationKey(row.finishing) === normalizeCombinationKey(selection.finishing))
  )) || null;
}

export function getCatalogPricePresentation(product: ProductLike | null | undefined): CatalogPricePresentation {
  const initialTier = getInitialVolumePricingTier(product);
  if (initialTier) {
    return {
      hasVolumeTiers: true,
      quantity: initialTier.min_qty,
      unitPrice: initialTier.price,
      totalPrice: initialTier.total,
      tier: initialTier
    };
  }

  const salesPrice = toFiniteNumber(product?.sales_price, NaN);
  const unitPrice = Number.isFinite(salesPrice)
    ? salesPrice
    : toFiniteNumber(product?.base_cost, 0);

  return {
    hasVolumeTiers: false,
    quantity: 1,
    unitPrice,
    totalPrice: unitPrice,
    tier: null
  };
}

const hasConfiguratorContent = (configurator: ProductConfiguratorSettings): boolean => {
  return Boolean(
    configurator.sale_mode ||
    configurator.allow_custom_measure ||
    configurator.min_width ||
    configurator.min_height ||
    configurator.max_width ||
    configurator.max_height ||
    configurator.min_area ||
    configurator.min_length ||
    configurator.kit_items?.trim() ||
    configurator.min_quantity ||
    configurator.quote_on_request ||
    configurator.customer_message?.trim() ||
    (configurator.size_options && configurator.size_options.length > 0) ||
    (configurator.option_groups && configurator.option_groups.length > 0)
  );
};

export function getProductConfigurator(product: ProductLike | null | undefined): ProductConfiguratorSettings | null {
  const configurator = getConfiguratorObject(product) as unknown as ProductConfiguratorSettings;
  return hasConfiguratorContent(configurator) ? configurator : null;
}

export function hasAdvancedConfigurator(product: ProductLike | null | undefined): boolean {
  return getProductConfigurator(product) !== null;
}

export function normalizePricingConfig(config: PricingConfig = {}): NormalizedPricingConfig {
  const quantity = Math.max(1, toFiniteNumber(config.quantity, 1));
  const width = Math.max(0, toFiniteNumber(config.width, 0));
  const height = Math.max(0, toFiniteNumber(config.height, 0));
  const fallbackLength = config.length ?? config.width;
  const length = Math.max(0, toFiniteNumber(fallbackLength, 0));

  return {
    quantity,
    width,
    height,
    length,
    selectedVariant: config.selectedVariant?.trim() || undefined,
    selectedColor: config.selectedColor?.trim() || undefined,
    customOptions: config.customOptions || undefined
  };
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatUnitCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4
  }).format(Number.isFinite(value) ? value : 0);
}

export function getProductUnitPrice(product: ProductLike | null | undefined, quantity = 1): number {
  if (!product) return 0;

  const salesPrice = toFiniteNumber(product.sales_price, NaN);
  const fallbackPrice = Number.isFinite(salesPrice)
    ? salesPrice
    : toFiniteNumber(product.base_cost, 0);

  const safeQuantity = Math.max(1, toFiniteNumber(quantity, 1));
  const tiers = getNormalizedVolumePricing(product);
  if (tiers.length === 0) return fallbackPrice;

  const sortedTiers = [...tiers].sort((a, b) => b.min_qty - a.min_qty);

  const matchingTier = sortedTiers.find((tier) => safeQuantity >= tier.min_qty);
  return matchingTier ? matchingTier.price : fallbackPrice;
}

function getOptionsSurcharge(config: NormalizedPricingConfig): number {
  const customOptions = config.customOptions;
  if (!customOptions) return 0;

  const explicitSurcharge = toFiniteNumber(customOptions.optionSurcharge, NaN);
  if (Number.isFinite(explicitSurcharge)) return Math.max(0, explicitSurcharge);

  const selectedOptions = Array.isArray(customOptions.selectedOptions)
    ? customOptions.selectedOptions
    : [];

  return selectedOptions.reduce((sum, option) => {
    return sum + Math.max(0, toFiniteNumber(option.price_delta, 0));
  }, 0);
}

export function calculateProductPrice(product: ProductLike | null | undefined, config: PricingConfig = {}): number {
  const breakdown = getPriceBreakdown(product, config);
  return breakdown.subtotal;
}

export function getPriceBreakdown(product: ProductLike | null | undefined, config: PricingConfig = {}): PriceBreakdown {
  const normalized = normalizePricingConfig(config);
  const pricingType = (product?.pricing_type || 'unidade') as PricingType;
  const unitPrice = getProductUnitPrice(product, normalized.quantity);

  const area = pricingType === 'm2' ? normalized.width * normalized.height : 0;
  const length = pricingType === 'linear' ? normalized.length : 0;
  const multiplier = pricingType === 'm2'
    ? area
    : pricingType === 'linear'
      ? length
      : 1;
  const optionsTotal = roundMoney(getOptionsSurcharge(normalized));
  const subtotal = roundMoney((unitPrice * multiplier + optionsTotal) * normalized.quantity);
  const baseUnitPrice = getProductUnitPrice(product, 1);
  const appliedVolumePrice = unitPrice !== baseUnitPrice ? unitPrice : null;

  return {
    unitPrice,
    quantity: normalized.quantity,
    area,
    length,
    optionsTotal,
    subtotal,
    pricingType,
    appliedVolumePrice,
    formattedTotal: formatCurrency(subtotal),
    formattedUnitPrice: formatUnitCurrency(unitPrice)
  };
}
