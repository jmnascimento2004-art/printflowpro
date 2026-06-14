import type { Product } from './dummy-data';

export type PricingType = Product['pricing_type'];

export interface PricingConfig {
  quantity?: number | string | null;
  width?: number | string | null;
  height?: number | string | null;
  length?: number | string | null;
  selectedVariant?: string | null;
  selectedColor?: string | null;
  customOptions?: Record<string, unknown> | null;
}

export interface NormalizedPricingConfig {
  quantity: number;
  width: number;
  height: number;
  length: number;
  selectedVariant?: string;
  selectedColor?: string;
  customOptions?: Record<string, unknown>;
}

export interface PriceBreakdown {
  unitPrice: number;
  quantity: number;
  area: number;
  length: number;
  subtotal: number;
  pricingType: PricingType;
  appliedVolumePrice: number | null;
  formattedTotal: string;
  formattedUnitPrice: string;
}

type ProductLike = Partial<Product> & {
  sales_price?: number | string | null;
  base_cost?: number | string | null;
  pricing_type?: PricingType | string | null;
  volume_pricing?: unknown;
};

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

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

export function getProductUnitPrice(product: ProductLike | null | undefined, quantity = 1): number {
  if (!product) return 0;

  const salesPrice = toFiniteNumber(product.sales_price, NaN);
  const fallbackPrice = Number.isFinite(salesPrice)
    ? salesPrice
    : toFiniteNumber(product.base_cost, 0);

  const safeQuantity = Math.max(1, toFiniteNumber(quantity, 1));
  const tiers = Array.isArray(product.volume_pricing) ? product.volume_pricing : [];
  if (tiers.length === 0) return fallbackPrice;

  const sortedTiers = tiers
    .map((tier) => ({
      min_qty: Math.max(0, toFiniteNumber((tier as { min_qty?: unknown }).min_qty, 0)),
      price: toFiniteNumber((tier as { price?: unknown }).price, fallbackPrice)
    }))
    .filter((tier) => tier.min_qty > 0 && tier.price >= 0)
    .sort((a, b) => b.min_qty - a.min_qty);

  const matchingTier = sortedTiers.find((tier) => safeQuantity >= tier.min_qty);
  return matchingTier ? matchingTier.price : fallbackPrice;
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
  const subtotal = roundMoney(unitPrice * multiplier * normalized.quantity);
  const baseUnitPrice = getProductUnitPrice(product, 1);
  const appliedVolumePrice = unitPrice !== baseUnitPrice ? unitPrice : null;

  return {
    unitPrice,
    quantity: normalized.quantity,
    area,
    length,
    subtotal,
    pricingType,
    appliedVolumePrice,
    formattedTotal: formatCurrency(subtotal),
    formattedUnitPrice: formatCurrency(unitPrice)
  };
}
