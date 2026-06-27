import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Company, Customer, Order, OrderItem, Quote, QuoteItem } from '@/lib/dummy-data';

type QuoteItemRow = QuoteItem & { quote_id?: string };
type OrderItemRow = OrderItem & { order_id?: string };

export type QuotePdfData = {
  quote: Quote;
  customer: Customer | null;
  company: Company;
};

export type OrderPdfData = {
  order: Order;
  customer: Customer | null;
  company: Company;
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
  if (!data) throw new Error('Empresa nao encontrada para gerar PDF.');
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

  const [company, customer] = await Promise.all([
    loadCompany(supabase, quote.company_id),
    loadCustomer(supabase, quote.customer_id)
  ]);

  return { quote, company, customer };
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

  const [company, customer] = await Promise.all([
    loadCompany(supabase, order.company_id),
    loadCustomer(supabase, order.customer_id)
  ]);

  return { order, company, customer };
}
