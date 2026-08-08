import type { Product, ProductSaleMode } from '@/lib/dummy-data';
import type { PricingSelectedOption } from '@/lib/pricing';
import { formatCurrency } from '@/lib/pricing';
import { normalizeWhatsAppPhone, openWhatsAppUrl } from '@/lib/whatsapp';
import { renderWhatsAppTemplate } from '@/lib/whatsapp/template-engine';
import { getWhatsAppTemplateDefinition } from '@/lib/whatsapp/template-registry';

type WhatsAppSelectedOption = PricingSelectedOption & {
  group_name?: string;
};

export interface BuildWhatsAppOrderMessageInput {
  companyName?: string;
  productName: string;
  saleType?: string;
  pricingType?: Product['pricing_type'] | ProductSaleMode;
  quantity: number;
  dimensions?: {
    width?: number;
    height?: number;
    length?: number;
  };
  selectedOptions?: WhatsAppSelectedOption[];
  productionDays?: number;
  estimatedDeadline?: string;
  subtotal: number;
  customerName?: string;
  customerPhone?: string;
  notes?: string;
}

const saleTypeLabels: Partial<Record<Product['pricing_type'] | ProductSaleMode, string>> = {
  unidade: 'Unidade',
  volume: 'Preco por quantidade',
  m2: 'Metro quadrado',
  linear: 'Metro linear',
  width_height: 'Largura x Altura',
  pacote: 'Pacote / Kit',
  kit: 'Pacote / Kit',
  size_grid: 'Grade de tamanhos',
  custom: 'Produto personalizado'
};

const formatMeters = (value?: number) => {
  if (!value) return '';
  return `${(Number(value) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}cm`;
};

const formatOptions = (options: WhatsAppSelectedOption[] = []) => {
  if (options.length === 0) return '';

  return options
    .map((option) => {
      const label = option.name || option.option_name;
      return option.group_name ? `${option.group_name}: ${label}` : label;
    })
    .filter(Boolean)
    .join(' | ');
};

export const buildWhatsAppOrderMessage = ({
  companyName,
  productName,
  saleType,
  pricingType,
  quantity,
  dimensions,
  selectedOptions = [],
  productionDays = 0,
  estimatedDeadline,
  subtotal,
  customerName,
  customerPhone,
  notes
}: BuildWhatsAppOrderMessageInput) => {
  const resolvedSaleType = saleType || (pricingType ? saleTypeLabels[pricingType] : undefined) || 'Produto';
  const dimensionsText = dimensions?.width && dimensions?.height
    ? `${formatMeters(dimensions.width)} x ${formatMeters(dimensions.height)}`
    : '';
  const lengthText = dimensions?.length ? formatMeters(dimensions.length) : '';
  const optionsText = formatOptions(selectedOptions);
  const deadlineParts = [
    estimatedDeadline?.trim(),
    productionDays > 0 ? `+ ${productionDays} dia(s)` : ''
  ].filter(Boolean);

  const definition = getWhatsAppTemplateDefinition('store_product_request');
  if (!definition) return '';
  return renderWhatsAppTemplate(definition.defaultContent, definition, {
    empresa_nome: companyName,
    produto_nome: productName,
    tipo_venda: resolvedSaleType,
    quantidade: quantity,
    medidas: dimensionsText,
    metragem: lengthText,
    opcoes: optionsText,
    prazo: deadlineParts.join(' '),
    valor_total: formatCurrency(subtotal),
    cliente_nome: customerName?.trim(),
    cliente_telefone: customerPhone?.trim(),
    observacoes: notes?.trim()
  }).replace(/^(Empresa|Medidas|Metragem|Opções|Prazo|Cliente|Telefone|Observações):\s*\n/gm, '');
};

export const normalizeBrazilWhatsAppPhone = (phone: string) => {
  return normalizeWhatsAppPhone(phone);
};

export const openWhatsAppWithMessage = (phone: string, message: string) => {
  return openWhatsAppUrl(phone, message);
};
