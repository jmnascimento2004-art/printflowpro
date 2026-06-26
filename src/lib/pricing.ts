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

export interface CatalogPricePresentation {
  hasVolumeTiers: boolean;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  tier: NormalizedVolumePriceTier | null;
}

type ProductLike = Partial<Product> & {
  sales_price?: number | string | null;
  base_cost?: number | string | null;
  pricing_type?: PricingType | string | null;
  volume_pricing?: unknown;
  pricing_details?: {
    configurator_options?: ProductConfiguratorSettings | null;
  } | null;
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

export function getNormalizedVolumePricing(product: ProductLike | null | undefined): NormalizedVolumePriceTier[] {
  const salesPrice = toFiniteNumber(product?.sales_price, NaN);
  const fallbackPrice = Number.isFinite(salesPrice)
    ? salesPrice
    : toFiniteNumber(product?.base_cost, 0);
  const tiers = Array.isArray(product?.volume_pricing) ? product.volume_pricing : [];

  return tiers
    .map((tier) => {
      const minQty = Math.max(0, toFiniteNumber((tier as { min_qty?: unknown }).min_qty, 0));
      const price = toFiniteNumber((tier as { price?: unknown }).price, fallbackPrice);
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
  const configurator = product?.pricing_details?.configurator_options;
  return configurator && hasConfiguratorContent(configurator) ? configurator : null;
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
    formattedUnitPrice: formatCurrency(unitPrice)
  };
}
