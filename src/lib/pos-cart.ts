import type { OrderItem, Product } from './dummy-data';
import { resolveProductPrice, getNormalizedVolumePricing, type PricingConfig, type ProductPriceResolution } from './pricing';

export type POSCartItem = Omit<OrderItem, 'id' | 'outsourced'> & {
  pricing_type: Product['pricing_type'];
  pricing_config: PricingConfig;
  pricing_result: ProductPriceResolution;
};

// Adapt the canonical result to the existing commercial item contract. No pricing rules here.
export function createPOSCartItem(product: Product, config: PricingConfig, details: OrderItem['details'] = {}): POSCartItem {
  const result = resolveProductPrice(product, config);
  if (!result.canPurchase) throw new Error(result.warningMessage || 'Configuração indisponível.');
  const breakdown = result.breakdown;
  return {
    product_id: product.id, product_name: product.name, pricing_type: product.pricing_type,
    quantity: breakdown.quantity, unit_price: result.unitPrice, total_price: result.totalPrice,
    pricing_config: structuredClone(config), pricing_result: result,
    details: {
      ...details, pricing_type: product.pricing_type, item_type: 'catalog',
      width: breakdown.measureBasis === 'area' ? Number(config.width) : undefined,
      height: breakdown.measureBasis === 'area' ? Number(config.height) : undefined,
      length: breakdown.measureBasis === 'length' ? breakdown.length : undefined,
      variant: config.selectedVariant || undefined, color: config.selectedColor || undefined,
      selected_options: result.selectedOptionsSnapshot,
      production_time: result.productionTime, production_time_source: result.productionTimeSource,
      pricing_snapshot: {
        dimension_unit: 'm', ...details.pricing_snapshot,
        area: breakdown.area, billable_area: breakdown.billableArea, minimum_area: breakdown.minimumArea,
        length: breakdown.length, measure_basis: breakdown.measureBasis,
        base_unit_price: breakdown.unitPrice, unit_price_basis: 'piece',
        quantity: breakdown.quantity, unit_price: result.unitPrice, total_price: result.totalPrice,
        pricing_config: structuredClone(config), pricing_result: structuredClone(result),
        discount: 0
      }
    }
  };
}

export function changePOSItemQuantity(product: Product, item: POSCartItem, direction: -1 | 1): POSCartItem {
  const tiers = item.pricing_result.matchedMatrixRow?.tiers || getNormalizedVolumePricing(product);
  const quantities = tiers.map(tier => tier.min_qty).sort((a, b) => a - b);
  const quantity = quantities.length
    ? (direction > 0 ? quantities.find(value => value > item.quantity) : quantities.filter(value => value < item.quantity).at(-1))
    : Math.max(1, item.quantity + direction);
  if (quantity === undefined || quantity === item.quantity) return item;
  const tier = tiers.find(tier => tier.min_qty === quantity);
  const config = { ...item.pricing_config, quantity, customOptions: {
    ...item.pricing_config.customOptions,
    baseSubtotal: product.pricing_type === 'm2' || product.pricing_type === 'linear' ? undefined : tier?.total
  } };
  const updated = createPOSCartItem(product, config, item.details);
  if (updated.details?.configuration_summary) {
    updated.details.configuration_summary = updated.details.configuration_summary.replace(/Quantidade: [^|]+/, `Quantidade: ${quantity} `);
  }
  if (updated.details?.configuration_snapshot) {
    updated.details.configuration_snapshot = {
      ...updated.details.configuration_snapshot, quantity_tier: quantity,
      unit_price: updated.unit_price, total_price: updated.total_price,
      display_label: `${quantity} un`, production_time: updated.pricing_result.productionTime,
      production_time_source: updated.pricing_result.productionTimeSource
    };
  }
  return updated;
}

export function posCheckoutItems(cart: POSCartItem[]): Omit<OrderItem, 'id' | 'outsourced'>[] {
  return cart.map(({ product_id, product_name, quantity, unit_price, total_price, details }) => ({
    product_id, product_name, quantity, unit_price, total_price, details: structuredClone(details)
  }));
}
