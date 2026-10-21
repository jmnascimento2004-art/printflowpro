import type { Customer, FinancialTransaction, Order, ProductionItem, Quote } from './dummy-data';
import { calculateAccountsReceivable, calculateOrderBalance, calculatePeriodRevenue, calculatePeriodExpenses, dedupeFinancialTransactions, isExpenseTransaction, normalizeFinanceStatus } from './finance-rules';
import { isActiveOrder } from './order-status';
import { areOrderNumbersEquivalent } from './order-number';

const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia', year: 'numeric', month: '2-digit', day: '2-digit' });

export const commercialDate = (value: string | Date) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dateFormatter.format(date);
};
export function periodStart(period: string, now = new Date()) {
  const today = commercialDate(now);
  if (period === 'all') return '';
  if (period === 'year') return `${today.slice(0, 4)}-01-01`;
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() - (Number(period) - 1));
  return commercialDate(date);
}
export const normalizeCustomerTags = (value: string | string[]) => Array.from(new Map(
  (Array.isArray(value) ? value : value.split(',')).map(tag => tag.trim()).filter(Boolean)
    .map(tag => [tag.toLocaleLowerCase('pt-BR'), tag.slice(0, 60)])
).values()).slice(0, 30);

export type IntelligenceInput = { orders: Order[]; financial: FinancialTransaction[]; customers: Customer[]; quotes: Quote[]; production: ProductionItem[] };
export function buildCommercialOverview(input: IntelligenceInput, days: number, now = new Date()) {
  const today = commercialDate(now), start = periodStart(String(days), now);
  const active = input.orders.filter(isActiveOrder);
  const transactions = dedupeFinancialTransactions(input.financial);
  const byId = new Map(input.orders.map(order => [order.id, order]));
  const findOrder = (entry: FinancialTransaction) => byId.get(entry.order_id || '') || input.orders.find(order => areOrderNumbersEquivalent(entry.order_number, order.number));
  // Same date precedence and revenue/receivable definitions as Finance.
  const dateOf = (entry: FinancialTransaction) => commercialDate(entry.paid_at || entry.due_date || entry.created_at);
  const byDate = new Map<string, FinancialTransaction[]>();
  transactions.forEach(entry => { const date = dateOf(entry); const bucket = byDate.get(date) || []; bucket.push(entry); byDate.set(date, bucket); });
  const chart = Array.from({ length: days }, (_, index) => {
    const date = new Date(`${start}T12:00:00-03:00`); date.setUTCDate(date.getUTCDate() + index);
    const key = commercialDate(date);
    const entries = byDate.get(key) || [];
    return { date: key, income: calculatePeriodRevenue(entries, () => true, findOrder), expense: calculatePeriodExpenses(entries, () => true, findOrder) };
  });
  const late = active.filter(order => order.deadline && commercialDate(order.deadline) < today && !['entregue', 'finalizado', 'expedicao'].includes(order.status));
  const productTotals = new Map<string, { id: string; name: string; quantity: number; total: number }>();
  active.filter(order => commercialDate(order.created_at) >= start && commercialDate(order.created_at) <= today).forEach(order => {
    (order.items || []).filter(item => item.product_id).forEach(item => { const row = productTotals.get(item.product_id) || { id: item.product_id, name: item.product_name, quantity: 0, total: 0 }; row.quantity += item.quantity; row.total += item.total_price; productTotals.set(item.product_id, row); });
  });
  return {
    today, timezone: 'America/Bahia', days,
    incomeToday: calculatePeriodRevenue(transactions, entry => dateOf(entry) === today, findOrder),
    incomeMonth: calculatePeriodRevenue(transactions, entry => dateOf(entry) >= `${today.slice(0, 7)}-01` && dateOf(entry) <= today, findOrder),
    receivable: calculateAccountsReceivable(active, transactions),
    payable: transactions.filter(entry => isExpenseTransaction(entry, findOrder(entry)) && normalizeFinanceStatus(entry.status) === 'pendente').reduce((sum, entry) => sum + entry.amount, 0),
    ordersToday: active.filter(order => commercialDate(order.created_at) === today).length,
    productionCount: input.production.filter(item => !['concluido', 'expedicao', 'entregue', 'finalizado'].includes(item.status) && byId.has(item.order_id) && isActiveOrder(byId.get(item.order_id))).length,
    delayedCount: late.length,
    overdueReceivables: active.filter(order => calculateOrderBalance(order, transactions) > 0 && transactions.some(entry => entry.order_id === order.id && entry.type === 'receita' && entry.status === 'pendente' && entry.due_date < today)).length,
    pendingQuotes: input.quotes.filter(quote => ['pendente', 'enviado'].includes(quote.status)).length,
    recentOrders: [...input.orders].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id)).slice(0, 6).map(order => ({ id: order.id, number: order.number, customer_name: order.customer_name, total_amount: order.total_amount, status: order.status, payment_status: order.payment_status })),
    recentCustomers: [...input.customers].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4).map(customer => ({ id: customer.id, name: customer.name, tags: customer.tags })),
    catalogLeads: input.quotes.filter(quote => quote.status === 'pendente' && (quote.customer_id.startsWith('cust-web-') || input.customers.find(customer => customer.id === quote.customer_id)?.tags?.includes('Catalogo Online'))).slice(0, 4).map(quote => ({ id: quote.id, name: quote.customer_name, number: quote.number })),
    catalogCustomers: input.customers.filter(customer => customer.tags?.includes('Catalogo Online') && !input.orders.some(order => order.customer_id === customer.id) && !input.quotes.some(quote => quote.customer_id === customer.id)).slice(0, 4).map(customer => ({ id: customer.id, name: customer.name })),
    bestsellers: [...productTotals.values()].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id)).slice(0, 4), chart
  };
}
export type CommercialOverview = ReturnType<typeof buildCommercialOverview>;

export function buildCustomerRanking(customers: Customer[], orders: Order[], period: string, now = new Date()) {
  const start = periodStart(period, now), today = commercialDate(now);
  const grouped = new Map<string, Order[]>();
  orders.filter(order => isActiveOrder(order) && commercialDate(order.created_at) >= start && commercialDate(order.created_at) <= today).forEach(order => { const group = grouped.get(order.customer_id) || []; group.push(order); grouped.set(order.customer_id, group); });
  return customers.map(customer => {
    const purchases = grouped.get(customer.id) || [];
    const total = purchases.reduce((sum, order) => sum + Number(order.total_amount), 0);
    const lastPurchase = purchases.map(order => order.created_at).sort().at(-1) || null;
    return { id: customer.id, name: customer.name, tags: customer.tags || [], personType: customer.corporate_additional_info?.person_type || (customer.document.replace(/\D/g, '').length > 11 ? 'juridica' : 'fisica'), b2b: customer.billing_type === 'faturado', blocked: customer.credit_status === 'bloqueado', total, count: purchases.length, average: purchases.length ? total / purchases.length : 0, lastPurchase };
  }).sort((a, b) => b.total - a.total || b.count - a.count || a.id.localeCompare(b.id)).map((row, index) => ({ ...row, position: index + 1 }));
}
export type CustomerRanking = ReturnType<typeof buildCustomerRanking>;
