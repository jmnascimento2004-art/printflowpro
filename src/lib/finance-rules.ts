import type { FinancialTransaction, Order } from '@/lib/dummy-data';
import { isFinanciallyActiveOrder, normalizeStatus } from '@/lib/order-status';

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

const getTransactionTime = (value: unknown): number => {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : 0;
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

const buildOperationalDuplicateKey = (transaction: TransactionLike) => [
  normalizeFinanceStatus(transaction.order_id),
  normalizeFinanceStatus(transaction.order_number),
  normalizeFinanceStatus(transaction.type),
  normalizeFinanceStatus(transaction.status),
  Number(transaction.amount || 0).toFixed(2),
  normalizeFinanceStatus(transaction.description),
  normalizeFinanceStatus(transaction.payment_method),
  normalizeFinanceStatus(transaction.paid_at || transaction.due_date)
].join('|');

export const dedupeFinancialTransactions = <T extends TransactionLike>(transactions: T[]): T[] => {
  const byId = dedupeTransactionsById(transactions);
  const grouped = new Map<string, T[]>();

  byId.forEach((transaction) => {
    const key = buildOperationalDuplicateKey(transaction);
    const current = grouped.get(key) || [];
    current.push(transaction);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).flatMap((group) => {
    const sorted = [...group].sort((a, b) => getTransactionTime(a.created_at) - getTransactionTime(b.created_at));
    const kept: T[] = [];

    sorted.forEach((transaction) => {
      const createdAt = getTransactionTime(transaction.created_at);
      const isNearDuplicate = kept.some((keptTransaction) => {
        const keptCreatedAt = getTransactionTime(keptTransaction.created_at);
        return createdAt > 0 && keptCreatedAt > 0 && Math.abs(createdAt - keptCreatedAt) <= 2000;
      });

      if (!isNearDuplicate) kept.push(transaction);
    });

    return kept;
  });
};

export const getActivePaymentsForOrder = (
  orderId: string,
  transactions: FinancialTransaction[]
): FinancialTransaction[] =>
  dedupeFinancialTransactions(transactions).filter((transaction) =>
    transaction.order_id === orderId &&
    transaction.type === 'receita' &&
    transaction.status === 'pago' &&
    isActiveFinancialTransaction(transaction)
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
