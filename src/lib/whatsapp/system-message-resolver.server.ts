import 'server-only';

import type { FinancialTransaction, Order, ProductionItem } from '@/lib/dummy-data';
import { calculateOrderBalance } from '@/lib/finance-rules';
import { formatOrderDisplayNumber } from '@/lib/order-number';
import { formatCurrency } from '@/lib/pricing';
import { resolveStoreProductRequestVariables, type StoreProductRequestInput } from '@/lib/store/whatsapp-product-request';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { getPixWhatsAppPaymentInfo, getWhatsAppTimeGreeting } from '@/lib/utils';
import {
  createSupabaseWhatsAppEntityDataSource,
  createStoreProductPricingContext,
  resolveWhatsAppCustomerVariables,
  resolveWhatsAppProductVariables,
  type WhatsAppEntityVariableDataSource
} from './customer-product-variable-resolver.server';
import { formatWhatsAppProductionStatus } from './derived-values';
import {
  buildWhatsAppUrl,
  renderConfiguredWhatsAppTemplate,
  validateWhatsAppTemplate
} from './template-engine';
import { getWhatsAppTemplateDefinition } from './template-registry';
import type { WhatsAppSettings } from './types';
import {
  createSupabaseWhatsAppVariableDataSource,
  resolveWhatsAppCompanyVariables,
  type WhatsAppVariableDataSource
} from './variable-resolver.server';
import type {
  WhatsAppEventKey,
  WhatsAppResolvedVariables,
  WhatsAppSystemMessageContext
} from './variable-contract';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

export interface WhatsAppQuoteContextRow {
  id: string;
  company_id: string;
  customer_id: string | null;
  number: number | string;
  total_amount: number | string;
  valid_until: string;
}

export interface WhatsAppOrderContextRow {
  id: string;
  company_id: string;
  customer_id: string | null;
  customer_name: string;
  number: string;
  status: Order['status'];
  payment_status: Order['payment_status'];
  total_amount: number | string;
  paid_amount: number | string;
  created_at: string;
}

export interface WhatsAppProductionContextRow {
  id: string;
  company_id: string;
  order_id: string;
  order_number: string;
  product_name: string;
  status: ProductionItem['status'];
}

interface WhatsAppSystemTemplateRow {
  content: string;
  active: boolean;
}

type WhatsAppSettingsRow = WhatsAppSettings & { company_id: string };

export interface WhatsAppSystemMessageDataSource {
  getQuote(companyId: string, quoteId: string): Promise<WhatsAppQuoteContextRow | null>;
  getOrder(companyId: string, orderId: string): Promise<WhatsAppOrderContextRow | null>;
  getProductionItem(companyId: string, productionItemId: string): Promise<WhatsAppProductionContextRow | null>;
  getFinancialTransactions(companyId: string, orderId: string, orderNumber: string): Promise<FinancialTransaction[]>;
  getTemplate(companyId: string, eventKey: WhatsAppEventKey): Promise<WhatsAppSystemTemplateRow | null>;
  getWhatsAppSettings(companyId: string): Promise<WhatsAppSettingsRow | null>;
}

export interface ResolveSystemWhatsAppMessageDependencies {
  dataSource?: WhatsAppSystemMessageDataSource;
  companyDataSource?: WhatsAppVariableDataSource;
  entityDataSource?: WhatsAppEntityVariableDataSource;
  now?: Date;
}

export interface ResolveSystemWhatsAppMessageInput {
  trustedCompanyId: string;
  context: WhatsAppSystemMessageContext;
  draftContent?: string;
  allowMissingRecipient?: boolean;
}

export interface ResolvedSystemWhatsAppMessage {
  eventKey: WhatsAppEventKey;
  variables: Record<string, string>;
  renderedContent: string;
  recipient: string;
  recipientAvailable: boolean;
  testHref: string;
  contextSummary: string;
  active: boolean;
  missing: string[];
  metadata: {
    tenantValidated: true;
    templateSource: 'draft' | 'override' | 'registry';
    resolverDomains: string[];
    missingCount: number;
  };
}

