import type {
  Category,
  Company,
  FinancialTransaction,
  Order,
  ProductionItem,
  Shipment
} from '@/lib/dummy-data';

const normalizeOrderNumber = (value: string) => value.replace(/ORD-\d{4}-/, 'ORD-');

export const createUnprovisionedCompany = (baseCompany: Company): Company => ({
  ...baseCompany,
  name: 'PrintFlowPRO',
  document: ''
});

export const mergeCategoriesWithStoredVisibility = (
  categories: Category[],
  storedCategories: Category[]
): Category[] => {
  const storedVisibility = new Map(storedCategories.map((category) => [category.id, category.show_in_catalog]));

  return categories.map((category) => ({
    ...category,
    show_in_catalog: category.show_in_catalog ?? storedVisibility.get(category.id) ?? true
  }));
};

export const normalizeDemoOrders = (orders: Order[]): Order[] =>
  orders.map((order) => ({
    ...order,
    number: normalizeOrderNumber(order.number)
  }));

export const normalizeDemoProduction = (production: ProductionItem[]): ProductionItem[] =>
  production.map((item) => ({
    ...item,
    order_number: normalizeOrderNumber(item.order_number)
  }));

export const normalizeDemoFinancial = (financial: FinancialTransaction[]): FinancialTransaction[] =>
  financial.map((transaction) => ({
    ...transaction,
    order_number: transaction.order_number ? normalizeOrderNumber(transaction.order_number) : undefined,
    description: normalizeOrderNumber(transaction.description)
  }));

export const normalizeDemoShipments = (shipments: Shipment[]): Shipment[] =>
  shipments.map((shipment) => ({
    ...shipment,
    order_number: normalizeOrderNumber(shipment.order_number)
  }));
