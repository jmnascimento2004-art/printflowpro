import type { Customer, FinancialTransaction, Order } from '@/lib/dummy-data';
import { areOrderNumbersEquivalent, formatOrderDisplayNumber } from '@/lib/order-number';
import { isActiveOrder, isFinanciallyActiveOrder, normalizeStatus } from '@/lib/order-status';

export type InvoicedReceivableRow = FinancialTransaction & {
  is_virtual?: true;
  source?: 'order_receivable';
};

type TransactionLike = Partial<FinancialTransaction> & {
  amount?: unknown;
  type?: unknown;
  status?: unknown;
  cancelled_at?: unknown;
  reversed_at?: unknown;
  metadata?: {
    cancelled_at?: unknown;
    reversed_at?: unknown;
    duplicate_of?: unknown;
    ignored?: unknown;
  } | null;
};

const CANCELLED_TRANSACTION_MARKERS = new Set([
  'cancelado',
  'cancelada',
  'cancelled',
  'canceled',
  'estornado',
  'estornada',
  'reversed',
  'void',
  'voided',
  'refunded',
  'duplicado',
  'duplicada',
  'duplicated',
  'duplicate',
  'ignorado',
  'ignorada',
  'ignored'
]);

const INCOME_TRANSACTION_MARKERS = new Set([
  'receita',
  'entrada',
  'income',
  'payment',
  'pagamento'
]);

const PAID_TRANSACTION_MARKERS = new Set([
  'pago',
  'paid',
  'confirmado',
  'confirmed',
  'recebido',
  'received'
]);

export const normalizeFinanceStatus = normalizeStatus;

const getRecordValue = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
};

const isTruthyFlag = (value: unknown): boolean =>
  value === true ||
  value === 1 ||
  ['true', '1', 'sim', 'yes', 'enabled', 'habilitado', 'ativo'].includes(normalizeFinanceStatus(value));

export const isB2BInvoicedCustomer = (customer?: Customer | null): boolean => {
  if (!customer) return false;

  const details = getRecordValue(customer, 'details') || customer.corporate_additional_info;
  const metadata = getRecordValue(customer, 'metadata');
  const billing = [
    customer.billing_type,
    getRecordValue(details, 'billing_type'),
    getRecordValue(metadata, 'billing_type'),
    getRecordValue(details, 'payment_mode'),
    getRecordValue(metadata, 'payment_mode')
  ].map(normalizeFinanceStatus);

  return (
    billing.some((value) => value === 'faturado' || value === 'invoiced') ||
    isTruthyFlag(getRecordValue(details, 'b2b_enabled')) ||
    isTruthyFlag(getRecordValue(metadata, 'b2b_enabled'))
  );
};

export const isCancelledTransaction = (transaction?: TransactionLike | null): boolean => {
  if (!transaction) return false;

  const metadata = transaction.metadata && typeof transaction.metadata === 'object'
    ? transaction.metadata
    : {};

  const values = [
    transaction.status,
    transaction.cancelled_at ? 'cancelado' : '',
    transaction.reversed_at ? 'estornado' : '',
    metadata.cancelled_at ? 'cancelado' : '',
    metadata.reversed_at ? 'estornado' : '',
    metadata.duplicate_of ? 'duplicado' : '',
    metadata.ignored === true ? 'ignorado' : ''
  ].map(normalizeFinanceStatus);

  return values.some((status) =>
    CANCELLED_TRANSACTION_MARKERS.has(status) ||
    status.includes('cancel') ||
    status.includes('estorn')
  );
};

export const isActiveFinancialTransaction = (
  transaction?: TransactionLike | null,
  order?: Order | null
): boolean => {
  if (!transaction || isCancelledTransaction(transaction)) return false;
  if (order && !isFinanciallyActiveOrder(order)) return false;
  return Number(transaction.amount || 0) > 0;
};

export const getTransactionOrderId = (transaction?: TransactionLike | null): string =>
  normalizeFinanceStatus(transaction?.order_id || transaction?.order_number);