const SYSTEM_CONTEXT_KEYS: Record<WhatsAppEventKey, readonly string[]> = {
  quote_proposal: ['eventKey', 'quoteId'],
  order_payment_pending: ['eventKey', 'orderId'],
  production_status_changed: ['eventKey', 'productionItemId'],
  store_product_request: ['eventKey', 'productId', 'request']
};

function controlledError(code: string): Error {
  return new Error(`WHATSAPP_SYSTEM_MESSAGE_RESOLUTION_${code}`);
}

function assertContext(trustedCompanyId: string, context: WhatsAppSystemMessageContext) {
  if (!trustedCompanyId || !context || !getWhatsAppTemplateDefinition(context.eventKey)) {
    throw controlledError('INVALID_CONTEXT');
  }
  const expected = SYSTEM_CONTEXT_KEYS[context.eventKey];
  const actual = Object.keys(context);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
    throw controlledError('INVALID_CONTEXT');
  }
  if (
    (context.eventKey === 'quote_proposal' && !context.quoteId) ||
    (context.eventKey === 'order_payment_pending' && !context.orderId) ||
    (context.eventKey === 'production_status_changed' && !context.productionItemId) ||
    (context.eventKey === 'store_product_request' && (
      !context.productId || !context.request || typeof context.request !== 'object' || Array.isArray(context.request)
    ))
  ) {
    throw controlledError('INVALID_CONTEXT');
  }
}

function assertTenantRow<T extends { id: string; company_id: string }>(
  row: T | null,
  expectedId: string,
  trustedCompanyId: string,
  entity: string
): T {
  if (!row) throw controlledError(`${entity}_NOT_FOUND`);
  if (row.id !== expectedId || row.company_id !== trustedCompanyId) {
    throw controlledError('TENANT_MISMATCH');
  }
  return row;
}

