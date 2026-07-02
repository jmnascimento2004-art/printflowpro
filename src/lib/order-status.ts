import type { Order } from '@/lib/dummy-data';

type OrderStatusLike = Partial<Order> & {
  status?: unknown;
  operational_status?: unknown;
  order_status?: unknown;
  cancelled_at?: unknown;
};

const CANCELLED_STATUS_MARKERS = new Set([
  'cancelado',
  'cancelada',
  'cancelled',
  'canceled'
]);

const PRODUCTION_ACTIVE_ORDER_STATUSES: Order['status'][] = ['producao', 'impressao', 'acabamento'];

export const normalizeStatus = (value: unknown): string =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const isCancelledOrder = (order?: OrderStatusLike | null): boolean => {
  if (!order) return false;

  const values = [
    order.status,
    order.operational_status,
    order.order_status,
    order.cancelled_at ? 'cancelado' : ''
  ].map(normalizeStatus);

  return values.some((status) =>
    CANCELLED_STATUS_MARKERS.has(status) || status.includes('cancel')
  );
};

export const isActiveOrder = (order?: OrderStatusLike | null): boolean => !isCancelledOrder(order);

export const isProductionActiveOrder = (order?: OrderStatusLike | null): boolean =>
  isActiveOrder(order) && PRODUCTION_ACTIVE_ORDER_STATUSES.includes(normalizeStatus(order?.status) as Order['status']);
