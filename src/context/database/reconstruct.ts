import type { Order, OrderItem, Quote, QuoteItem } from '@/lib/dummy-data';

export type QuoteItemRow = QuoteItem & { quote_id: string };
export type OrderItemRow = OrderItem & { order_id: string };

export const reconstructQuotesWithItems = (quotes: Quote[], quoteItems: QuoteItemRow[]): Quote[] =>
  quotes.map((quote) => ({
    ...quote,
    items: quoteItems.filter((item) => item.quote_id === quote.id)
  }));

export const reconstructOrdersWithItems = (orders: Order[], orderItems: OrderItemRow[]): Order[] =>
  orders.map((order) => ({
    ...order,
    items: orderItems.filter((item) => item.order_id === order.id)
  }));
