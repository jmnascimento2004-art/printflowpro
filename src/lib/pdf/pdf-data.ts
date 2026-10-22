import type { SupabaseClient } from '@supabase/supabase-js';
import type { Company, Customer, FinancialTransaction, Order, OrderItem, Quote, QuoteItem, ProductionItem, Shipment } from '@/lib/dummy-data';
import { getActivePaymentTransactions, getActivePaymentsForOrder } from '@/lib/finance-rules';
import { requireDocumentPermissions } from './document-permissions';
import { areOrderNumbersEquivalent, formatOrderDisplayNumber, formatLegacyOrderNumber } from '@/lib/order-number';
import type { PdfRequestContext } from '@/lib/pdf/pdf-server-auth';

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
  internalNotes?: string;
  production?: ProductionItem[];
  shipments?: Shipment[];
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

async function loadCustomer(
  supabase: SupabaseClient,
  companyId: string,
  customerId?: string | null
) {
  if (!customerId) return null;

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .eq('company_id', companyId)
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

export async function loadQuotePdfData(id: string, context: PdfRequestContext): Promise<QuotePdfData | null> {
  const { supabase, access } = context;

  const { data: quoteRow, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', id)
    .eq('company_id', access.companyId)
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
    loadCompany(supabase, access.companyId),
    loadCustomer(supabase, access.companyId, quote.customer_id),
    loadPdfSettings(supabase, access.companyId)
  ]);

  return { quote, company, customer, settings };
}

async function loadOrderFinancialRecords(supabase: SupabaseClient, companyId: string, order: Order): Promise<FinancialTransaction[]> {
  const columns = 'id,company_id,order_id,order_number,type,amount,status,payment_method,paid_at,created_at,due_date,cancelled_at,reversed_at,reversal_of,entry_role,economic_kind';
  const numbers = [...new Set([order.number, formatOrderDisplayNumber(order.number), formatLegacyOrderNumber(order.number)].flatMap(number => [number, number.toLowerCase()]))];
  const read = async (legacy: boolean) => {
    const rows: FinancialTransaction[] = [];
    for (let offset = 0; ; offset += 1000) {
      let query = supabase.from('financial_transactions').select(columns).eq('company_id', companyId).eq('type', 'receita');
      query = legacy ? query.is('order_id', null).in('order_number', numbers) : query.eq('order_id', order.id);
      const { data, error } = await query.order('created_at', { ascending: true }).order('id').range(offset, offset + 999);
      if (error) throw error;
      rows.push(...((data || []) as FinancialTransaction[]));
      if (!data || data.length < 1000) return rows;
    }
  };
  return (await Promise.all([read(false), read(true)])).flat().map(row => ({ ...row, amount: Number(row.amount) }));
}

