import 'server-only';
import { buildWhatsAppUrl, renderConfiguredWhatsAppTemplate } from '@/lib/whatsapp/template-engine';
import { getWhatsAppTemplateDefinition } from '@/lib/whatsapp/template-registry';
import type { WhatsAppSettings } from '@/lib/whatsapp/types';

export type StoreProductRequestInput = { productId?: unknown; quantity?: unknown; dimensions?: unknown; selectedOptions?: unknown; productionDays?: unknown; estimatedDeadline?: unknown; customerName?: unknown; customerPhone?: unknown; notes?: unknown };
export type StoreProductRequestContext = {
  companyName: string; publicPhone: string; effectiveBusinessPhone?: string;
  product: { id: string; name: string; active: boolean; catalog_active: boolean; sales_price: number; pricing_type?: string | null } | null;
  template: { content: string; active: boolean } | null;
  settings: Partial<WhatsAppSettings> | null;
};

const boundedText = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const positiveInteger = (value: unknown) => { const number = Number(value); return Number.isInteger(number) && number > 0 && number <= 100000 ? number : 1; };
const currency = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

export function resolveStoreProductRequest(input: StoreProductRequestInput, context: StoreProductRequestContext) {
  const definition = getWhatsAppTemplateDefinition('store_product_request');
  if (!definition) throw new Error('STORE_TEMPLATE_NOT_FOUND');
  if (!context.product || !context.product.active || !context.product.catalog_active) return { ok: false as const, status: 404, reason: 'PRODUCT_UNAVAILABLE' as const };
  const settings: WhatsAppSettings = { company_id: '', country_code: context.settings?.country_code || '55', business_phone: context.effectiveBusinessPhone || context.settings?.business_phone || context.publicPhone || null, signature: context.settings?.signature || null, open_mode: context.settings?.open_mode || 'auto', confirm_before_open: context.settings?.confirm_before_open ?? true, include_company_name: context.settings?.include_company_name ?? true };
  if (context.template?.active === false) return { ok: true as const, enabled: false as const, reason: 'MESSAGE_TEMPLATE_DISABLED' as const };
  const quantity = positiveInteger(input.quantity);
  const days = Math.max(0, Math.min(365, Number(input.productionDays) || 0));
  const message = renderConfiguredWhatsAppTemplate(context.template?.content || definition.defaultContent, definition, {
    empresa_nome: context.companyName, produto_nome: context.product.name, tipo_venda: boundedText(context.product.pricing_type, 80) || 'Unidade', quantidade: quantity,
    medidas: summarizeDimensions(input.dimensions), metragem: '', opcoes: summarizeOptions(input.selectedOptions),
    prazo: boundedText(input.estimatedDeadline, 120) || (days ? `${days} dia(s)` : ''), valor_total: currency(Math.max(0, Number(context.product.sales_price) || 0) * quantity),
    cliente_nome: boundedText(input.customerName, 120), cliente_telefone: boundedText(input.customerPhone, 30), observacoes: boundedText(input.notes, 500)
  }, settings);
  const href = buildWhatsAppUrl(settings.business_phone || context.publicPhone, message, settings);
  if (!href) return { ok: false as const, status: 422, reason: 'STORE_PHONE_UNAVAILABLE' as const };
  return { ok: true as const, enabled: true as const, href, message, confirmBeforeOpen: settings.confirm_before_open, openMode: settings.open_mode };
}
