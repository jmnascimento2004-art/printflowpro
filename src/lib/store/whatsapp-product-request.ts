import 'server-only';

export type StoreProductRequestInput = { productId?: unknown; quantity?: unknown; dimensions?: unknown; selectedOptions?: unknown; configurationSnapshot?: unknown; productionDays?: unknown; estimatedDeadline?: unknown; customerName?: unknown; customerPhone?: unknown; notes?: unknown };
export type StoreProductRequestContext = {
  companyName: string;
  product: { id: string; name: string; active: boolean; catalog_active: boolean; sales_price: number; pricing_type?: string | null } | null;
  productVariables?: Readonly<Record<string, string>>;
};

const REQUEST_KEYS = new Set([
  'productId', 'quantity', 'dimensions', 'selectedOptions', 'configurationSnapshot',
  'productionDays', 'estimatedDeadline', 'customerName', 'customerPhone', 'notes'
]);
const DIMENSION_KEYS = new Set(['width', 'height', 'length']);
const OPTION_KEYS = new Set(['name', 'option_name', 'group_id', 'group_name']);
const SNAPSHOT_KEYS = new Set(['material', 'size', 'colors', 'finishing']);
const boundedText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const positiveInteger = (value: unknown) => { const number = Number(value); return Number.isInteger(number) && number > 0 && number <= 100000 ? number : 1; };
const isPlainRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const hasOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>) => Object.keys(value).every((key) => allowed.has(key));
const validOptionalText = (value: unknown, max: number) => value === undefined || (typeof value === 'string' && value.length <= max);
const validOptionalPositiveNumber = (value: unknown) => value === undefined || (typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100000);

export function parseStoreProductRequestInput(value: unknown): StoreProductRequestInput | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, REQUEST_KEYS)) return null;
  if (typeof value.productId !== 'string' || !value.productId.trim() || value.productId.length > 128) return null;
  if (value.quantity !== undefined && (!Number.isInteger(value.quantity) || Number(value.quantity) <= 0 || Number(value.quantity) > 100000)) return null;
  if (!validOptionalText(value.estimatedDeadline, 120) || !validOptionalText(value.customerName, 120) ||
      !validOptionalText(value.customerPhone, 30) || !validOptionalText(value.notes, 500)) return null;
  if (value.productionDays !== undefined && (!Number.isInteger(value.productionDays) || Number(value.productionDays) < 0 || Number(value.productionDays) > 365)) return null;

  if (value.dimensions !== undefined) {
    if (!isPlainRecord(value.dimensions) || !hasOnlyKeys(value.dimensions, DIMENSION_KEYS)) return null;
    if (Object.values(value.dimensions).some((item) => !validOptionalPositiveNumber(item))) return null;
  }
  if (value.selectedOptions !== undefined) {
    if (!Array.isArray(value.selectedOptions) || value.selectedOptions.length > 30) return null;
    for (const option of value.selectedOptions) {
      if (!isPlainRecord(option) || !hasOnlyKeys(option, OPTION_KEYS)) return null;
      if (!validOptionalText(option.name, 120) || !validOptionalText(option.option_name, 120) ||
          !validOptionalText(option.group_id, 120) || !validOptionalText(option.group_name, 120) ||
          !(boundedText(option.name ?? option.option_name, 120))) return null;
    }
  }
  if (value.configurationSnapshot !== undefined) {
    if (!isPlainRecord(value.configurationSnapshot) || !hasOnlyKeys(value.configurationSnapshot, SNAPSHOT_KEYS)) return null;
    if (Object.values(value.configurationSnapshot).some((item) => !validOptionalText(item, 120))) return null;
  }
  return value;
}

function summarizeDimensions(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const row = value as Record<string, unknown>;
  const values = [row.width, row.height, row.length].map(Number);
  if (values.some((item) => Number.isFinite(item) && (item < 0 || item > 100000))) return '';
  return values.filter((item) => Number.isFinite(item) && item > 0).map((item) => `${item}cm`).join(' x ');
}
function summarizeOptions(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value.slice(0, 30).map((item) => {
    if (!item || typeof item !== 'object') return '';
    const row = item as Record<string, unknown>;
    const group = boundedText(row.group_name, 80);
    const name = boundedText(row.name || row.option_name, 120);
    return name ? `${group ? `${group}: ` : ''}${name}` : '';
  }).filter(Boolean).join(' | ').slice(0, 2000);
}

export function resolveStoreProductRequestVariables(
  input: StoreProductRequestInput,
  context: Pick<StoreProductRequestContext, 'companyName' | 'product' | 'productVariables'>
) {
  if (!context.product) throw new Error('STORE_PRODUCT_CONTEXT_MISSING');
  const quantity = positiveInteger(input.quantity);
  const days = Math.max(0, Math.min(365, Number(input.productionDays) || 0));
  const productName = context.productVariables?.produto_nome || context.product.name;
  const productSaleType = context.productVariables?.tipo_venda || boundedText(context.product.pricing_type, 80) || 'Unidade';
  return {
    ...context.productVariables,
    empresa_nome: context.companyName,
    produto_nome: productName,
    tipo_venda: productSaleType,
    quantidade: quantity,
    medidas: summarizeDimensions(input.dimensions),
    metragem: '',
    opcoes: summarizeOptions(input.selectedOptions),
    prazo: boundedText(input.estimatedDeadline, 120) || (days ? `${days} dia(s)` : ''),
    valor_total: context.productVariables?.['produto.preco'] || '',
    cliente_nome: boundedText(input.customerName, 120),
    cliente_telefone: boundedText(input.customerPhone, 30),
    observacoes: boundedText(input.notes, 500)
  };
}
