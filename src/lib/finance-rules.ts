import type { FinancialTransaction, Order } from '@/lib/dummy-data';
import { isActiveOrder, isFinanciallyActiveOrder, normalizeStatus } from '@/lib/order-status';

type TransactionLike = Partial<FinancialTransaction> & {
  amount?: unknown;
  status?: unknown;
  cancelled_at?: unknown;
  reversed_at?: unknown;
  metadata?: {
    cancelled_at?: unknown;
    reversed_at?: unknown;
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
  'refunded'
]);

export const normalizeFinanceStatus = normalizeStatus;

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
    metadata.reversed_at ? 'estornado' : ''
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
  normalizeFinanceStatus(transaction?.type) === 'receita' &&
  normalizeFinanceStatus(transaction?.status) === 'pago';

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
  return dedupeTransactionsById(transactions);
};

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
  transactions: FinancialTransaction[]
): FinancialTransaction[] =>
  dedupeFinancialTransactions(transactions).filter((transaction) =>
    transaction.order_id === orderId &&
    isActivePaymentTransaction(transaction)
  );

export const calculateOrderPaidAmount = (
  order: Order,
  transactions: FinancialTransaction[]
): number =>
  getActivePaymentsForOrder(order.id, transactions)
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
