import type { OrderItem, QuoteItem } from './dummy-data';

export type CommercialDeliveryTime = {
  label: string;
  businessDays: number | null;
  source: 'item_snapshot' | 'fallback';
  isComplete?: boolean;
};

export function parseBusinessDays(value: unknown): number | null;
export function getItemDeliveryTimeSnapshot(item: OrderItem | QuoteItem): CommercialDeliveryTime;
export function resolveOrderDeliveryTime(items: Array<OrderItem | QuoteItem>): CommercialDeliveryTime & { isComplete: boolean };
export const ORDER_DELIVERY_TIME_FALLBACK: 'Prazo sob consulta';
