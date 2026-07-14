import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Company, Customer, FinancialTransaction, Order, OrderItem, Quote, QuoteItem } from '@/lib/dummy-data';
import { getActivePaymentTransactions } from '@/lib/finance-rules';
import { areOrderNumbersEquivalent } from '@/lib/order-number';

type QuoteItemRow = QuoteItem & { quote_id?: string };
type OrderItemRow = OrderItem & { order_id?: string };

export type QuotePdfData = {
  quote: Quote;
  customer: Customer | null;
  company: Company;
  settings: PdfSettings;
};

export type OrderPdfData = {
  order: Order;
  customer: Customer | null;
  invoicedTransaction?: FinancialTransaction | null;
  company: Company;
  settings: PdfSettings;
};

export type ReceiptPdfData = OrderPdfData & {
  transaction: FinancialTransaction;
  paidBeforeReceipt: number;
  accumulatedPaid: number;
  pendingAmount: number;
};

export type PdfSettings = {
  footer_show_address?: boolean | null;
  company_address?: string | null;
};

function getSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Supabase credentials are missing for PDF generation.');
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      async getAll() {
        const cookieStore = await cookies();
        return cookieStore.getAll();
      },
      setAll() {
        // PDF routes only read the current session; they do not mutate auth cookies.
      }
    }
  });
}

function normalizeQuoteItem(item: QuoteItemRow): QuoteItem {
  const cleanItem = { ...item };
  delete (cleanItem as QuoteItemRow).quote_id;
  return {
    ...cleanItem,
    product_id: cleanItem.product_id || '',
    quantity: Number(cleanItem.quantity || 0),
    unit_price: Number(cleanItem.unit_price || 0),
    total_price: Number(cleanItem.total_price || 0)
  };
}

function normalizeOrderItem(item: OrderItemRow): OrderItem {
  const cleanItem = { ...item };
  delete (cleanItem as OrderItemRow).order_id;
  return {
    ...cleanItem,
    product_id: cleanItem.product_id || '',
    quantity: Number(cleanItem.quantity || 0),
    unit_price: Number(cleanItem.unit_price || 0),
    total_price: Number(cleanItem.total_price || 0),
    outsourced: Boolean(cleanItem.outsourced)
  };
}

async function loadCompany(supabase: SupabaseClient, companyId: string) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Empresa não encontrada para gerar PDF.');
  return data as Company;
}

async function loadCustomer(supabase: SupabaseClient, customerId?: string | null) {
  if (!customerId) return null;

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as Customer | null;
}

async function loadPdfSettings(supabase: SupabaseClient, companyId: string): Promise<PdfSettings> {
  const { data, error } = await supabase
    .from('settings')
    .select('footer_show_address, company_address')
    .eq('company_id', companyId)
    .maybeSingle();

  if (error) throw error;
  return (data || {}) as PdfSettings;
}

