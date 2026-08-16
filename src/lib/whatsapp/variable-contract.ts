export const WHATSAPP_EVENT_KEYS = [
  'quote_proposal',
  'order_payment_pending',
  'production_status_changed',
  'store_product_request'
] as const;

export type WhatsAppEventKey = (typeof WHATSAPP_EVENT_KEYS)[number];
export type WhatsAppVariableValue = string | number | boolean | null;
export type WhatsAppResolvedVariables = Readonly<Record<string, WhatsAppVariableValue | undefined>>;

export interface WhatsAppStoreRequestContextInput {
  quantity?: unknown;
  dimensions?: unknown;
  selectedOptions?: unknown;
  configurationSnapshot?: unknown;
  productionDays?: unknown;
  estimatedDeadline?: unknown;
  customerName?: unknown;
  customerPhone?: unknown;
  notes?: unknown;
}

export type WhatsAppSystemMessageContext =
  | { eventKey: 'quote_proposal'; quoteId: string }
  | { eventKey: 'order_payment_pending'; orderId: string }
  | { eventKey: 'production_status_changed'; productionItemId: string }
  | { eventKey: 'store_product_request'; productId: string; request: WhatsAppStoreRequestContextInput };

export const LEGACY_WHATSAPP_TOKENS = [
  'chave_pix', 'chave_pix_rotulo', 'cliente_nome', 'cliente_telefone', 'empresa_nome',
  'medidas', 'metragem', 'observacoes', 'opcoes', 'orcamento_codigo', 'pedido_codigo',
  'prazo', 'produto_nome', 'quantidade', 'saldo_pendente', 'saudacao', 'seguranca_pix',
  'status_pedido', 'tipo_venda', 'validade_orcamento', 'valor_total'
] as const;

export type LegacyWhatsAppToken = (typeof LEGACY_WHATSAPP_TOKENS)[number];

export const COMPANY_CANONICAL_TOKENS = [
  'empresa.nome',
  'empresa.whatsapp',
  'empresa.telefone',
  'empresa.email',
  'empresa.pix_chave',
  'empresa.pix_tipo',
  'empresa.pix_titular',
  'empresa.banco'
] as const;

export const CUSTOMER_CANONICAL_TOKENS = [
  'cliente.nome',
  'cliente.nome_fantasia',
  'cliente.whatsapp',
  'cliente.email'
] as const;

export const PRODUCT_CANONICAL_TOKENS = [
  'produto.nome',
  'produto.descricao',
  'produto.categoria',
  'produto.imagem',
  'produto.tipo_venda',
  'produto.preco'
] as const;

export type WhatsAppCompanyCanonicalToken = (typeof COMPANY_CANONICAL_TOKENS)[number];
export type WhatsAppCustomerCanonicalToken = (typeof CUSTOMER_CANONICAL_TOKENS)[number];
export type WhatsAppProductCanonicalToken = (typeof PRODUCT_CANONICAL_TOKENS)[number];
export type WhatsAppCanonicalToken = WhatsAppCompanyCanonicalToken | WhatsAppCustomerCanonicalToken | WhatsAppProductCanonicalToken;
export type WhatsAppRegisteredToken = LegacyWhatsAppToken | WhatsAppCanonicalToken;

export const LEGACY_TOKEN_ALIASES = {
  empresa_nome: 'empresa.nome',
  chave_pix: 'empresa.pix_chave',
  cliente_nome: 'cliente.nome',
  cliente_telefone: 'cliente.whatsapp',
  produto_nome: 'produto.nome',
  tipo_venda: 'produto.tipo_venda'
} as const satisfies Partial<Record<LegacyWhatsAppToken, WhatsAppCanonicalToken>>;

const COMPANY_CONTACT_TOKENS = [
  'empresa.nome', 'empresa.whatsapp', 'empresa.telefone', 'empresa.email'
] as const;

export const COMPANY_TOKENS_BY_EVENT = {
  quote_proposal: COMPANY_CONTACT_TOKENS,
  order_payment_pending: COMPANY_CANONICAL_TOKENS,
  production_status_changed: COMPANY_CONTACT_TOKENS,
  store_product_request: COMPANY_CONTACT_TOKENS
} as const satisfies Record<WhatsAppEventKey, readonly WhatsAppCompanyCanonicalToken[]>;

export const CUSTOMER_TOKENS_BY_EVENT = {
  quote_proposal: CUSTOMER_CANONICAL_TOKENS,
  order_payment_pending: CUSTOMER_CANONICAL_TOKENS,
  production_status_changed: CUSTOMER_CANONICAL_TOKENS,
  store_product_request: []
} as const satisfies Record<WhatsAppEventKey, readonly WhatsAppCustomerCanonicalToken[]>;

export const PRODUCT_TOKENS_BY_EVENT = {
  quote_proposal: [],
  order_payment_pending: [],
  production_status_changed: [],
  store_product_request: PRODUCT_CANONICAL_TOKENS
} as const satisfies Record<WhatsAppEventKey, readonly WhatsAppProductCanonicalToken[]>;

export const EVENT_DOMAIN_LOADING_MAP = {
  quote_proposal: ['company', 'customer'],
  order_payment_pending: ['company', 'customer'],
  production_status_changed: ['company', 'customer'],
  store_product_request: ['company', 'product']
} as const;

export interface WhatsAppCompanyVariableSource {
  name: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface WhatsAppSettingsVariableSource {
  company_id: string;
  catalog_whatsapp: string | null;
  pix_key?: string | null;
  pix_key_type?: string | null;
  pix_beneficiary_name?: string | null;
  bank_name?: string | null;
}

export interface WhatsAppBusinessPhoneSource {
  company_id: string;
  country_code: string | null;
  business_phone: string | null;
}

export interface WhatsAppVariableResolutionResult {
  variables: Record<string, string>;
  missing: WhatsAppCompanyCanonicalToken[];
  metadataSanitized: {
    eventKey: WhatsAppEventKey;
    effectiveBusinessPhone: string;
    businessPhoneSource: 'business_phone' | 'catalog_whatsapp' | 'missing';
    queryCounts: { company: number; settings: number; whatsappSettings: number };
  };
}

const REGISTERED_TOKENS = new Set<string>([
  ...LEGACY_WHATSAPP_TOKENS,
  ...COMPANY_CANONICAL_TOKENS,
  ...CUSTOMER_CANONICAL_TOKENS,
  ...PRODUCT_CANONICAL_TOKENS
]);

export function isWhatsAppEventKey(value: string): value is WhatsAppEventKey {
  return (WHATSAPP_EVENT_KEYS as readonly string[]).includes(value);
}

export function isRegisteredWhatsAppToken(value: string): value is WhatsAppRegisteredToken {
  return REGISTERED_TOKENS.has(value);
}

export function resolveCanonicalWhatsAppToken(token: WhatsAppRegisteredToken): WhatsAppRegisteredToken {
  const aliases: Partial<Record<LegacyWhatsAppToken, WhatsAppCanonicalToken>> = LEGACY_TOKEN_ALIASES;
  return aliases[token as LegacyWhatsAppToken] || token;
}

export function isCompanyTokenAllowedForEvent(
  eventKey: WhatsAppEventKey,
  token: string
): token is WhatsAppCompanyCanonicalToken {
  return (COMPANY_TOKENS_BY_EVENT[eventKey] as readonly string[]).includes(token);
}