export async function loadOrderPdfData(id: string, context: PdfRequestContext, operational: 'production' | 'label' | 'protocol' | null = null): Promise<OrderPdfData | null> {
  const { supabase, access } = context;
  await requireDocumentPermissions(context, ['/orders', ...(operational === 'production' ? ['/production'] : operational ? ['/shipment'] : [])]);
  const identityColumns = 'id,company_id,customer_id,customer_name,number,status,deadline,created_at,delivery_type,delivery_address,updated_at';
  const { data: orderRow, error: orderError } = await supabase.from('orders')
    .select<string, Omit<Order, 'items'>>(operational ? identityColumns : `${identityColumns},total_amount,paid_amount,payment_status,shipping_cost,additional_services`)
    .eq('id', id).eq('company_id', access.companyId).maybeSingle();
  if (orderError) throw orderError;
  if (!orderRow) return null;
  const { data: itemRows, error: itemError } = await supabase.from('order_items')
    .select<string, OrderItemRow>(operational ? 'id,product_id,product_name,quantity,details' : 'id,product_id,product_name,quantity,unit_price,total_price,details')
    .eq('order_id', id).order('created_at', { ascending: true });
  if (itemError) throw itemError;
  const order = {
    ...orderRow, notes: '', total_amount: Number(orderRow.total_amount || 0),
    paid_amount: Number(orderRow.paid_amount || 0), shipping_cost: Number(orderRow.shipping_cost || 0),
    additional_services: (orderRow.additional_services || []).map((service: { id: string; name: string; quantity: number; unit_price: number; total_price: number }) => ({
      id: service.id, name: service.name, quantity: Number(service.quantity), unit_price: Number(service.unit_price), total_price: Number(service.total_price)
    })),
    items: ((itemRows || []) as OrderItemRow[]).map(item => ({ ...normalizeOrderItem(item), details: {
      width: item.details?.width, height: item.details?.height, length: item.details?.length,
      production_days: item.details?.production_days, production_time: item.details?.production_time,
      variant: item.details?.variant, color: item.details?.color,
      selected_options: Array.isArray(item.details?.selected_options) ? item.details.selected_options.filter(option => option && typeof option === 'object').map(option => ({ name: option.name, option_name: option.option_name, group_name: option.group_name })) : [],
      configuration_summary: item.details?.configuration_summary,
      configuration_snapshot: item.details?.configuration_snapshot ? {
        sale_mode: item.details.configuration_snapshot.sale_mode,
        material: item.details.configuration_snapshot.material, size: item.details.configuration_snapshot.size,
        colors: item.details.configuration_snapshot.colors, finishing: item.details.configuration_snapshot.finishing,
        production_time: item.details.configuration_snapshot.production_time,
        quantity_tier: 0, unit_price: 0, total_price: 0, display_label: ''
      } : undefined,
      pricing_snapshot: item.details?.pricing_snapshot ? {
        custom_fields: Array.isArray(item.details.pricing_snapshot.custom_fields) ? item.details.pricing_snapshot.custom_fields.flatMap(field =>
          field && typeof field === 'object' && typeof field.label === 'string' && ['string', 'number', 'boolean'].includes(typeof field.value)
            ? [{ label: field.label, value: field.value, type: field.type }] : []) : [],
        size: typeof item.details.pricing_snapshot.size === 'string' ? item.details.pricing_snapshot.size : undefined
      } : undefined,
      ...(operational === 'production' ? { notes: item.details?.notes } : {})
    } }))
  } as Order;
  const [companyResult, customerResult, settings, financialResult] = await Promise.all([
    supabase.from('companies').select('id,name,document,logo_url,logo_light,logo_dark,phone,email,cep,street,number,neighborhood,city,state,theme_color').eq('id', access.companyId).maybeSingle(),
    order.customer_id ? supabase.from('customers').select('id,company_id,name,document,phone,email,address').eq('id', order.customer_id).eq('company_id', access.companyId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    loadPdfSettings(supabase, access.companyId),
    operational ? Promise.resolve([] as FinancialTransaction[]) : loadOrderFinancialRecords(supabase, access.companyId, order)
  ]);
  if (companyResult.error) throw companyResult.error;
  if (customerResult.error) throw customerResult.error;
  if (!companyResult.data) throw new Error('Empresa não encontrada.');
  const company = companyResult.data as Company;
  // Logos are fetched by the server renderer: only this project's Storage or inline images are trusted.
  for (const key of ['logo_url', 'logo_light', 'logo_dark'] as const) {
    const value = company[key];
    if (!value) continue;
    try {
      const url = new URL(value);
      const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://invalid.local');
      if (!(url.protocol === 'https:' && url.origin === storage.origin && url.pathname.startsWith('/storage/v1/object/')) && !/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value)) company[key] = undefined;
    } catch { company[key] = undefined; }
  }
  const financial = financialResult;
  const matched = financial.filter(row => row.order_id === order.id || (!row.order_id && areOrderNumbersEquivalent(row.order_number, order.number)));
  order.paid_amount = Math.max(order.paid_amount, getActivePaymentsForOrder(order.id, matched, order.number, order).reduce((sum, row) => sum + row.amount, 0));
  const result: OrderPdfData = { order, company, customer: customerResult.data as Customer | null, settings,
    invoicedTransaction: matched.find(row => row.payment_method === 'faturado' && row.status === 'pendente' && !row.cancelled_at) || null };
  if (operational === 'production') {
    const { data, error } = await supabase.from('production_queue').select('id,order_id,order_item_id,product_name,status,responsible_name,started_at,finished_at').eq('company_id', access.companyId).eq('order_id', id);
    if (error) throw error;
    result.production = (data || []) as ProductionItem[];
    // Order-level notes have no technical/commercial classification; never put
    // possible discounts, negotiations or prices into the production document.
  }
  if (operational === 'protocol') {
    const { data, error } = await supabase.from('shipments').select('id,status,carrier,shipped_at,delivered_at').eq('company_id', access.companyId).eq('order_id', id);
    if (error) throw error;
    result.shipments = (data || []) as Shipment[];
  }
  return result;
}

export async function loadReceiptPdfData(transactionId: string, context: PdfRequestContext): Promise<ReceiptPdfData | null> {
  const { supabase, access } = context;
  await requireDocumentPermissions(context, ['/orders', '/financial']);

  const { data: transactionRow, error: transactionError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .eq('company_id', access.companyId)
    .eq('type', 'receita')
    .maybeSingle();

  if (transactionError) throw transactionError;
  if (!transactionRow) return null;

  const transaction = {
    ...(transactionRow as FinancialTransaction),
    amount: Number(transactionRow.amount || 0)
  } as FinancialTransaction;

  if (!transaction.order_id) {
    if (!transaction.order_number) return null;
    const numbers = [...new Set([transaction.order_number, formatOrderDisplayNumber(transaction.order_number), formatLegacyOrderNumber(transaction.order_number)])];
    const { data, error } = await supabase.from('orders').select('id').eq('company_id', access.companyId).in('number', numbers).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    transaction.order_id = String(data.id);
  }

  const orderData = await loadOrderPdfData(transaction.order_id, context);
  if (!orderData) return null;

  const paidRows = await loadOrderFinancialRecords(supabase, access.companyId, orderData.order);

  if (!getActivePaymentTransactions([transaction], orderData.order).length) return null;

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
      const matchesOrder = row.order_id === transaction.order_id || (!row.order_id && areOrderNumbersEquivalent(row.order_number, orderData.order.number));
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
