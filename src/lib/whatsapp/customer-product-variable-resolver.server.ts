import 'server-only';

import { formatCurrency, getProductConfigurator, resolveProductPrice, type PricingConfig, type PricingType } from '@/lib/pricing';
import { getSupabaseAdminClient } from '@/lib/supabase/server-admin';
import { richTextToPlainText } from '@/lib/utils';
import { normalizeWhatsAppPhone } from './template-engine';
import {
  CUSTOMER_TOKENS_BY_EVENT,
  LEGACY_TOKEN_ALIASES,
  PRODUCT_TOKENS_BY_EVENT,
  isWhatsAppEventKey,
  type WhatsAppCustomerCanonicalToken,
  type WhatsAppEventKey,
  type WhatsAppProductCanonicalToken
} from './variable-contract';

type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

export interface WhatsAppCustomerVariableSource {
  id: string;
  company_id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  corporate_additional_info: unknown;
}

export interface WhatsAppProductVariableSource {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string | null;
  description: string | null;
  pricing_type: PricingType | string | null;
  sales_price: number | string | null;
  active: boolean | null;
  catalog_active: boolean | null;
  pricing_details: Record<string, unknown> | string | null;
  image_url: string | null;
  volume_pricing: unknown;
}

export interface WhatsAppCategoryVariableSource {
  id: string;
  company_id: string;
  name: string | null;
}

export interface WhatsAppEntityVariableDataSource {
  getCustomer(companyId: string, customerId: string): Promise<WhatsAppCustomerVariableSource | null>;
  getProduct(companyId: string, productId: string): Promise<WhatsAppProductVariableSource | null>;
  getCategory(companyId: string, categoryId: string): Promise<WhatsAppCategoryVariableSource | null>;
}

export interface WhatsAppCustomerResolutionContext {
  trustedCompanyId: string;
  customerId: string;
  eventKey: WhatsAppEventKey;
  existingCustomer?: WhatsAppCustomerVariableSource | null;
}

export interface WhatsAppProductResolutionContext {
  trustedCompanyId: string;
  productId: string;
  eventKey: WhatsAppEventKey;
  requireCatalogAvailability?: boolean;
  pricingConfig?: PricingConfig;
  selectedOptionsPresent?: boolean;
  existingProduct?: WhatsAppProductVariableSource | null;
  existingCategory?: WhatsAppCategoryVariableSource | null;
}

function controlledError(code: string): Error {
  return new Error(`WHATSAPP_ENTITY_RESOLUTION_${code}`);
}

export function isWhatsAppProductUnavailableError(error: unknown): boolean {
  return error instanceof Error && [
    'WHATSAPP_ENTITY_RESOLUTION_PRODUCT_NOT_FOUND',
    'WHATSAPP_ENTITY_RESOLUTION_PRODUCT_UNAVAILABLE'
  ].includes(error.message);
}