export const isActivePaymentTransaction = (
  transaction?: TransactionLike | null,
  order?: Order | null
): boolean =>
  isActiveFinancialTransaction(transaction, order) &&
  INCOME_TRANSACTION_MARKERS.has(normalizeFinanceStatus(transaction?.type)) &&
  PAID_TRANSACTION_MARKERS.has(normalizeFinanceStatus(transaction?.status));

export const isExpenseTransaction = (
  transaction?: TransactionLike | null,
  order?: Order | null
): boolean =>
  isActiveFinancialTransaction(transaction, order) &&
  normalizeFinanceStatus(transaction?.type) === 'despesa';

const buildFallbackTransactionKey = (transaction: TransactionLike) => [
  normalizeFinanceStatus(transaction.order_id),
  normalizeFinanceStatus(transaction.order_number),
  Number(transaction.amount || 0).toFixed(2),
  normalizeFinanceStatus(transaction.paid_at || transaction.due_date || transaction.created_at),
  normalizeFinanceStatus(transaction.description),
  normalizeFinanceStatus(transaction.payment_method),
  normalizeFinanceStatus(transaction.status)
].join('|');

export const dedupeTransactionsById = <T extends TransactionLike>(transactions: T[]): T[] => {
  const seen = new Set<string>();

  return transactions.filter((transaction, index) => {
    const key = transaction.id
      ? `id:${transaction.id}`
      : `fallback:${buildFallbackTransactionKey(transaction) || index}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const dedupeFinancialTransactions = <T extends TransactionLike>(transactions: T[]): T[] => {
  const seen = new Set<string>();

  return dedupeTransactionsById(transactions).filter((transaction, index) => {
    const key = buildFallbackTransactionKey(transaction) || `index:${index}`;

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getActivePaymentTransactions = <T extends TransactionLike>(
  transactions: T[],
  order?: Order | null
): T[] =>
  dedupeFinancialTransactions(transactions).filter((transaction) =>
    isActivePaymentTransaction(transaction, order)
  );

type FindOrderForTransaction = (transaction: FinancialTransaction) => Order | undefined;
type PeriodPredicate = (transaction: FinancialTransaction) => boolean;

export const calculateActiveCashBalance = (
  transactions: FinancialTransaction[],
  findOrderForTransaction: FindOrderForTransaction
): number =>
  dedupeFinancialTransactions(transactions).reduce((sum, transaction) => {
    const order = findOrderForTransaction(transaction);
    if (isActivePaymentTransaction(transaction, order)) return sum + Number(transaction.amount || 0);
    if (isExpenseTransaction(transaction, order) && normalizeFinanceStatus(transaction.status) === 'pago') {
      return sum - Number(transaction.amount || 0);
    }
    return sum;
  }, 0);

export const calculatePeriodRevenue = (
  transactions: FinancialTransaction[],
  isInPeriod: PeriodPredicate,
  findOrderForTransaction: FindOrderForTransaction
): number =>
  dedupeFinancialTransactions(transactions)
    .filter(isInPeriod)
    .filter((transaction) => isActivePaymentTransaction(transaction, findOrderForTransaction(transaction)))
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

export const calculatePeriodExpenses = (
  transactions: FinancialTransaction[],
  isInPeriod: PeriodPredicate,
  findOrderForTransaction: FindOrderForTransaction
): number =>
  dedupeFinancialTransactions(transactions)
    .filter(isInPeriod)
    .filter((transaction) =>
      isExpenseTransaction(transaction, findOrderForTransaction(transaction)) &&
      normalizeFinanceStatus(transaction.status) === 'pago'
    )
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

export const calculateAccountsReceivable = (
  activeOrders: Order[],
  transactions: FinancialTransaction[]
): number =>
  activeOrders
    .filter(isActiveOrder)
    .reduce((sum, order) => sum + calculateOrderBalance(order, transactions), 0);

export const getActivePaymentsForOrder = (
  orderId: string,
  transactions: FinancialTransaction[],
  orderNumber?: string,
  order?: Order | null
): FinancialTransaction[] =>
  getActivePaymentTransactions(transactions, order).filter((transaction) =>
    transaction.order_id === orderId || areOrderNumbersEquivalent(transaction.order_number, orderNumber)
  );

export const calculateOrderPaidAmount = (
  order: Order,
  transactions: FinancialTransaction[]
): number =>
  getActivePaymentsForOrder(order.id, transactions, order.number, order)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);

export const calculateOrderBalance = (
  order: Order,
  transactions: FinancialTransaction[]
): number => {
  if (!isFinanciallyActiveOrder(order)) return 0;

  const paidFromTransactions = calculateOrderPaidAmount(order, transactions);
  const paid = Math.max(Number(order.paid_amount || 0), paidFromTransactions);
  return Math.max(0, Number(order.total_amount || 0) - paid);
};

export const getOrderReceivableBalance = (
  order: Order,
  transactions: FinancialTransaction[]
): number => calculateOrderBalance(order, transactions);

const findCustomerForOrder = (order: Order, customers: Customer[]): Customer | undefined =>
  customers.find((customer) =>
    customer.id === order.customer_id ||
    normalizeFinanceStatus(customer.name) === normalizeFinanceStatus(order.customer_name)
  );

const hasPendingInvoicedTransaction = (
  order: Order,
  transactions: FinancialTransaction[]
): boolean =>
  dedupeFinancialTransactions(transactions).some((transaction) =>
    isActiveFinancialTransaction(transaction, order) &&
    normalizeFinanceStatus(transaction.type) === 'receita' &&
    normalizeFinanceStatus(transaction.payment_method) === 'faturado' &&
    normalizeFinanceStatus(transaction.status) === 'pendente' &&
    (transaction.order_id === order.id || areOrderNumbersEquivalent(transaction.order_number, order.number))
  );

export const isB2BInvoicedOrder = (
  order: Order,
  customer: Customer | undefined,
  transactions: FinancialTransaction[] = []
): boolean => {
  if (!isActiveOrder(order)) return false;

  const orderRecord = order as Order & {
    payment_method?: unknown;
    billing_type?: unknown;
    details?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  };
  const orderBilling = [
    orderRecord.payment_method,
    orderRecord.billing_type,
    getRecordValue(orderRecord.details, 'payment_method'),
    getRecordValue(orderRecord.details, 'billing_type'),
    getRecordValue(orderRecord.metadata, 'payment_method'),
    getRecordValue(orderRecord.metadata, 'billing_type')
  ].map(normalizeFinanceStatus);

  const isInvoiced =
    isB2BInvoicedCustomer(customer) ||
    orderBilling.some((value) => value === 'faturado' || value === 'invoiced');

  return isInvoiced && getOrderReceivableBalance(order, transactions) > 0;
};

const addDays = (dateLike: string | undefined, days: number): string => {
  const base = dateLike ? new Date(dateLike) : new Date();
  if (Number.isNaN(base.getTime())) return new Date().toISOString().split('T')[0];

  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().split('T')[0];
};

export const buildInvoicedReceivableRows = (
  orders: Order[],
  customers: Customer[],
  transactions: FinancialTransaction[]
): InvoicedReceivableRow[] =>
  orders
    .filter(isActiveOrder)
    .flatMap((order) => {
      const customer = findCustomerForOrder(order, customers);
      if (!isB2BInvoicedOrder(order, customer, transactions)) return [];
      if (hasPendingInvoicedTransaction(order, transactions)) return [];

      const balance = getOrderReceivableBalance(order, transactions);
      if (balance <= 0) return [];

      const termsDays = Math.max(1, Number(customer?.payment_terms_days || 30));

      return [{
        id: `virtual-invoiced-${order.id}`,
        company_id: order.company_id,
        order_id: order.id,
        order_number: order.number,
        type: 'receita' as const,
        category: 'Vendas',
        amount: balance,
        description: `Pedido faturado ${formatOrderDisplayNumber(order.number)}`,
        payment_method: 'faturado' as const,
        status: 'pendente' as const,
        due_date: addDays(order.created_at, termsDays),
        created_at: order.created_at,
        is_virtual: true as const,
        source: 'order_receivable' as const
      }];
    });