export async function loadQuotePdfData(id: string): Promise<QuotePdfData | null> {
  const supabase = getSupabaseServerClient();

  const { data: quoteRow, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (quoteError) throw quoteError;
  if (!quoteRow) return null;

  const { data: itemRows, error: itemError } = await supabase
    .from('quote_items')
    .select('*')
    .eq('quote_id', id)
    .order('created_at', { ascending: true });

  if (itemError) throw itemError;

  const quote = {
    ...(quoteRow as Omit<Quote, 'items'>),
    total_amount: Number(quoteRow.total_amount || 0),
    discount: Number(quoteRow.discount || 0),
    delivery_fee: Number(quoteRow.delivery_fee || 0),
    delivery_distance_km: Number(quoteRow.delivery_distance_km || 0),
    additional_services: quoteRow.additional_services || [],
    items: ((itemRows || []) as QuoteItemRow[]).map(normalizeQuoteItem)
  } as Quote;

  const [company, customer, settings] = await Promise.all([
    loadCompany(supabase, quote.company_id),
    loadCustomer(supabase, quote.customer_id),
    loadPdfSettings(supabase, quote.company_id)
  ]);

  return { quote, company, customer, settings };
}

export async function loadOrderPdfData(id: string): Promise<OrderPdfData | null> {
  const supabase = getSupabaseServerClient();

  const { data: orderRow, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!orderRow) return null;

  const { data: itemRows, error: itemError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });

  if (itemError) throw itemError;

  const order = {
    ...(orderRow as Omit<Order, 'items'>),
    total_amount: Number(orderRow.total_amount || 0),
    paid_amount: Number(orderRow.paid_amount || 0),
    shipping_cost: Number(orderRow.shipping_cost || 0),
    delivery_distance_km: Number(orderRow.delivery_distance_km || 0),
    additional_services: orderRow.additional_services || [],
    items: ((itemRows || []) as OrderItemRow[]).map(normalizeOrderItem)
  } as Order;

  const [
    company,
    customer,
    settings,
    invoicedTransactionRow
  ] = await Promise.all([
    loadCompany(supabase, order.company_id),
    loadCustomer(supabase, order.customer_id),
    loadPdfSettings(supabase, order.company_id),
    supabase
      .from('financial_transactions')
      .select('*')
      .eq('order_id', order.id)
      .eq('type', 'receita')
      .eq('payment_method', 'faturado')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (invoicedTransactionRow.error) throw invoicedTransactionRow.error;

  return {
    order,
    company,
    customer,
    settings,
    invoicedTransaction: invoicedTransactionRow.data
      ? {
          ...(invoicedTransactionRow.data as FinancialTransaction),
          amount: Number(invoicedTransactionRow.data.amount || 0)
        }
      : null
  };
}

export async function loadReceiptPdfData(transactionId: string): Promise<ReceiptPdfData | null> {
  const supabase = getSupabaseServerClient();

  const { data: transactionRow, error: transactionError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('type', 'receita')
    .maybeSingle();

  if (transactionError) throw transactionError;
  if (!transactionRow) return null;

  const transaction = {
    ...(transactionRow as FinancialTransaction),
    amount: Number(transactionRow.amount || 0)
  } as FinancialTransaction;

  if (!transaction.order_id) {
    throw new Error('Transacao sem pedido vinculado para gerar recibo.');
  }

  const orderData = await loadOrderPdfData(transaction.order_id);
  if (!orderData) return null;

  const { data: paidRows, error: paidError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('order_id', transaction.order_id)
    .eq('type', 'receita')
    .order('created_at', { ascending: true });

  if (paidError) throw paidError;

  const transactionDate = new Date(transaction.paid_at || transaction.created_at || Date.now()).getTime();
  const paidUntilReceipt = getActivePaymentTransactions([
    ...((paidRows || []) as FinancialTransaction[]),
    transaction
  ], orderData.order)
    .map((row) => ({
      ...row,
      amount: Number(row.amount || 0)
    }))
    .filter((row) => {
      const matchesOrder = row.order_id === transaction.order_id || areOrderNumbersEquivalent(row.order_number, transaction.order_number);
      if (!matchesOrder) return false;

      const rowDate = new Date(row.paid_at || row.created_at || Date.now()).getTime();
      return row.id === transaction.id || rowDate <= transactionDate;
    });

  const accumulatedPaid = paidUntilReceipt
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const paidBeforeReceipt = paidUntilReceipt
    .filter((row) => {
      if (row.id === transaction.id) return false;
      const rowDate = new Date(row.paid_at || row.created_at || Date.now()).getTime();
      return rowDate <= transactionDate;
    })
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const pendingAmount = Math.max(0, Number(orderData.order.total_amount || 0) - accumulatedPaid);

  return {
    ...orderData,
    transaction,
    paidBeforeReceipt,
    accumulatedPaid,
    pendingAmount
  };
}