function clean(value: unknown, max = 1000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function assertContext(trustedCompanyId: string, entityId: string, eventKey: WhatsAppEventKey) {
  if (!trustedCompanyId || !entityId) throw controlledError('INVALID_CONTEXT');
  if (!isWhatsAppEventKey(eventKey)) throw controlledError('UNKNOWN_EVENT');
}

function addAliases(variables: Record<string, string>) {
  for (const [legacyToken, canonicalToken] of Object.entries(LEGACY_TOKEN_ALIASES)) {
    if (canonicalToken in variables) variables[legacyToken] = variables[canonicalToken];
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isPrivateOrReservedIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function parseIpv6Hextets(value: string): number[] | null {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
  const compressedParts = normalized.split('::');
  if (compressedParts.length > 2) return null;

  const parseSection = (section: string): number[] | null => {
    if (!section) return [];
    const hextets: number[] = [];
    for (const part of section.split(':')) {
      if (part.includes('.')) {
        const octets = part.split('.');
        if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return null;
        const numbers = octets.map(Number);
        if (numbers.some((octet) => octet < 0 || octet > 255)) return null;
        hextets.push((numbers[0] << 8) | numbers[1], (numbers[2] << 8) | numbers[3]);
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
      hextets.push(Number.parseInt(part, 16));
    }
    return hextets;
  };

  const left = parseSection(compressedParts[0]);
  const right = parseSection(compressedParts[1] || '');
  if (!left || !right) return null;
  if (compressedParts.length === 1) return left.length === 8 ? left : null;
  if (left.length + right.length > 7) return null;
  return [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
}

function getEmbeddedIpv4(hextets: number[]): string | null {
  const mapped = hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff;
  const compatible = hextets.slice(0, 6).every((part) => part === 0);
  const wellKnownNat64 = hextets[0] === 0x0064 && hextets[1] === 0xff9b &&
    hextets.slice(2, 6).every((part) => part === 0);
  const sixToFour = hextets[0] === 0x2002;
  if (!mapped && !compatible && !wellKnownNat64 && !sixToFour) return null;
  const high = sixToFour ? hextets[1] : hextets[6];
  const low = sixToFour ? hextets[2] : hextets[7];
  return [
    high >> 8,
    high & 0xff,
    low >> 8,
    low & 0xff
  ].join('.');
}

function isPrivateOrReservedHostname(value: string): boolean {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname) return true;
  if (hostname.includes(':')) {
    const hextets = parseIpv6Hextets(hostname);
    if (!hextets) return true;
    const first = hextets[0];
    const allZeroExceptLast = hextets.slice(0, 7).every((part) => part === 0);
    if (
      hextets.every((part) => part === 0) ||
      (allZeroExceptLast && hextets[7] === 1) ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xffc0) === 0xfec0 ||
      (first & 0xff00) === 0xff00 ||
      (first === 0x2001 && hextets[1] === 0x0db8)
    ) return true;
    const embeddedIpv4 = getEmbeddedIpv4(hextets);
    return Boolean(embeddedIpv4 && isPrivateOrReservedIpv4(embeddedIpv4));
  }
  if (!hostname.includes('.')) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  if (isPrivateOrReservedIpv4(hostname)) return true;
  return false;
}

function isSensitiveQueryParameter(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (normalized.startsWith('x-amz-') || normalized.startsWith('x-goog-')) return true;
  if (normalized === 'awsaccesskeyid') return true;
  const sensitiveSegments = new Set([
    'token', 'signature', 'sig', 'key', 'secret', 'expires', 'auth', 'policy',
    'credential', 'credentials', 'accesskey', 'authorization'
  ]);
  return normalized
    .split(/[\[\]._:=-]+/)
    .filter(Boolean)
    .some((segment) => sensitiveSegments.has(segment));
}

function safePublicUrl(value: unknown): string {
  const raw = clean(value, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || isPrivateOrReservedHostname(url.hostname)) return '';
    if ([...url.searchParams.keys()].some(isSensitiveQueryParameter)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function boundedPositiveNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 100000 ? number : undefined;
}

function boundedPositiveInteger(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 100000 ? number : undefined;
}

function rehydrateSizeGridPricingConfig(
  product: Parameters<typeof getProductConfigurator>[0],
  pricingConfig: PricingConfig
): { pricingConfig: PricingConfig; isSizeGrid: boolean; selectionRehydrated: boolean } {
  const configurator = getProductConfigurator(product);
  if (configurator?.sale_mode !== 'size_grid') {
    return { pricingConfig, isSizeGrid: false, selectionRehydrated: false };
  }

  const officialOptions = Array.isArray(configurator.size_options)
    ? configurator.size_options.filter((option) => (
        Boolean(option) &&
        typeof option === 'object' &&
        clean(option.name, 120).length > 0 &&
        typeof option.price_delta === 'number' &&
        Number.isFinite(option.price_delta) &&
        option.price_delta >= 0 &&
        typeof option.additional_days === 'number' &&
        Number.isFinite(option.additional_days) &&
        option.additional_days >= 0 &&
        typeof option.is_default === 'boolean'
      ))
    : [];
  const selectedOptions = Array.isArray(pricingConfig.customOptions?.selectedOptions)
    ? pricingConfig.customOptions.selectedOptions
    : [];
  const sizeSelections = selectedOptions.filter((selection) => (
    clean(selection?.group_name, 120).toLocaleLowerCase('pt-BR') === 'tamanho' &&
    !clean(selection?.group_id, 120)
  ));
  if (sizeSelections.length !== 1 || officialOptions.length === 0) {
    return { pricingConfig, isSizeGrid: true, selectionRehydrated: false };
  }

  const selectedName = clean(sizeSelections[0].name ?? sizeSelections[0].option_name, 120);
  const officialOption = officialOptions.find((option) => clean(option.name, 120) === selectedName);
  if (!officialOption) {
    return { pricingConfig, isSizeGrid: true, selectionRehydrated: false };
  }

  const canonicalSizeSelection = {
    name: officialOption.name,
    option_name: officialOption.name,
    group_name: 'Tamanho',
    price_delta: officialOption.price_delta,
    additional_days: officialOption.additional_days
  };
  return {
    pricingConfig: {
      ...pricingConfig,
      customOptions: {
        ...(pricingConfig.customOptions || {}),
        selectedOptions: selectedOptions.map((selection) => (
          selection === sizeSelections[0] ? canonicalSizeSelection : selection
        ))
      }
    },
    isSizeGrid: true,
    selectionRehydrated: true
  };
}

export function createStoreProductPricingContext(input: {
  quantity?: unknown;
  dimensions?: unknown;
  selectedOptions?: unknown;
  configurationSnapshot?: unknown;
}) {
  const quantity = boundedPositiveInteger(input.quantity) || 1;
  const dimensions = input.dimensions && typeof input.dimensions === 'object' && !Array.isArray(input.dimensions)
    ? input.dimensions as Record<string, unknown>
    : {};
  const snapshot = input.configurationSnapshot && typeof input.configurationSnapshot === 'object' && !Array.isArray(input.configurationSnapshot)
    ? input.configurationSnapshot as Record<string, unknown>
    : {};
  const variantSelection = {
    material: clean(snapshot.material, 120) || undefined,
    size: clean(snapshot.size, 120) || undefined,
    colors: clean(snapshot.colors, 120) || undefined,
    finishing: clean(snapshot.finishing, 120) || undefined
  };
  const selectedOptions = Array.isArray(input.selectedOptions)
    ? input.selectedOptions.slice(0, 50).flatMap((entry) => {
        if (!isPlainRecord(entry)) return [];
        const name = clean(entry.name ?? entry.option_name, 120);
        if (!name) return [];
        const groupId = clean(entry.group_id, 120);
        const groupName = clean(entry.group_name, 120);
        return [{
          name,
          option_name: name,
          ...(groupId ? { group_id: groupId } : {}),
          ...(groupName ? { group_name: groupName } : {})
        }];
      })
    : [];
  return {
    pricingConfig: {
      quantity,
      width: boundedPositiveNumber(dimensions.width),
      height: boundedPositiveNumber(dimensions.height),
      length: boundedPositiveNumber(dimensions.length),
      customOptions: { variantSelection, selectedOptions }
    } satisfies PricingConfig,
    selectedOptionsPresent: Array.isArray(input.selectedOptions) && input.selectedOptions.length > 0
  };
}

export function createSupabaseWhatsAppEntityDataSource(
  supabase: SupabaseAdminClient = getSupabaseAdminClient()
): WhatsAppEntityVariableDataSource {
  return {
    async getCustomer(companyId, customerId) {
      const result = await supabase.from('customers')
        .select('id,company_id,name,phone,email,corporate_additional_info')
        .eq('id', customerId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('CUSTOMER_QUERY_FAILED');
      return result.data as WhatsAppCustomerVariableSource | null;
    },
    async getProduct(companyId, productId) {
      const result = await supabase.from('products')
        .select('id,company_id,category_id,name,description,pricing_type,sales_price,active,catalog_active,pricing_details,image_url,volume_pricing')
        .eq('id', productId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('PRODUCT_QUERY_FAILED');
      return result.data as WhatsAppProductVariableSource | null;
    },
    async getCategory(companyId, categoryId) {
      const result = await supabase.from('categories')
        .select('id,company_id,name')
        .eq('id', categoryId)
        .eq('company_id', companyId)
        .maybeSingle();
      if (result.error) throw controlledError('CATEGORY_QUERY_FAILED');
      return result.data as WhatsAppCategoryVariableSource | null;
    }
  };
}

export async function resolveWhatsAppCustomerVariables(
  context: WhatsAppCustomerResolutionContext,
  dataSource?: WhatsAppEntityVariableDataSource
) {
  assertContext(context.trustedCompanyId, context.customerId, context.eventKey);
  const allowedTokens = CUSTOMER_TOKENS_BY_EVENT[context.eventKey];
  if (allowedTokens.length === 0) {
    return { variables: {}, missing: [], metadataSanitized: { eventKey: context.eventKey, queryCounts: { customer: 0 }, whatsappSource: 'missing' as const } };
  }
  const source = dataSource || createSupabaseWhatsAppEntityDataSource();
  const customer = context.existingCustomer === undefined
    ? await source.getCustomer(context.trustedCompanyId, context.customerId)
    : context.existingCustomer;
  const customerQueries = context.existingCustomer === undefined ? 1 : 0;
  if (!customer) throw controlledError('CUSTOMER_NOT_FOUND');
  if (customer.id !== context.customerId || customer.company_id !== context.trustedCompanyId) {
    throw controlledError('TENANT_MISMATCH');
  }

  const name = clean(customer.name, 200);
  if (!name) throw controlledError('CUSTOMER_NAME_MISSING');
  const additional = isPlainRecord(customer.corporate_additional_info)
    ? customer.corporate_additional_info
    : {};
  const configuredWhatsApp = normalizeWhatsAppPhone(clean(additional.whatsapp, 30));
  const fallbackPhone = normalizeWhatsAppPhone(customer.phone);
  const customerWhatsApp = configuredWhatsApp || fallbackPhone;
  const canonicalValues: Record<WhatsAppCustomerCanonicalToken, string> = {
    'cliente.nome': name,
    'cliente.nome_fantasia': clean(additional.nome_fantasia, 200),
    'cliente.whatsapp': customerWhatsApp,
    'cliente.email': clean(customer.email, 320)
  };
  const variables: Record<string, string> = {};
  const missing: WhatsAppCustomerCanonicalToken[] = [];
  for (const token of allowedTokens) {
    if (canonicalValues[token]) variables[token] = canonicalValues[token];
    else missing.push(token);
  }
  addAliases(variables);
  return {
    variables,
    missing,
    metadataSanitized: {
      eventKey: context.eventKey,
      queryCounts: { customer: customerQueries },
      whatsappSource: configuredWhatsApp ? 'customers.corporate_additional_info.whatsapp' as const : fallbackPhone ? 'customers.phone' as const : 'missing' as const
    }
  };
}

export async function resolveWhatsAppProductVariables(
  context: WhatsAppProductResolutionContext,
  dataSource?: WhatsAppEntityVariableDataSource
) {
  assertContext(context.trustedCompanyId, context.productId, context.eventKey);
  const allowedTokens = PRODUCT_TOKENS_BY_EVENT[context.eventKey];
  if (allowedTokens.length === 0) {
    return { variables: {}, missing: [], metadataSanitized: { eventKey: context.eventKey, queryCounts: { product: 0, category: 0 }, priceSource: 'missing' as const } };
  }
  const source = dataSource || createSupabaseWhatsAppEntityDataSource();
  const product = context.existingProduct === undefined
    ? await source.getProduct(context.trustedCompanyId, context.productId)
    : context.existingProduct;
  const productQueries = context.existingProduct === undefined ? 1 : 0;
  if (!product) throw controlledError('PRODUCT_NOT_FOUND');
  if (product.id !== context.productId || product.company_id !== context.trustedCompanyId) {
    throw controlledError('TENANT_MISMATCH');
  }
  if (context.requireCatalogAvailability && (!product.active || !product.catalog_active)) {
    throw controlledError('PRODUCT_UNAVAILABLE');
  }

  let category: WhatsAppCategoryVariableSource | null = null;
  let categoryQueries = 0;
  if (product.category_id) {
    category = context.existingCategory === undefined
      ? await source.getCategory(context.trustedCompanyId, product.category_id)
      : context.existingCategory;
    categoryQueries = context.existingCategory === undefined ? 1 : 0;
    if (category && (category.id !== product.category_id || category.company_id !== context.trustedCompanyId)) {
      throw controlledError('TENANT_MISMATCH');
    }
  }

  const pricingConfig = context.pricingConfig || {};
  const pricingProduct = {
    pricing_type: product.pricing_type as PricingType,
    sales_price: product.sales_price,
    pricing_details: product.pricing_details,
    volume_pricing: product.volume_pricing
  } as Parameters<typeof resolveProductPrice>[0];
  const sizeGridPricing = rehydrateSizeGridPricingConfig(pricingProduct, pricingConfig);
  const resolution = resolveProductPrice(pricingProduct, sizeGridPricing.pricingConfig);
  const pricingType = clean(product.pricing_type, 80).toLowerCase();
  const dimensionsComplete = pricingType === 'm2'
    ? Number(pricingConfig.width) > 0 && Number(pricingConfig.height) > 0
    : pricingType === 'linear'
      ? Number(pricingConfig.length ?? pricingConfig.width) > 0
      : true;
  const selectedOptionsTrusted = sizeGridPricing.isSizeGrid
    ? sizeGridPricing.selectionRehydrated && resolution.isComplete
    : !context.selectedOptionsPresent ||
      (resolution.pricingMode === 'matrix' && resolution.isComplete) ||
      (resolution.configurationSelectionValidated && resolution.selectedOptionsSnapshot.length > 0);
  const officialPrice = dimensionsComplete && selectedOptionsTrusted && resolution.canPurchase && resolution.totalPrice > 0
    ? formatCurrency(resolution.totalPrice)
    : '';
  const measurementKind: 'm2' | 'linear' | 'not_applicable' = pricingType === 'm2'
    ? 'm2'
    : pricingType === 'linear'
      ? 'linear'
      : 'not_applicable';
  const measurementValue = measurementKind !== 'not_applicable' &&
    dimensionsComplete &&
    selectedOptionsTrusted &&
    resolution.isComplete
      ? measurementKind === 'm2'
        ? resolution.breakdown.area
        : resolution.breakdown.length
      : 0;
  const canonicalValues: Record<WhatsAppProductCanonicalToken, string> = {
    'produto.nome': clean(product.name, 240),
    'produto.descricao': clean(richTextToPlainText(clean(product.description, 10000)), 2000),
    'produto.categoria': clean(category?.name, 240),
    'produto.imagem': safePublicUrl(product.image_url),
    'produto.tipo_venda': clean(product.pricing_type, 80),
    'produto.preco': officialPrice
  };
  const variables: Record<string, string> = {};
  const missing: WhatsAppProductCanonicalToken[] = [];
  for (const token of allowedTokens) {
    if (canonicalValues[token]) variables[token] = canonicalValues[token];
    else missing.push(token);
  }
  addAliases(variables);
  return {
    variables,
    missing,
    metadataSanitized: {
      eventKey: context.eventKey,
      queryCounts: { product: productQueries, category: categoryQueries },
      priceSource: officialPrice ? 'src/lib/pricing.ts' as const : 'missing' as const,
      pricingMode: resolution.pricingMode,
      measurement: {
        kind: measurementKind,
        value: Number.isFinite(measurementValue) && measurementValue > 0 ? measurementValue : 0,
        source: 'src/lib/pricing.ts#resolveProductPrice.breakdown' as const
      }
    }
  };
}