function formatDatePtBr(value: string): string {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

function selectAllowedVariables(
  eventKey: WhatsAppEventKey,
  values: WhatsAppResolvedVariables
): { variables: Record<string, string>; missing: string[] } {
  const definition = getWhatsAppTemplateDefinition(eventKey);
  if (!definition) throw controlledError('UNKNOWN_EVENT');
  const variables: Record<string, string> = {};
  const missing: string[] = [];
  for (const token of definition.allowedVariables) {
    const value = values[token];
    const normalized = value === null || value === undefined ? '' : String(value);
    if (normalized) variables[token] = normalized;
    else missing.push(token);
  }
  return { variables, missing };
}

function normalizeRenderSettings(companyId: string, row: WhatsAppSettingsRow | null): WhatsAppSettings {
  if (row && row.company_id !== companyId) throw controlledError('TENANT_MISMATCH');
  return {
    company_id: companyId,
    country_code: row?.country_code || '55',
    business_phone: row?.business_phone || null,
    signature: row?.signature || null,
    open_mode: row?.open_mode || 'auto',
    confirm_before_open: row?.confirm_before_open ?? true,
    include_company_name: row?.include_company_name ?? true
  };
}

interface ResolvedEventContext {
  variables: WhatsAppResolvedVariables;
  recipient: string;
  contextSummary: string;
  resolverDomains: string[];
}

export async function resolveWhatsAppQuoteContext(
  trustedCompanyId: string,
  quoteId: string,
  dataSource: WhatsAppSystemMessageDataSource,
  entityDataSource: WhatsAppEntityVariableDataSource
): Promise<ResolvedEventContext> {
  const quote = assertTenantRow(
    await dataSource.getQuote(trustedCompanyId, quoteId),
    quoteId,
    trustedCompanyId,
    'QUOTE'
  );
  if (!quote.customer_id) throw controlledError('CUSTOMER_ID_MISSING');
  const customer = await resolveWhatsAppCustomerVariables({
    trustedCompanyId,
    customerId: quote.customer_id,
    eventKey: 'quote_proposal'
  }, entityDataSource);
  return {
    recipient: customer.variables['cliente.whatsapp'] || '',
    contextSummary: `Orçamento #${quote.number} — ${customer.variables['cliente.nome'] || 'Cliente vinculado'}`,
    resolverDomains: ['quote', 'customer'],
    variables: {
      ...customer.variables,
      orcamento_codigo: quote.number,
      valor_total: formatCurrency(Number(quote.total_amount) || 0),
      validade_orcamento: formatDatePtBr(quote.valid_until)
    }
  };
}

export async function resolveWhatsAppOrderContext(
  trustedCompanyId: string,
  orderId: string,
  companyVariables: Readonly<Record<string, string>>,
  dataSource: WhatsAppSystemMessageDataSource,
  entityDataSource: WhatsAppEntityVariableDataSource,
  now?: Date
): Promise<ResolvedEventContext> {
  const order = assertTenantRow(
    await dataSource.getOrder(trustedCompanyId, orderId),
    orderId,
    trustedCompanyId,
    'ORDER'
  );
  if (!order.customer_id) throw controlledError('CUSTOMER_ID_MISSING');
  const [customer, transactions] = await Promise.all([
    resolveWhatsAppCustomerVariables({
      trustedCompanyId,
      customerId: order.customer_id,
      eventKey: 'order_payment_pending'
    }, entityDataSource),
    dataSource.getFinancialTransactions(trustedCompanyId, order.id, order.number)
  ]);
  const normalizedOrder: Order = {
    ...order,
    customer_id: order.customer_id,
    total_amount: Number(order.total_amount) || 0,
    paid_amount: Number(order.paid_amount) || 0,
    items: [],
    shipping_cost: 0,
    deadline: '',
    notes: ''
  };
  const balance = calculateOrderBalance(normalizedOrder, transactions);
  if (balance <= 0) throw controlledError('ORDER_NOT_PAYABLE');
  const pixKey = companyVariables['empresa.pix_chave'];
  if (!pixKey) throw controlledError('PIX_NOT_CONFIGURED');
  const pix = getPixWhatsAppPaymentInfo({
    key: pixKey,
    keyType: companyVariables['empresa.pix_tipo'],
    amount: balance,
    merchantName: companyVariables['empresa.nome'],
    beneficiaryName: companyVariables['empresa.pix_titular'],
    bankName: companyVariables['empresa.banco']
  });
  return {
    recipient: customer.variables['cliente.whatsapp'] || '',
    contextSummary: `Pedido ${formatOrderDisplayNumber(order.number)} — ${customer.variables['cliente.nome'] || 'Cliente vinculado'}`,
    resolverDomains: ['order', 'customer', 'finance', 'derived'],
    variables: {
      ...customer.variables,
      saudacao: getWhatsAppTimeGreeting(now),
      pedido_codigo: formatOrderDisplayNumber(order.number),
      saldo_pendente: formatCurrency(balance),
      chave_pix_rotulo: pix.label,
      chave_pix: pix.value,
      seguranca_pix: pix.securityText
    }
  };
}

export async function resolveWhatsAppProductionContext(
  trustedCompanyId: string,
  productionItemId: string,
  dataSource: WhatsAppSystemMessageDataSource,
  entityDataSource: WhatsAppEntityVariableDataSource,
  now?: Date
): Promise<ResolvedEventContext> {
  const production = assertTenantRow(
    await dataSource.getProductionItem(trustedCompanyId, productionItemId),
    productionItemId,
    trustedCompanyId,
    'PRODUCTION_ITEM'
  );
  const order = assertTenantRow(
    await dataSource.getOrder(trustedCompanyId, production.order_id),
    production.order_id,
    trustedCompanyId,
    'ORDER'
  );
  if (!order.customer_id) throw controlledError('CUSTOMER_ID_MISSING');
  const customer = await resolveWhatsAppCustomerVariables({
    trustedCompanyId,
    customerId: order.customer_id,
    eventKey: 'production_status_changed'
  }, entityDataSource);
  return {
    recipient: customer.variables['cliente.whatsapp'] || '',
    contextSummary: `${formatOrderDisplayNumber(production.order_number)} — ${production.product_name} — ${formatWhatsAppProductionStatus(production.status)}`,
    resolverDomains: ['production', 'order', 'customer', 'derived'],
    variables: {
      ...customer.variables,
      saudacao: getWhatsAppTimeGreeting(now),
      pedido_codigo: formatOrderDisplayNumber(order.number),
      produto_nome: production.product_name,
      status_pedido: formatWhatsAppProductionStatus(production.status)
    }
  };
}

export function createSupabaseWhatsAppSystemMessageDataSource(
  supabase: SupabaseAdminClient = getSupabaseAdminClient()
): WhatsAppSystemMessageDataSource {
  const financialProjection = 'id,company_id,order_id,order_number,type,category,amount,description,payment_method,status,due_date,paid_at,created_at';
  return {
    async getQuote(companyId, quoteId) {
      const result = await supabase.from('quotes')
        .select('id,company_id,customer_id,number,total_amount,valid_until')
        .eq('id', quoteId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('QUOTE_QUERY_FAILED');
      return result.data as WhatsAppQuoteContextRow | null;
    },
    async getOrder(companyId, orderId) {
      const result = await supabase.from('orders')
        .select('id,company_id,customer_id,customer_name,number,status,payment_status,total_amount,paid_amount,created_at')
        .eq('id', orderId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('ORDER_QUERY_FAILED');
      return result.data as WhatsAppOrderContextRow | null;
    },
    async getProductionItem(companyId, productionItemId) {
      const result = await supabase.from('production_queue')
        .select('id,company_id,order_id,order_number,product_name,status')
        .eq('id', productionItemId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('PRODUCTION_QUERY_FAILED');
      return result.data as WhatsAppProductionContextRow | null;
    },
    async getFinancialTransactions(companyId, orderId, orderNumber) {
      const [byId, byNumber] = await Promise.all([
        supabase.from('financial_transactions').select(financialProjection).eq('company_id', companyId).eq('order_id', orderId),
        supabase.from('financial_transactions').select(financialProjection).eq('company_id', companyId).eq('order_number', orderNumber)
      ]);
      if (byId.error || byNumber.error) throw controlledError('FINANCE_QUERY_FAILED');
      return [...(byId.data || []), ...(byNumber.data || [])] as FinancialTransaction[];
    },
    async getTemplate(companyId, eventKey) {
      const result = await supabase.from('whatsapp_message_templates')
        .select('content,active')
        .eq('company_id', companyId)
        .eq('event_key', eventKey)
        .maybeSingle();
      if (result.error) throw controlledError('TEMPLATE_QUERY_FAILED');
      return result.data as WhatsAppSystemTemplateRow | null;
    },
    async getWhatsAppSettings(companyId) {
      const result = await supabase.from('whatsapp_settings')
        .select('company_id,country_code,business_phone,signature,open_mode,confirm_before_open,include_company_name')
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('WHATSAPP_SETTINGS_QUERY_FAILED');
      return result.data as WhatsAppSettingsRow | null;
    }
  };
}

export async function resolveSystemWhatsAppMessage(
  input: ResolveSystemWhatsAppMessageInput,
  dependencies: ResolveSystemWhatsAppMessageDependencies = {}
): Promise<ResolvedSystemWhatsAppMessage> {
  assertContext(input.trustedCompanyId, input.context);
  const supabase = dependencies.dataSource && dependencies.companyDataSource && dependencies.entityDataSource
    ? null
    : getSupabaseAdminClient();
  const dataSource = dependencies.dataSource || createSupabaseWhatsAppSystemMessageDataSource(supabase!);
  const companyDataSource = dependencies.companyDataSource || createSupabaseWhatsAppVariableDataSource(supabase!);
  const entityDataSource = dependencies.entityDataSource || createSupabaseWhatsAppEntityDataSource(supabase!);
  const eventKey = input.context.eventKey;
  const [companyResolution, template, whatsappSettings] = await Promise.all([
    resolveWhatsAppCompanyVariables({
      companyId: input.trustedCompanyId,
      trustedCompanyId: input.trustedCompanyId,
      eventKey
    }, companyDataSource),
    dataSource.getTemplate(input.trustedCompanyId, eventKey),
    dataSource.getWhatsAppSettings(input.trustedCompanyId)
  ]);

  let recipient = '';
  let contextSummary = '';
  let resolverDomains: string[] = ['company'];
  let values: WhatsAppResolvedVariables = { ...companyResolution.variables };

  if (input.context.eventKey === 'quote_proposal') {
    const resolved = await resolveWhatsAppQuoteContext(
      input.trustedCompanyId, input.context.quoteId, dataSource, entityDataSource
    );
    recipient = resolved.recipient;
    contextSummary = resolved.contextSummary;
    resolverDomains = [...resolverDomains, ...resolved.resolverDomains];
    values = { ...values, ...resolved.variables };
  } else if (input.context.eventKey === 'order_payment_pending') {
    const resolved = await resolveWhatsAppOrderContext(
      input.trustedCompanyId,
      input.context.orderId,
      companyResolution.variables,
      dataSource,
      entityDataSource,
      dependencies.now
    );
    recipient = resolved.recipient;
    contextSummary = resolved.contextSummary;
    resolverDomains = [...resolverDomains, ...resolved.resolverDomains];
    values = { ...values, ...resolved.variables };
  } else if (input.context.eventKey === 'production_status_changed') {
    const resolved = await resolveWhatsAppProductionContext(
      input.trustedCompanyId,
      input.context.productionItemId,
      dataSource,
      entityDataSource,
      dependencies.now
    );
    recipient = resolved.recipient;
    contextSummary = resolved.contextSummary;
    resolverDomains = [...resolverDomains, ...resolved.resolverDomains];
    values = { ...values, ...resolved.variables };
  } else {
    const pricingContext = createStoreProductPricingContext(input.context.request);
    const product = await resolveWhatsAppProductVariables({
      trustedCompanyId: input.trustedCompanyId,
      productId: input.context.productId,
      eventKey,
      requireCatalogAvailability: true,
      pricingConfig: pricingContext.pricingConfig,
      selectedOptionsPresent: pricingContext.selectedOptionsPresent
    }, entityDataSource);
    const productVariables = product.variables as Record<string, string>;
    recipient = companyResolution.metadataSanitized.effectiveBusinessPhone;
    contextSummary = `Solicitação da loja — ${productVariables['produto.nome'] || 'Produto selecionado'}`;
    resolverDomains = [...resolverDomains, 'product', 'store_request', 'derived'];
    values = resolveStoreProductRequestVariables(input.context.request as StoreProductRequestInput, {
      companyName: companyResolution.variables['empresa.nome'] || '',
      product: {
        id: input.context.productId,
        name: productVariables['produto.nome'] || '',
        active: true,
        catalog_active: true,
        sales_price: 0,
        pricing_type: productVariables['produto.tipo_venda'] || null
      },
      productVariables
    });
  }

  const definition = getWhatsAppTemplateDefinition(eventKey);
  if (!definition) throw controlledError('UNKNOWN_EVENT');
  if (!recipient && !input.allowMissingRecipient) throw controlledError('RECIPIENT_MISSING');
  const selected = selectAllowedVariables(eventKey, values);
  const renderSettings = normalizeRenderSettings(input.trustedCompanyId, whatsappSettings);
  let content = template?.content || definition.defaultContent;
  let templateSource: ResolvedSystemWhatsAppMessage['metadata']['templateSource'] = template ? 'override' : 'registry';
  if (input.draftContent !== undefined) {
    const validation = validateWhatsAppTemplate(input.draftContent, definition);
    if (!validation.valid) throw controlledError('TEMPLATE_INVALID');
    content = validation.normalized;
    templateSource = 'draft';
  }
  const renderedContent = renderConfiguredWhatsAppTemplate(content, definition, selected.variables, renderSettings);
  const testHref = recipient ? buildWhatsAppUrl(recipient, renderedContent, renderSettings) : '';
  return {
    eventKey,
    variables: selected.variables,
    renderedContent,
    recipient,
    recipientAvailable: Boolean(recipient && testHref),
    testHref,
    contextSummary,
    active: template?.active ?? definition.enabledByDefault,
    missing: selected.missing,
    metadata: {
      tenantValidated: true,
      templateSource,
      resolverDomains,
      missingCount: selected.missing.length
    }
  };
}
